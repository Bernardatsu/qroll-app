import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { firebaseAuth, firestoreDb } from "@/integrations/firebase/config";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
} from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Camera,
  Square,
  AlertTriangle,
  RefreshCw,
  SwitchCamera,
  Lock,
  UserCheck,
  Clock,
  Search,
} from "lucide-react";
import { toast } from "sonner";

type SearchParams = { session?: string };

export const Route = createFileRoute("/_authenticated/scan")({
  head: () => ({ meta: [{ title: "Scanner — QRoll" }] }),
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    session: typeof s.session === "string" ? s.session : undefined,
  }),
  component: ScanPage,
});

const QR_REGION_ID = "qr-reader";

/** Crisp confirmation audio tone so the operator knows a code was captured immediately. */
let audioCtx: AudioContext | null = null;
function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    audioCtx ??= new Ctx();
    void audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = 1180;
    gain.gain.setValueAtTime(0.09, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.12);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch {
    /* audio is a nicety — never block scanning */
  }
}

/** Haptic feedback on mobile devices for smooth native feel */
function vibrate() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(60);
    }
  } catch {
    /* ignore */
  }
}

interface LastScanInfo {
  name: string;
  status: string;
  indexNumber?: string;
  time?: string;
  type: "success" | "warning" | "error" | "info";
}

