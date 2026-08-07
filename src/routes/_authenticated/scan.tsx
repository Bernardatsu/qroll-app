import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Camera, Square, AlertTriangle, RefreshCw, SwitchCamera, Lock } from "lucide-react";
import { toast } from "sonner";

type Search = { session?: string };

export const Route = createFileRoute("/_authenticated/scan")({
  head: () => ({ meta: [{ title: "Scanner — QRoll" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    session: typeof s.session === "string" ? s.session : undefined,
  }),
  component: ScanPage,
});

const QR_REGION_ID = "qr-reader";

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

  const { data: openSessions } = useQuery({
    queryKey: ["open-sessions"],
    queryFn: async () => {
      // Auto-close sessions older than 12h
      const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      await supabase.from("attendance_sessions").update({ status: "CLOSED", ends_at: new Date().toISOString() }).eq("status", "OPEN").lt("starts_at", cutoff);
      return (
        await supabase
          .from("attendance_sessions")
          .select("id, title, starts_at, courses(code, title)")
          .eq("status", "OPEN")
          .order("starts_at", { ascending: false })
      ).data ?? [];
    },
  });
  const { data: session } = useQuery({
    queryKey: ["session", activeSession],
    queryFn: async () =>
      activeSession
        ? (
            await supabase
              .from("attendance_sessions")
              .select("*, courses(code, title, level)")
              .eq("id", activeSession)
              .maybeSingle()
          ).data
        : null,
    enabled: !!activeSession,
  });
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const { data: records } = useQuery({
    queryKey: ["records", activeSession],
    queryFn: async () => {
      if (!activeSession) return [];
      // Auto-resets daily: only today's scans are listed
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("attendance_records")
        .select("*, students(full_name, index_number)")
        .eq("session_id", activeSession)
        .eq("session_date", today)
        .order("created_at", { ascending: false });
      return data ?? [];
    },

    enabled: !!activeSession,
    refetchInterval: 3000,
  });

  const processQr = async (raw: string) => {
    const uuid = raw.trim();
    const sess = sessionRef.current;
    if (!uuid || !sess) return;
    // Per-code lock (not a global lock) so a queue of students can be scanned
    // back-to-back without the camera stalling on the previous student.
    if (inFlight.current.has(uuid)) return;
    const now = Date.now();
    const last = recentScans.current.get(uuid) ?? 0;
    if (now - last < 3000) return;
    recentScans.current.set(uuid, now);
    inFlight.current.add(uuid);
    beep();
    try {
      // Try to match by qr_uuid OR raw index_number (supports plain-text QR codes too)
      const { data: student } = await supabase
        .from("students")
        .select("id, full_name, index_number, level")
        .or(`qr_uuid.eq.${uuid},index_number.eq.${uuid}`)
        .maybeSingle();
      if (!student) {
        setStatus(`Unknown QR: ${uuid.slice(0, 12)}…`);
        toast.error("Unknown QR code");
        return;
      }

      // A course created for one class/level cannot be used by another level
      const courseLevel = String(sess.courses?.level ?? "").trim();
      const studentLevel = String((student as any).level ?? "").trim();
      if (courseLevel && studentLevel && courseLevel !== studentLevel) {
        toast.error(`${student.full_name} is level ${studentLevel} — this class is for level ${courseLevel} only`);
        setLastScan({ name: student.full_name, status: "WRONG LEVEL" });
        setStatus(`Wrong level: ${student.full_name}`);
        return;
      }


      const { data: reg } = await supabase
        .from("course_registrations")
        .select("id")
        .eq("course_id", sess.course_id)
        .eq("student_id", student.id)
        .maybeSingle();
      if (!reg) {
        // Auto-enroll the student in this course so the scan goes through
        const { error: regErr } = await supabase
          .from("course_registrations")
          .insert({ course_id: sess.course_id, student_id: student.id });
        if (regErr) {
          toast.error(`Could not auto-register ${student.full_name}: ${regErr.message}`);
          setStatus(`Registration failed: ${student.full_name}`);
          return;
        }
        toast.message(`Auto-registered ${student.full_name} for this course`);
      }

      const today = new Date().toISOString().slice(0, 10);
      const singleScanMode = (sess.mode ?? "single") === "single";

      const { data: existing } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("session_id", sess.id)
        .eq("student_id", student.id)
        .eq("session_date", today)
        .maybeSingle();
      const { data: me } = await supabase.auth.getUser();

      if (!existing) {
        const { error } = await supabase.from("attendance_records").insert({
          session_id: sess.id,
          student_id: student.id,
          session_date: today,
          check_in_at: new Date().toISOString(),
          status: singleScanMode ? "PRESENT" : "IN_PROGRESS",
          scanned_by: me.user?.id,
        } as any);
        if (error) {
          toast.error(error.message);
          setStatus(`Error: ${error.message}`);
        } else {
          const label = singleScanMode ? "Recorded" : "Checked in";
          toast.success(`✓ ${label}: ${student.full_name}`);
          setLastScan({ name: student.full_name, status: singleScanMode ? "RECORDED" : "CHECKED IN" });
          setStatus(`${label}: ${student.full_name}`);
        }
      } else if (singleScanMode || existing.status === "PRESENT" || existing.check_out_at) {
        toast.message(`Already recorded today: ${student.full_name}`);
        setLastScan({ name: student.full_name, status: "ALREADY RECORDED" });
        setStatus(`Already recorded today: ${student.full_name}`);
      } else {
        const checkIn = new Date(existing.check_in_at!).getTime();
        const minsSince = Math.floor((now - checkIn) / 60000);
        if (minsSince < 30) {
          const wait = 30 - minsSince;
          toast.error(`Sign-out not allowed yet for ${student.full_name} — ${wait} more minute${wait === 1 ? "" : "s"}`);
          setLastScan({ name: student.full_name, status: "SIGN-OUT LOCKED" });
          setStatus(`Sign-out locked for ${student.full_name}`);
          return;
        }
        const duration = Math.max(1, minsSince);
        const { error } = await supabase
          .from("attendance_records")
          .update({
            check_out_at: new Date().toISOString(),
            duration_minutes: duration,
            status: "PRESENT",
          })
          .eq("id", existing.id);
        if (error) {
          toast.error(error.message);
          setStatus(`Error: ${error.message}`);
        } else {
          toast.success(`✓ Signed out: ${student.full_name} (${duration}m)`);
          setLastScan({ name: student.full_name, status: `SIGNED OUT (${duration}m)` });
          setStatus(`Signed out: ${student.full_name}`);
        }
      }
      qc.invalidateQueries({ queryKey: ["records", activeSession] });
    } finally {
      inFlight.current.delete(uuid);
    }
  };


  const closeSession = async () => {
    if (!activeSession) return;
    if (!confirm("Close this session? Students will no longer be able to check in.")) return;
    await stopCamera();
    const { error } = await supabase.from("attendance_sessions").update({ status: "CLOSED", ends_at: new Date().toISOString() }).eq("id", activeSession);
    if (error) return toast.error(error.message);
    toast.success("Session closed");
    qc.invalidateQueries({ queryKey: ["open-sessions"] });
    qc.invalidateQueries({ queryKey: ["session", activeSession] });
    qc.invalidateQueries({ queryKey: ["sessions"] });
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
        fps: 15,
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
          : e?.message ?? String(e);
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
                  {(session as any).mode === "inout" ? "Sign in + sign out" : "Single scan = present"}
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
                <Button variant="outline" onClick={closeSession} title="Close session" className="text-destructive">
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
