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
import { CheckCircle2, LogOut, Camera, Square, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Search = { session?: string };

export const Route = createFileRoute("/_authenticated/scan")({
  head: () => ({ meta: [{ title: "Scanner — KNUST" }] }),
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
  const [camError, setCamError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [cameraId, setCameraId] = useState<string | undefined>();
  const [manual, setManual] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  // Per-student dedupe so the same QR held in front of the camera doesn't bounce
  // between check-in and check-out.
  const recentScans = useRef<Map<string, number>>(new Map());
  const processingRef = useRef(false);

  const { data: openSessions } = useQuery({
    queryKey: ["open-sessions"],
    queryFn: async () =>
      (
        await supabase
          .from("attendance_sessions")
          .select("id, title, starts_at, courses(code, title)")
          .eq("status", "OPEN")
          .order("starts_at", { ascending: false })
      ).data ?? [],
  });
  const { data: session } = useQuery({
    queryKey: ["session", activeSession],
    queryFn: async () =>
      activeSession
        ? (
            await supabase
              .from("attendance_sessions")
              .select("*, courses(code, title)")
              .eq("id", activeSession)
              .maybeSingle()
          ).data
        : null,
    enabled: !!activeSession,
  });
  const { data: records } = useQuery({
    queryKey: ["records", activeSession],
    queryFn: async () =>
      activeSession
        ? (
            await supabase
              .from("attendance_records")
              .select("*, students(full_name, index_number)")
              .eq("session_id", activeSession)
              .order("created_at", { ascending: false })
          ).data ?? []
        : [],
    enabled: !!activeSession,
    refetchInterval: 3000,
  });

  const processQr = async (raw: string) => {
    const uuid = raw.trim();
    if (!uuid || !activeSession || !session) return;
    if (processingRef.current) return;
    const now = Date.now();
    const last = recentScans.current.get(uuid) ?? 0;
    if (now - last < 8000) return;
    recentScans.current.set(uuid, now);
    processingRef.current = true;
    try {
      const { data: student } = await supabase
        .from("students")
        .select("id, full_name, index_number")
        .eq("qr_uuid", uuid)
        .maybeSingle();
      if (!student) {
        toast.error("Unknown QR code");
        return;
      }

      const { data: reg } = await supabase
        .from("course_registrations")
        .select("id")
        .eq("course_id", session.course_id)
        .eq("student_id", student.id)
        .maybeSingle();
      if (!reg) {
        toast.error(`${student.full_name} is not registered for this course`);
        return;
      }

      const { data: existing } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("session_id", activeSession)
        .eq("student_id", student.id)
        .maybeSingle();
      const { data: me } = await supabase.auth.getUser();

      if (!existing) {
        const sessionStart = new Date(session.starts_at).getTime();
        const lateMin = Math.max(
          0,
          Math.floor((now - sessionStart) / 60000) - (session.grace_minutes ?? 0),
        );
        const status = lateMin > 0 ? "LATE_ARRIVAL" : "IN_PROGRESS";
        const { error } = await supabase.from("attendance_records").insert({
          session_id: activeSession,
          student_id: student.id,
          check_in_at: new Date().toISOString(),
          late_minutes: lateMin,
          status,
          scanned_by: me.user?.id,
        });
        if (error) toast.error(error.message);
        else toast.success(`✓ Checked in: ${student.full_name}`);
      } else if (existing.status === "PRESENT" || existing.check_out_at) {
        toast.message(`Already completed: ${student.full_name}`);
      } else {
        const checkIn = new Date(existing.check_in_at!).getTime();
        const duration = Math.max(1, Math.floor((now - checkIn) / 60000));
        const { error } = await supabase
          .from("attendance_records")
          .update({
            check_out_at: new Date().toISOString(),
            duration_minutes: duration,
            status: "PRESENT",
          })
          .eq("id", existing.id);
        if (error) toast.error(error.message);
        else toast.success(`✓ Checked out: ${student.full_name} (${duration}m)`);
      }
      qc.invalidateQueries({ queryKey: ["records", activeSession] });
    } finally {
      processingRef.current = false;
    }
  };

  const stopCamera = async () => {
    try {
      if (scannerRef.current) {
        const state = scannerRef.current.getState?.();
        // 2 = SCANNING in html5-qrcode enum
        if (state === 2) await scannerRef.current.stop();
        await scannerRef.current.clear();
      }
    } catch {
      /* noop */
    }
    scannerRef.current = null;
    setScanning(false);
  };

  const startCamera = async (preferredId?: string) => {
    if (!activeSession) {
      toast.error("Select a session first");
      return;
    }
    setCamError(null);
    try {
      // Make sure any prior instance is fully torn down
      await stopCamera();

      // Discover cameras (also triggers permission prompt)
      let devices = cameras;
      if (!devices.length) {
        try {
          devices = await Html5Qrcode.getCameras();
          setCameras(devices);
        } catch (e: any) {
          throw new Error(
            "Camera permission was blocked. Allow camera access in your browser and try again.",
          );
        }
      }
      if (!devices.length) throw new Error("No camera detected on this device.");

      const chosen =
        preferredId ??
        cameraId ??
        devices.find((d) => /back|rear|environment/i.test(d.label))?.id ??
        devices[0].id;
      setCameraId(chosen);

      const el = document.getElementById(QR_REGION_ID);
      if (!el) throw new Error("Scanner container missing");

      scannerRef.current = new Html5Qrcode(QR_REGION_ID, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      await scannerRef.current.start(
        chosen,
        { fps: 12, qrbox: { width: 260, height: 260 }, aspectRatio: 1 },
        (decoded) => {
          void processQr(decoded);
        },
        () => {
          /* per-frame decode errors are noisy; ignore */
        },
      );
      setScanning(true);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setCamError(msg);
      toast.error(msg);
      setScanning(false);
    }
  };

  useEffect(() => {
    return () => {
      void stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-start once a session is picked
  useEffect(() => {
    if (activeSession && session && !scanning && !camError) {
      void startCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession, session]);

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (manual.trim()) {
      void processQr(manual.trim());
      setManual("");
    }
  };

  return (
    <AppShell>
      <h1 className="text-3xl font-bold mb-2">Attendance Scanner</h1>
      <p className="text-muted-foreground mb-6">
        Hold a student's QR code in front of the camera. The first scan checks them in, the second
        checks them out — no buttons needed. Press <strong>Stop scanning</strong> to end the session.
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Session</CardTitle>
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
                <div className="font-semibold">
                  {session.courses?.code} — {session.courses?.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  Started {new Date(session.starts_at).toLocaleString()} · grace{" "}
                  {session.grace_minutes}m
                </div>
              </div>
            )}

            {cameras.length > 1 && (
              <Select
                value={cameraId}
                onValueChange={(v) => {
                  setCameraId(v);
                  void startCamera(v);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose camera" />
                </SelectTrigger>
                <SelectContent>
                  {cameras.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label || c.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div
              id={QR_REGION_ID}
              className="rounded-lg overflow-hidden bg-black mx-auto w-full max-w-sm"
              style={{ aspectRatio: "1 / 1", minHeight: 260 }}
            />

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
                <Button variant="outline" onClick={() => startCamera()} title="Restart camera">
                  <RefreshCw className="size-4" />
                </Button>
              )}
            </div>

            <form onSubmit={submitManual} className="flex gap-2 pt-2 border-t">
              <Input
                placeholder="Manual UUID entry (fallback)"
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
          <CardHeader>
            <CardTitle>Recent scans ({records?.length ?? 0})</CardTitle>
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
                        PRESENT · {r.duration_minutes}m
                      </span>
                    )}
                    {r.status === "IN_PROGRESS" && (
                      <span className="text-xs text-warning-foreground bg-warning/30 px-2 py-0.5 rounded">
                        IN CLASS
                      </span>
                    )}
                    {r.status === "LATE_ARRIVAL" && (
                      <span className="inline-flex items-center text-warning-foreground text-xs">
                        <AlertTriangle className="size-3 mr-1" />
                        LATE {r.late_minutes}m
                      </span>
                    )}
                    {r.status === "ABSENT" && (
                      <span className="text-xs text-destructive">ABSENT</span>
                    )}
                    {r.status === "LEFT_EARLY" && (
                      <span className="inline-flex items-center text-xs">
                        <LogOut className="size-3 mr-1" />
                        EARLY
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