function ScanPage() {
  const { session: sessionId } = Route.useSearch();
  const qc = useQueryClient();
  const [activeSession, setActiveSession] = useState<string | undefined>(sessionId);
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState<string>("Ready to scan");
  const [camError, setCamError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [manual, setManual] = useState("");
  const [lastScan, setLastScan] = useState<LastScanInfo | null>(null);
  const [, setProcessingCode] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const sessionRef = useRef<any>(null);
  const recentScans = useRef<Map<string, number>>(new Map());
  const inFlight = useRef<Set<string>>(new Set());

  const currentUid = firebaseAuth.currentUser?.uid;

  // Clear any residual offline scan storage from previous versions immediately
  useEffect(() => {
    try {
      localStorage.removeItem("qroll.offline.scans.v1");
    } catch {
      /* ignore */
    }
  }, []);

  const { data: openSessions } = useQuery({
    queryKey: ["open-sessions", currentUid],
    queryFn: async () => {
      if (!currentUid) return [];
      const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const [sessSnap, coursesSnap] = await Promise.all([
        getDocs(
          query(
            collection(firestoreDb, "attendance_sessions"),
            where("owner_id", "==", currentUid),
            where("status", "==", "OPEN"),
          ),
        ),
        getDocs(query(collection(firestoreDb, "courses"), where("owner_id", "==", currentUid))),
      ]);
      const courseMap = new Map(coursesSnap.docs.map((d) => [d.id, d.data() as any]));
      const list = await Promise.all(
        sessSnap.docs.map(async (d) => {
          const data = d.data() as any;
          if (data.starts_at && data.starts_at < cutoff) {
            try {
              await updateDoc(doc(firestoreDb, "attendance_sessions", d.id), {
                status: "CLOSED",
                ends_at: new Date().toISOString(),
              });
              data.status = "CLOSED";
            } catch {
              // ignore
            }
          }
          const c = courseMap.get(data.course_id);
          return {
            id: d.id,
            title: data.title,
            starts_at: data.starts_at,
            status: data.status,
            courses: c ? { code: c.code, title: c.title } : null,
          };
        }),
      );
      return list
        .filter((s) => s.status === "OPEN")
        .sort((a, b) => (b.starts_at || "").localeCompare(a.starts_at || ""));
    },
    enabled: !!currentUid,
  });

  const { data: session } = useQuery({
    queryKey: ["session", activeSession],
    queryFn: async () => {
      if (!activeSession) return null;
      const sSnap = await getDoc(doc(firestoreDb, "attendance_sessions", activeSession));
      if (!sSnap.exists()) return null;
      const data = { id: sSnap.id, ...(sSnap.data() as any) };
      if (data.course_id) {
        try {
          const cSnap = await getDoc(doc(firestoreDb, "courses", data.course_id));
          if (cSnap.exists()) {
            const cData = cSnap.data() as any;
            data.courses = { code: cData.code, title: cData.title, level: cData.level };
          }
        } catch {
          // ignore
        }
      }
      return data;
    },
    enabled: !!activeSession,
  });

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Lecturer's student roster cached in-memory for instant 0ms recognition
  const { data: allStudents } = useQuery({
    queryKey: ["lecturer-students-all", currentUid],
    queryFn: async () => {
      if (!currentUid) return [];
      const studSnap = await getDocs(
        query(collection(firestoreDb, "students"), where("owner_id", "==", currentUid)),
      );
      return studSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    },
    enabled: !!currentUid,
    staleTime: 5 * 60 * 1000,
  });

  // Pre-loaded registered students for the active course
  const { data: registeredStudentIds } = useQuery({
    queryKey: ["course-registrations-set", session?.course_id],
    queryFn: async () => {
      if (!session?.course_id) return new Set<string>();
      const regSnap = await getDocs(
        query(
          collection(firestoreDb, "course_registrations"),
          where("course_id", "==", session.course_id),
        ),
      );
      return new Set(regSnap.docs.map((d) => (d.data() as any).student_id).filter(Boolean));
    },
    enabled: !!session?.course_id,
  });

  // Real-time attendance records for today's session
  const { data: records } = useQuery({
    queryKey: ["records", activeSession, currentUid],
    queryFn: async () => {
      if (!activeSession || !currentUid) return [];
      const today = new Date().toISOString().slice(0, 10);
      const recSnap = await getDocs(
        query(
          collection(firestoreDb, "attendance_records"),
          where("session_id", "==", activeSession),
          where("session_date", "==", today),
        ),
      );
      const studentIds = Array.from(
        new Set(recSnap.docs.map((d) => (d.data() as any).student_id).filter(Boolean)),
      );
      const studentMap = new Map<string, any>();
      if (studentIds.length > 0) {
        const sSnap = await getDocs(
          query(collection(firestoreDb, "students"), where("owner_id", "==", currentUid)),
        );
        sSnap.docs.forEach((d) => {
          if (studentIds.includes(d.id)) {
            studentMap.set(d.id, d.data() as any);
          }
        });
      }
      const list = recSnap.docs.map((d) => {
        const data = d.data() as any;
        const st = studentMap.get(data.student_id);
        return {
          id: d.id,
          ...data,
          students: st ? { full_name: st.full_name, index_number: st.index_number } : null,
        };
      });
      return list.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    },
    enabled: !!activeSession && !!currentUid,
    refetchInterval: 3000,
  });

  // Fast set of student IDs already scanned today for instant duplicate detection
  const scannedTodayMap = useMemo(() => {
    const map = new Map<string, any>();
    if (records) {
      for (const r of records) {
        map.set(r.student_id, r);
      }
    }
    return map;
  }, [records]);

  const processQr = async (raw: string): Promise<boolean> => {
    const uuid = raw.trim();
    const sess = sessionRef.current;
    if (!uuid || !sess) return false;

    // Per-code lock so different students in a queue can be scanned back-to-back without camera stall
    if (inFlight.current.has(uuid)) return false;

    const now = Date.now();
    const last = recentScans.current.get(uuid) ?? 0;
    // Debounce duplicate scans of the exact same code within 2 seconds
    if (now - last < 2000) return false;

    recentScans.current.set(uuid, now);
    inFlight.current.add(uuid);
    setProcessingCode(uuid);

    // Audio & tactile feedback on capture
    beep();
    vibrate();

    const timestampStr = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    try {
      // 1. Instant in-memory lookup in lecturer's roster
      const normalized = uuid.toLowerCase();
      let student = (allStudents as any[])?.find(
        (s: any) =>
          s.qr_uuid === uuid ||
          s.index_number === uuid ||
          s.id === uuid ||
          (s.index_number && String(s.index_number).trim().toLowerCase() === normalized) ||
          (s.qr_uuid && String(s.qr_uuid).trim().toLowerCase() === normalized),
      );

      // 2. Global fallback search across student passes if not in local roster
      if (!student) {
        try {
          const globalByQr = await getDocs(
            query(collection(firestoreDb, "students"), where("qr_uuid", "==", uuid)),
          );
          const globalDoc = !globalByQr.empty
            ? globalByQr.docs[0]
            : (
                await getDocs(
                  query(collection(firestoreDb, "students"), where("index_number", "==", uuid)),
                )
              ).docs[0];

          if (globalDoc) {
            const gData = globalDoc.data() as any;
            student = { id: globalDoc.id, ...gData };
          }
        } catch (err) {
          console.warn("Global student QR fallback query:", err);
        }
      }

      if (!student) {
        setStatus(`Unknown QR: ${uuid.slice(0, 12)}…`);
        toast.error("Unknown QR code — student not recognized");
        setLastScan({
          name: "Unknown QR Code",
          indexNumber: uuid.slice(0, 16),
          status: "NOT RECOGNIZED",
          time: timestampStr,
          type: "error",
        });
        return false;
      }

      // 3. Course Level Validation
      const courseLevel = String(sess.courses?.level ?? "").trim();
      const studentLevel = String((student as any).level ?? "").trim();
      if (courseLevel && studentLevel && courseLevel !== studentLevel) {
        toast.error(
          `${student.full_name} is level ${studentLevel} — class is for level ${courseLevel}`,
        );
        setLastScan({
          name: student.full_name,
          indexNumber: student.index_number,
          status: `WRONG LEVEL (${studentLevel})`,
          time: timestampStr,
          type: "warning",
        });
        setStatus(`Wrong level: ${student.full_name}`);
        return true;
      }

      // 4. Auto-enroll student in course if not registered
      if (sess.course_id && registeredStudentIds && !registeredStudentIds.has(student.id)) {
        try {
          await addDoc(collection(firestoreDb, "course_registrations"), {
            course_id: sess.course_id,
            student_id: student.id,
            registered_at: new Date().toISOString(),
            owner_id: sess.owner_id || currentUid,
          });
          registeredStudentIds.add(student.id);
        } catch (regErr: any) {
          console.warn("Auto-register error:", regErr);
        }
      }

      const day = new Date().toISOString().slice(0, 10);
      const at = new Date().toISOString();
      const singleScanMode = (sess.mode ?? "single") === "single";

      // 5. Check attendance record for today
      let existingRecord = scannedTodayMap.get(student.id);
      if (!existingRecord) {
        // Double-check Firestore in case of recent write
        const recSnap = await getDocs(
          query(
            collection(firestoreDb, "attendance_records"),
            where("session_id", "==", sess.id),
            where("student_id", "==", student.id),
            where("session_date", "==", day),
          ),
        );
        if (!recSnap.empty) {
          existingRecord = { id: recSnap.docs[0].id, ...(recSnap.docs[0].data() as any) };
        }
      }

      if (!existingRecord) {
        // Record new attendance directly
        await addDoc(collection(firestoreDb, "attendance_records"), {
          session_id: sess.id,
          student_id: student.id,
          session_date: day,
          check_in_at: at,
          status: singleScanMode ? "PRESENT" : "IN_PROGRESS",
          scanned_by: currentUid ?? null,
          owner_id: sess.owner_id || currentUid,
          created_at: at,
        });

        const label = singleScanMode ? "Recorded" : "Checked In";
        toast.success(`✓ ${label}: ${student.full_name}`);
        setLastScan({
          name: student.full_name,
          indexNumber: student.index_number,
          status: singleScanMode ? "RECORDED" : "CHECKED IN",
          time: timestampStr,
          type: "success",
        });
        setStatus(`${label}: ${student.full_name}`);
      } else if (
        singleScanMode ||
        existingRecord.status === "PRESENT" ||
        existingRecord.check_out_at
      ) {
        // Student already recorded today
        toast.info(`Already recorded today: ${student.full_name}`);
        setLastScan({
          name: student.full_name,
          indexNumber: student.index_number,
          status: "ALREADY RECORDED",
          time: timestampStr,
          type: "info",
        });
        setStatus(`Already recorded: ${student.full_name}`);
      } else {
        // In/Out mode sign-out
        const checkIn = new Date(existingRecord.check_in_at!).getTime();
        const minsSince = Math.floor((Date.now() - checkIn) / 60000);
        if (minsSince < 30) {
          const wait = 30 - minsSince;
          toast.error(
            `Sign-out locked for ${student.full_name} — wait ${wait} more min${wait === 1 ? "" : "s"}`,
          );
          setLastScan({
            name: student.full_name,
            indexNumber: student.index_number,
            status: "SIGN-OUT LOCKED",
            time: timestampStr,
            type: "warning",
          });
          setStatus(`Sign-out locked: ${student.full_name}`);
          return true;
        }

        const duration = Math.max(1, minsSince);
        await updateDoc(doc(firestoreDb, "attendance_records", existingRecord.id), {
          check_out_at: at,
          duration_minutes: duration,
          status: "PRESENT",
        });

        toast.success(`✓ Signed out: ${student.full_name} (${duration}m)`);
        setLastScan({
          name: student.full_name,
          indexNumber: student.index_number,
          status: `SIGNED OUT (${duration}m)`,
          time: timestampStr,
          type: "success",
        });
        setStatus(`Signed out: ${student.full_name}`);
      }

      // Instantly refresh attendance table
      qc.invalidateQueries({ queryKey: ["records", activeSession, currentUid] });
      return true;
    } catch (err: any) {
      console.error("Scan processing error:", err);
      const errMsg = err?.message || "Failed to process scan";
      toast.error(errMsg);
      setStatus(`Error: ${errMsg}`);
      return false;
    } finally {
      inFlight.current.delete(uuid);
      setProcessingCode(null);
    }
  };

  const closeSession = async () => {
    if (!activeSession) return;
    if (!confirm("Close this session? Students will no longer be able to check in.")) return;
    await stopCamera();
    try {
      await updateDoc(doc(firestoreDb, "attendance_sessions", activeSession), {
        status: "CLOSED",
        ends_at: new Date().toISOString(),
      });
      toast.success("Session closed successfully");
      qc.invalidateQueries({ queryKey: ["open-sessions"] });
      qc.invalidateQueries({ queryKey: ["session", activeSession] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to close session");
    }
  };

  const stopCamera = async () => {
    try {
      if (scannerRef.current) {
        const state = scannerRef.current.getState?.();
        if (state === 2) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      }
    } catch {
      /* ignore */
    }
    scannerRef.current = null;
    setScanning(false);
    setStatus("Camera stopped");
  };

  const startCamera = async (preferredFacing?: "environment" | "user") => {
    if (!activeSession) {
      toast.error("Please select an active session first");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      const m =
        "Camera access is not supported on this browser. Please use Chrome or Safari over HTTPS.";
      setCamError(m);
      toast.error(m);
      return;
    }
    setCamError(null);
    setStatus("Starting camera…");

    try {
      await stopCamera();

      const el = document.getElementById(QR_REGION_ID);
      if (!el) throw new Error("Scanner container element missing");

      const facing = preferredFacing ?? facingMode;
      setFacingMode(facing);

      scannerRef.current = new Html5Qrcode(QR_REGION_ID, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });

      const config = {
        fps: 20, // 20 fps gives smooth rendering and fast detection without thermal throttling
        qrbox: (vw: number, vh: number) => {
          const edge = Math.floor(Math.min(vw, vh) * 0.72);
          return { width: Math.max(edge, 180), height: Math.max(edge, 180) };
        },
        aspectRatio: 1,
      };

      try {
        await scannerRef.current.start(
          { facingMode: { exact: facing } } as MediaTrackConstraints,
          config as any,
          (decoded) => void processQr(decoded),
          () => {},
        );
      } catch {
        // Fallback without exact constraint (many laptops/devices do not support exact facingMode)
        await scannerRef.current.start(
          { facingMode } as MediaTrackConstraints,
          config as any,
          (decoded) => void processQr(decoded),
          () => {},
        );
      }

      setScanning(true);
      setStatus("Scanning active — hold QR code in frame");
    } catch (e: any) {
      const msg =
        e?.name === "NotAllowedError"
          ? "Camera permission was denied. Please allow camera permissions in your browser bar."
          : e?.name === "NotFoundError"
            ? "No camera found on this device."
            : (e?.message ?? String(e));
      setCamError(msg);
      toast.error(msg);
      setStatus("Camera error");
      setScanning(false);
    }
  };

  const flipCamera = async () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    if (scanning) {
      await startCamera(next);
    }
  };

  useEffect(() => {
    return () => {
      void stopCamera();
    };
  }, []);

  useEffect(() => {
    if (!activeSession && openSessions?.length) {
      setActiveSession(openSessions[0].id);
    }
  }, [activeSession, openSessions]);

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (manual.trim()) {
      void processQr(manual.trim());
      setManual("");
    }
  };

  return (
    <AppShell>
      <div className="mb-4">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Attendance Scanner</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Instant high-speed QR verification for your active class session.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 md:gap-6">
        <Card className="border-border">
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Camera className="size-4 text-primary" />
              Live Scanner
            </CardTitle>
            {scanning && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Active
              </span>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Select Class Session
              </label>
              <Select
                value={activeSession ?? ""}
                onValueChange={(v) => {
                  void stopCamera();
                  setActiveSession(v);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick an open session" />
                </SelectTrigger>
                <SelectContent>
                  {(openSessions ?? []).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.courses?.code} — {s.title ?? new Date(s.starts_at).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {session && (
              <div className="rounded-lg border border-border/80 p-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-sm">
                    {session.courses?.code} — {session.courses?.title}
                  </div>
                  {session.courses?.level && (
                    <Badge variant="outline" className="text-xs">
                      Level {session.courses.level}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                  <Clock className="size-3" />
                  {new Date().toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  ·{" "}
                  {(session as any).mode === "inout"
                    ? "Sign In & Sign Out"
                    : "Single Scan Check-In"}
                </div>
              </div>
            )}

            {/* Video Viewport Container */}
            <div className="relative rounded-xl overflow-hidden bg-black mx-auto w-full max-w-sm aspect-square shadow-inner flex items-center justify-center">
              <div id={QR_REGION_ID} className="w-full h-full" />

              {!scanning && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-zinc-950/80 text-zinc-300">
                  <Camera className="size-12 stroke-[1.2] text-zinc-500 mb-3" />
                  <p className="text-sm font-medium">Camera is offline</p>
                  <p className="text-xs text-zinc-500 mt-1 max-w-[220px]">
                    Tap "Start Scanner" to open the camera and scan student passes
                  </p>
                </div>
              )}

              {scanning && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  {/* Subtle viewfinder reticle corners */}
                  <div className="relative w-3/4 h-3/4 border-2 border-emerald-500/40 rounded-2xl">
                    <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-emerald-400 rounded-tl"></div>
                    <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-emerald-400 rounded-tr"></div>
                    <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-emerald-400 rounded-bl"></div>
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-emerald-400 rounded-br"></div>
                  </div>
                </div>
              )}
            </div>

            <div className="text-xs text-center text-muted-foreground min-h-[1.25rem]">
              <span
                className={scanning ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}
              >
                {status}
              </span>
            </div>

            {/* Last Scan Confirmation Banner */}
            {lastScan && (
              <div
                className={`rounded-lg border p-3 text-sm transition-all animate-in fade-in-50 duration-200 ${
                  lastScan.type === "success"
                    ? "border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200"
                    : lastScan.type === "warning"
                      ? "border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200"
                      : lastScan.type === "info"
                        ? "border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20 text-blue-900 dark:text-blue-200"
                        : "border-rose-500/30 bg-rose-50/50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    <UserCheck className="size-4 shrink-0" />
                    {lastScan.name}
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] uppercase font-bold tracking-wider ${
                      lastScan.type === "success"
                        ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                        : lastScan.type === "warning"
                          ? "border-amber-500/40 text-amber-700 dark:text-amber-300"
                          : lastScan.type === "info"
                            ? "border-blue-500/40 text-blue-700 dark:text-blue-300"
                            : "border-rose-500/40 text-rose-700 dark:text-rose-300"
                    }`}
                  >
                    {lastScan.status}
                  </Badge>
                </div>
                {(lastScan.indexNumber || lastScan.time) && (
                  <div className="text-xs opacity-75 mt-1 flex items-center justify-between font-mono">
                    <span>{lastScan.indexNumber}</span>
                    <span>{lastScan.time}</span>
                  </div>
                )}
              </div>
            )}

            {camError && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs p-3 flex gap-2">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium">Camera could not start</div>
                  <div className="opacity-80 mt-0.5">{camError}</div>
                </div>
              </div>
            )}

            {/* Scanner Controls */}
            <div className="flex gap-2">
              {!scanning ? (
                <Button
                  onClick={() => startCamera()}
                  className="flex-1 font-medium"
                  disabled={!activeSession}
                >
                  <Camera className="size-4 mr-2" />
                  Start Scanner
                </Button>
              ) : (
                <Button onClick={stopCamera} variant="destructive" className="flex-1 font-medium">
                  <Square className="size-4 mr-2" />
                  Stop Scanner
                </Button>
              )}
              {scanning && (
                <>
                  <Button variant="outline" onClick={flipCamera} title="Switch Front/Back Camera">
                    <SwitchCamera className="size-4" />
                  </Button>
                  <Button variant="outline" onClick={() => startCamera()} title="Reset Camera">
                    <RefreshCw className="size-4" />
                  </Button>
                </>
              )}
              {activeSession && (
                <Button
                  variant="outline"
                  onClick={closeSession}
                  title="Close Session"
                  className="text-destructive hover:bg-destructive/10"
                >
                  <Lock className="size-4" />
                </Button>
              )}
            </div>

            {/* Manual Index Entry Fallback */}
            <form onSubmit={submitManual} className="flex gap-2 pt-3 border-t">
              <div className="relative flex-1">
                <Search className="size-3.5 absolute left-2.5 top-3 text-muted-foreground" />
                <Input
                  placeholder="Index # or QR UUID fallback..."
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  className="pl-8 text-sm"
                />
              </div>
              <Button type="submit" variant="secondary" disabled={!manual.trim()}>
                Mark Present
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Real-time Today's Attendance Roster */}
        <Card className="border-border flex flex-col">
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base font-semibold">Today's Attendance</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Real-time verified check-ins for this session
              </p>
            </div>
            <Badge variant="secondary" className="font-mono text-xs">
              {records?.length ?? 0} {records?.length === 1 ? "student" : "students"}
            </Badge>
          </CardHeader>
          <CardContent className="p-0 flex-1 flex flex-col">
            <div className="divide-y divide-border max-h-[620px] overflow-y-auto flex-1">
              {(records ?? []).map((r: any) => (
                <div
                  key={r.id}
                  className="p-3.5 flex items-center justify-between hover:bg-muted/30 transition-colors"
                >
                  <div>
                    <div className="font-medium text-sm text-foreground">
                      {r.students?.full_name ?? "Student"}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">
                      {r.students?.index_number ?? r.student_id}
                    </div>
                  </div>
                  <div className="text-right">
                    {r.status === "PRESENT" && (
                      <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                        <CheckCircle2 className="size-3.5 mr-1" />
                        SCANNED{r.duration_minutes ? ` · ${r.duration_minutes}m` : ""}
                      </span>
                    )}
                    {r.status === "IN_PROGRESS" && (
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/40 px-2 py-0.5 rounded-full">
                        SIGNED IN
                      </span>
                    )}
                    {r.check_in_at && (
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        {new Date(r.check_in_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {!records?.length && (
                <div className="py-16 text-center text-sm text-muted-foreground flex flex-col items-center justify-center">
                  <UserCheck className="size-8 text-muted-foreground/40 mb-2" />
                  <p className="font-medium">No students checked in yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1 max-w-xs">
                    Start the scanner or enter index numbers manually to record attendance.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
