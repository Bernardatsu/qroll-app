import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
import {
  CheckCircle2,
  Camera,
  Square,
  AlertTriangle,
  RefreshCw,
  SwitchCamera,
  Lock,
  WifiOff,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { clearQueue, isOnline, listQueued, queueScan, removeQueued } from "@/lib/offline-queue";

type Search = { session?: string };

export const Route = createFileRoute("/_authenticated/scan")({
  head: () => ({ meta: [{ title: "Scanner — QRoll" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    session: typeof s.session === "string" ? s.session : undefined,
  }),
  component: ScanPage,
});

const QR_REGION_ID = "qr-reader";

/** Short confirmation tone so the operator knows a code was captured. */
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

function ScanPage() {
  const { session: sessionId } = Route.useSearch();
  const qc = useQueryClient();
  const [activeSession, setActiveSession] = useState<string | undefined>(sessionId);
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState<string>("Idle");
  const [camError, setCamError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [manual, setManual] = useState("");
  const [lastScan, setLastScan] = useState<{ name: string; status: string } | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const sessionRef = useRef<any>(null);
  const recentScans = useRef<Map<string, number>>(new Map());
  const inFlight = useRef<Set<string>>(new Set());
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const currentUid = firebaseAuth.currentUser?.uid;

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

  // Fast in-memory cache for instant student recognition during continuous high-speed scanning
  const { data: cachedStudents } = useQuery({
    queryKey: ["session-students-cache", session?.course_id, currentUid],
    queryFn: async () => {
      if (!session?.course_id || !currentUid) return [];
      const regSnap = await getDocs(
        query(
          collection(firestoreDb, "course_registrations"),
          where("course_id", "==", session.course_id),
        ),
      );
      const studentIds = regSnap.docs.map((d) => (d.data() as any).student_id).filter(Boolean);
      if (studentIds.length === 0) return [];
      const studSnap = await getDocs(
        query(collection(firestoreDb, "students"), where("owner_id", "==", currentUid)),
      );
      return studSnap.docs
        .filter((d) => studentIds.includes(d.id))
        .map((d) => ({ id: d.id, ...(d.data() as any) }));
    },
    enabled: !!session?.course_id && !!currentUid,
  });

  const processQr = async (
    raw: string,
    opts?: { at?: string; replay?: boolean },
  ): Promise<boolean> => {
    const uuid = raw.trim();
    const sess = sessionRef.current;
    if (!uuid || !sess) return false;
    const replay = opts?.replay === true;
    // Per-code lock (not a global lock) so a queue of students can be scanned
    // back-to-back without the camera stalling on the previous student.
    if (!replay && inFlight.current.has(uuid)) return false;
    const now = Date.now();
    if (!replay) {
      const last = recentScans.current.get(uuid) ?? 0;
      if (now - last < 2500) return false;
      recentScans.current.set(uuid, now);
      inFlight.current.add(uuid);
      beep();
    }

    // Fast in-memory match: zero-latency feedback for registered students
    const localMatch = (cachedStudents as any[])?.find(
      (s: any) => s.qr_uuid === uuid || s.index_number === uuid,
    );

    // No network? Keep the scan locally and replay it when we're back online.
    if (!replay && !isOnline()) {
      queueScan(sess.id, uuid);
      setPending(listQueued().length);
      setLastScan({
        name: localMatch?.full_name ?? uuid.slice(0, 14) + "…",
        status: "SAVED OFFLINE",
      });
      setStatus(`Offline — saved ${localMatch?.full_name ?? "scan"}`);
      toast.message("Offline — scan saved on this device");
      inFlight.current.delete(uuid);
      return true;
    }

    const at = opts?.at ?? new Date().toISOString();
    const notify = {
      error: (m: string) => !replay && toast.error(m),
      success: (m: string) => !replay && toast.success(m),
      message: (m: string) => !replay && toast.message(m),
    };
    try {
      // Try from memory first, otherwise query Firestore
      let student = localMatch;
      if (!student) {
        if (!currentUid) {
          notify.error("User session expired. Please sign in again.");
          return true;
        }
        const studSnap = await getDocs(
          query(collection(firestoreDb, "students"), where("owner_id", "==", currentUid)),
        );
        const match = studSnap.docs.find((d) => {
          const sData = d.data() as any;
          return sData.qr_uuid === uuid || sData.index_number === uuid || d.id === uuid;
        });
        if (match) {
          student = { id: match.id, ...(match.data() as any) };
        } else {
          // Universal QR Fallback: Search globally across all student passes
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
              // Check if current lecturer has this student under their own roster by index number
              const lecturerMatch = studSnap.docs.find((d) => {
                const sData = d.data() as any;
                return (
                  sData.index_number &&
                  gData.index_number &&
                  String(sData.index_number).trim().toLowerCase() ===
                    String(gData.index_number).trim().toLowerCase()
                );
              });

              if (lecturerMatch) {
                student = { id: lecturerMatch.id, ...(lecturerMatch.data() as any) };
                // Keep qr_uuid synchronized on lecturer's copy
                if (lecturerMatch.data()?.qr_uuid !== uuid && gData.qr_uuid === uuid) {
                  updateDoc(doc(firestoreDb, "students", lecturerMatch.id), {
                    qr_uuid: uuid,
                  }).catch(() => {});
                }
              } else {
                student = { id: globalDoc.id, ...gData };
              }
            }
          } catch (err) {
            console.warn("Global student QR fallback query:", err);
          }
        }
      }
      if (!student) {
        setStatus(`Unknown QR: ${uuid.slice(0, 12)}…`);
        notify.error("Unknown QR code");
        return true; // not a network problem — don't keep retrying
      }

      // A course created for one class/level cannot be used by another level
      const courseLevel = String(sess.courses?.level ?? "").trim();
      const studentLevel = String((student as any).level ?? "").trim();
      if (courseLevel && studentLevel && courseLevel !== studentLevel) {
        notify.error(
          `${student.full_name} is level ${studentLevel} — this class is for level ${courseLevel} only`,
        );
        setLastScan({ name: student.full_name, status: "WRONG LEVEL" });
        setStatus(`Wrong level: ${student.full_name}`);
        return true;
      }

      const regSnap = await getDocs(
        query(
          collection(firestoreDb, "course_registrations"),
          where("course_id", "==", sess.course_id),
          where("student_id", "==", student.id),
        ),
      );
      if (regSnap.empty) {
        // Auto-enroll the student in this course so the scan goes through
        try {
          await addDoc(collection(firestoreDb, "course_registrations"), {
            course_id: sess.course_id,
            student_id: student.id,
            registered_at: new Date().toISOString(),
            owner_id: sess.owner_id || currentUid,
          });
          notify.message(`Auto-registered ${student.full_name} for this course`);
        } catch (regErr: any) {
          notify.error(`Could not auto-register ${student.full_name}: ${regErr.message}`);
          setStatus(`Registration failed: ${student.full_name}`);
          return false;
        }
      }

      const day = at.slice(0, 10);
      const singleScanMode = (sess.mode ?? "single") === "single";

      const recSnap = await getDocs(
        query(
          collection(firestoreDb, "attendance_records"),
          where("session_id", "==", sess.id),
          where("student_id", "==", student.id),
          where("session_date", "==", day),
        ),
      );
      const existingDoc = recSnap.docs[0];
      const existing = existingDoc ? { id: existingDoc.id, ...(existingDoc.data() as any) } : null;

      if (!existing) {
        try {
          await addDoc(collection(firestoreDb, "attendance_records"), {
            session_id: sess.id,
            student_id: student.id,
            session_date: day,
            check_in_at: at,
            status: singleScanMode ? "PRESENT" : "IN_PROGRESS",
            scanned_by: currentUid ?? null,
            owner_id: sess.owner_id || currentUid,
            created_at: new Date().toISOString(),
          });
        } catch (error: any) {
          notify.error(error.message);
          setStatus(`Error: ${error.message}`);
          return false;
        }
        const label = singleScanMode ? "Recorded" : "Checked in";
        notify.success(`✓ ${label}: ${student.full_name}`);
        setLastScan({
          name: student.full_name,
          status: singleScanMode ? "RECORDED" : "CHECKED IN",
        });
        setStatus(`${label}: ${student.full_name}`);
      } else if (singleScanMode || existing.status === "PRESENT" || existing.check_out_at) {
        notify.message(`Already recorded today: ${student.full_name}`);
        setLastScan({ name: student.full_name, status: "ALREADY RECORDED" });
        setStatus(`Already recorded today: ${student.full_name}`);
      } else {
        const checkIn = new Date(existing.check_in_at!).getTime();
        const minsSince = Math.floor((Date.parse(at) - checkIn) / 60000);
        if (minsSince < 30) {
          const wait = 30 - minsSince;
          notify.error(
            `Sign-out not allowed yet for ${student.full_name} — ${wait} more minute${wait === 1 ? "" : "s"}`,
          );
          setLastScan({ name: student.full_name, status: "SIGN-OUT LOCKED" });
          setStatus(`Sign-out locked for ${student.full_name}`);
          return true;
        }
        const duration = Math.max(1, minsSince);
        try {
          await updateDoc(doc(firestoreDb, "attendance_records", existing.id), {
            check_out_at: at,
            duration_minutes: duration,
            status: "PRESENT",
          });
        } catch (error: any) {
          notify.error(error.message);
          setStatus(`Error: ${error.message}`);
          return false;
        }
        notify.success(`✓ Signed out: ${student.full_name} (${duration}m)`);
        setLastScan({ name: student.full_name, status: `SIGNED OUT (${duration}m)` });
        setStatus(`Signed out: ${student.full_name}`);
      }
      qc.invalidateQueries({ queryKey: ["records", activeSession] });
      return true;
    } catch (err: any) {
      // Network dropped mid-request — stash the scan instead of losing it.
      if (!replay) {
        queueScan(sess.id, uuid, at);
        setPending(listQueued().length);
        setLastScan({ name: uuid.slice(0, 14) + "…", status: "SAVED OFFLINE" });
        setStatus("Connection lost — scan saved, will sync automatically");
        toast.message("Connection lost — scan saved on this device");
      }
      return false;
    } finally {
      inFlight.current.delete(uuid);
    }
  };

  /** Replay every stored scan for this session, oldest first. */
  const syncQueue = async (silent = false) => {
    const items = listQueued(activeSession);
    if (!items.length || !sessionRef.current) {
      if (!silent) toast.message("Nothing to sync");
      return;
    }
    if (!isOnline()) {
      if (!silent) toast.error("Still offline — try again once you have a connection");
      return;
    }
    setSyncing(true);
    let done = 0;
    for (const item of items.sort((a, b) => a.at.localeCompare(b.at))) {
      const ok = await processQr(item.code, { at: item.at, replay: true });
      if (ok) {
        removeQueued(item.id);
        done += 1;
      }
    }
    setPending(listQueued().length);
    setSyncing(false);
    qc.invalidateQueries({ queryKey: ["records", activeSession] });
    if (done) toast.success(`Synced ${done} offline scan${done === 1 ? "" : "s"}`);
    else if (!silent) toast.error("Could not sync yet — will retry");
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
      toast.success("Session closed");
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
        if (state === 2) await scannerRef.current.stop();
        await scannerRef.current.clear();
      }
    } catch {
      /* noop */
    }
    scannerRef.current = null;
    setScanning(false);
    setStatus("Stopped");
  };

  const startCamera = async (preferredFacing?: "environment" | "user") => {
    if (!activeSession) {
      toast.error("Select a session first");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      const m = "This browser does not support camera access. Use Chrome/Safari on HTTPS.";
      setCamError(m);
      toast.error(m);
      return;
    }
    setCamError(null);
    setStatus("Requesting camera…");
    try {
      await stopCamera();

      const el = document.getElementById(QR_REGION_ID);
      if (!el) throw new Error("Scanner container missing");

      const facing = preferredFacing ?? facingMode;
      setFacingMode(facing);

      scannerRef.current = new Html5Qrcode(QR_REGION_ID, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });

      const config = {
        fps: 30,
        qrbox: (vw: number, vh: number) => {
          const m = Math.floor(Math.min(vw, vh) * 0.75);
          return { width: m, height: m };
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
        // Fallback: not all devices honor `exact`; retry without it
        await scannerRef.current.start(
          { facingMode } as MediaTrackConstraints,
          config as any,
          (decoded) => void processQr(decoded),
          () => {},
        );
      }
      setScanning(true);
      setStatus("Scanning… point a QR code at the camera");
    } catch (e: any) {
      const msg =
        e?.name === "NotAllowedError"
          ? "Camera permission denied. Allow camera access in your browser settings."
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
    if (scanning) await startCamera(next);
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

  // Connectivity watcher: flush the offline queue the moment we're back online.
  useEffect(() => {
    setOnline(isOnline());
    setPending(listQueued().length);
    const goOnline = () => {
      setOnline(true);
      toast.success("Back online — syncing saved scans");
      void syncQueue(true);
    };
    const goOffline = () => {
      setOnline(false);
      toast.message("You're offline — scans will be saved on this device");
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession]);

  useEffect(() => {
    setPending(listQueued(activeSession).length);
  }, [activeSession]);

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (manual.trim()) {
      void processQr(manual.trim());
      setManual("");
    }
  };

  return (
    <AppShell>
      <h1 className="text-2xl md:text-3xl font-bold mb-2">Attendance Scanner</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Pick a session, tap <strong>Start scanning</strong>, and point QR codes at the camera —
        scans are recorded automatically for today's date.
      </p>

      {(!online || pending > 0) && (
        <div
          className={`mb-4 rounded-lg border p-3 flex flex-wrap items-center gap-3 text-sm ${
            online ? "border-warning/40 bg-warning/10" : "border-destructive/40 bg-destructive/10"
          }`}
        >
          <WifiOff className="size-4 shrink-0" />
          <div className="flex-1 min-w-[12rem]">
            <div className="font-medium">
              {online ? "Offline scans waiting to sync" : "You are offline"}
            </div>
            <div className="text-xs text-muted-foreground">
              {pending > 0
                ? `${pending} scan${pending === 1 ? "" : "s"} saved on this device.`
                : "Scans keep working — they are saved here and uploaded automatically."}
            </div>
          </div>
          {pending > 0 && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void syncQueue()} disabled={syncing || !online}>
                <UploadCloud className="size-4 mr-1" />
                {syncing ? "Syncing…" : "Sync now"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!confirm("Discard the saved offline scans? They will be lost permanently."))
                    return;
                  clearQueue(activeSession);
                  setPending(listQueued(activeSession).length);
                }}
              >
                Discard
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select
              value={activeSession ?? ""}
              onValueChange={(v) => {
                void stopCamera();
                setActiveSession(v);
              }}
            >
              <SelectTrigger>
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

            {session && (
              <div className="rounded-lg border p-3 bg-muted/30">
                <div className="font-semibold text-sm">
                  {session.courses?.code} — {session.courses?.title}
                  {session.courses?.level ? ` · Level ${session.courses.level}` : ""}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date().toLocaleDateString()} ·{" "}
                  {(session as any).mode === "inout"
                    ? "Sign in + sign out"
                    : "Single scan = present"}
                </div>
              </div>
            )}

            <div
              id={QR_REGION_ID}
              className="rounded-lg overflow-hidden bg-black mx-auto w-full max-w-sm"
              style={{ aspectRatio: "1 / 1", minHeight: 280 }}
            />

            <div className="text-xs text-center text-muted-foreground">
              <span className={scanning ? "text-success font-medium" : ""}>{status}</span>
            </div>

            {lastScan && (
              <div className="rounded-md border border-success/40 bg-success/10 p-2 text-sm text-center">
                <span className="font-semibold">{lastScan.name}</span> — {lastScan.status}
              </div>
            )}

            {camError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-xs p-3 flex gap-2">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium">Camera could not start</div>
                  <div className="opacity-80">{camError}</div>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              {!scanning ? (
                <Button onClick={() => startCamera()} className="flex-1" disabled={!activeSession}>
                  <Camera className="size-4 mr-1" />
                  Start scanning
                </Button>
              ) : (
                <Button onClick={stopCamera} variant="destructive" className="flex-1">
                  <Square className="size-4 mr-1" />
                  Stop scanning
                </Button>
              )}
              {scanning && (
                <>
                  <Button variant="outline" onClick={flipCamera} title="Flip camera">
                    <SwitchCamera className="size-4" />
                  </Button>
                  <Button variant="outline" onClick={() => startCamera()} title="Restart camera">
                    <RefreshCw className="size-4" />
                  </Button>
                </>
              )}
              {activeSession && (
                <Button
                  variant="outline"
                  onClick={closeSession}
                  title="Close session"
                  className="text-destructive"
                >
                  <Lock className="size-4" />
                </Button>
              )}
            </div>

            <form onSubmit={submitManual} className="flex gap-2 pt-2 border-t">
              <Input
                placeholder="Manual UUID / index # (fallback)"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
              />
              <Button type="submit" variant="outline">
                Scan
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Today's scans ({records?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {(records ?? []).map((r: any) => (
                <div key={r.id} className="p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{r.students?.full_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {r.students?.index_number}
                    </div>
                  </div>
                  <div className="text-right">
                    {r.status === "PRESENT" && (
                      <span className="inline-flex items-center text-success text-xs">
                        <CheckCircle2 className="size-3 mr-1" />
                        SCANNED{r.duration_minutes ? ` · ${r.duration_minutes}m` : ""}
                      </span>
                    )}
                    {r.status === "IN_PROGRESS" && (
                      <span className="text-xs text-warning-foreground bg-warning/30 px-2 py-0.5 rounded">
                        SIGNED IN
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {!records?.length && (
                <div className="p-8 text-center text-sm text-muted-foreground">No scans yet</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
