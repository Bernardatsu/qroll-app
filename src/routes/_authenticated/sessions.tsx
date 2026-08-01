import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, ScanLine, Lock, Unlock, Projector, MapPin, Trash2 } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { getPublicOrigin } from "@/lib/public-origin";

export const Route = createFileRoute("/_authenticated/sessions")({
  head: () => ({ meta: [{ title: "Sessions — KNUST" }] }),
  component: SessionsPage,
});

function SessionsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [form, setForm] = useState<{ course_id: string; title: string; mode: string; latitude: number | null; longitude: number | null; radius_m: number; }>({
    course_id: "", title: "", mode: "single", latitude: null, longitude: null, radius_m: 80,
  });
  const [locBusy, setLocBusy] = useState(false);


  const { data: sessions } = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      // Auto-close sessions older than 12h
      const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      await supabase.from("attendance_sessions").update({ status: "CLOSED", ends_at: new Date().toISOString() }).eq("status", "OPEN").lt("starts_at", cutoff);
      return (await supabase.from("attendance_sessions").select("*, courses(code, title, level)").order("starts_at", { ascending: false })).data ?? [];
    },
  });
  const { data: courses } = useQuery({
    queryKey: ["courses-active"],
    queryFn: async () => (await supabase.from("courses").select("id, code, title").eq("archived", false).order("code")).data ?? [],
  });

  const useMyLocation = () => {
    if (!navigator.geolocation) return toast.error("Geolocation not supported");
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, latitude: pos.coords.latitude, longitude: pos.coords.longitude }));
        setLocBusy(false);
        toast.success("Class location captured");
      },
      (err) => { setLocBusy(false); toast.error(err.message); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const create = async () => {
    if (!form.course_id) return toast.error("Pick a course");
    if (form.latitude == null || form.longitude == null)
      return toast.error("Capture your current classroom location first");
    const { data: me } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("attendance_sessions").insert({
      course_id: form.course_id, title: form.title || null, mode: form.mode,
      latitude: form.latitude, longitude: form.longitude, radius_m: form.radius_m,
      created_by: me.user?.id,
    } as any).select("id").single();
    if (error) return toast.error(error.message);
    toast.success("Session created — reuse it every class day");
    setOpen(false);
    setForm({ course_id: "", title: "", mode: "single", latitude: null, longitude: null, radius_m: 80 });
    qc.invalidateQueries({ queryKey: ["sessions"] });
    if (data) window.location.href = `/scan?session=${data.id}`;
  };

  const toggle = async (s: any) => {
    const status = s.status === "OPEN" ? "CLOSED" : "OPEN";
    const updates: any = { status };
    if (status === "CLOSED") {
      updates.ends_at = new Date().toISOString();
    } else {
      // Reopening for a new class day: reset starts_at so the 12h auto-close doesn't fire immediately
      updates.starts_at = new Date().toISOString();
      updates.ends_at = null;
    }
    const { error } = await supabase.from("attendance_sessions").update(updates).eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success(status === "OPEN" ? "Session reopened for today" : "Session closed");
    qc.invalidateQueries({ queryKey: ["sessions"] });
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("attendance_sessions").delete().eq("id", deleting.id);
    setDeleting(null);
    if (error) return toast.error(error.message);
    toast.success("Session deleted");
    qc.invalidateQueries({ queryKey: ["sessions"] });
  };


  const projectQr = async (sessionId: string) => {
    const url = `${getPublicOrigin()}/check-in?session=${sessionId}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 800, margin: 2, color: { dark: "#006633", light: "#ffffff" } });
    const w = window.open("", "_blank");
    if (!w) return toast.error("Allow popups to project");
    w.document.write(`<html><head><title>Project Check-in QR</title><meta name="viewport" content="width=device-width,initial-scale=1" /><style>body{margin:0;background:#fff;font-family:system-ui;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;min-height:100vh;color:#006633;padding:16px;box-sizing:border-box}h1{margin:8px 0}p{color:#555;margin:4px 0 16px;font-size:16px;text-align:center}img{max-width:80vmin;max-height:70vmin}button{margin-top:20px;background:#006633;color:#fff;border:0;padding:14px 28px;font-size:16px;border-radius:10px;cursor:pointer}button.close-x{position:fixed;top:12px;right:12px;background:#c00;padding:10px 16px;margin:0;font-weight:bold}</style></head><body><button class="close-x" onclick="window.close()">✕ Close</button><h1>Scan to check in</h1><p>Open your camera, scan, allow location, then enter your index number.</p><img src="${dataUrl}" /><p style="margin-top:16px;font-size:13px;word-break:break-all">${url}</p><button onclick="window.close()">Close this page</button></body></html>`);
    w.document.close();
  };

  return (
    <AppShell>
      <div className="flex justify-between mb-6">
        <h1 className="text-3xl font-bold">Attendance Sessions</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="size-4 mr-1" />New session</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create session</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Course</Label>
                <Select value={form.course_id} onValueChange={(v) => setForm({ ...form, course_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Pick a course" /></SelectTrigger>
                  <SelectContent>{(courses ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Title (optional)</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Week 4 lecture" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Grace (min)</Label><Input type="number" value={form.grace_minutes} onChange={(e) => setForm({ ...form, grace_minutes: Number(e.target.value) })} /></div>
                <div><Label>Radius (m)</Label><Input type="number" value={form.radius_m} onChange={(e) => setForm({ ...form, radius_m: Number(e.target.value) })} /></div>
              </div>
              <div>
                <Label>Classroom location (GPS anti-cheat)</Label>
                <Button type="button" variant="outline" className="w-full mt-1" onClick={useMyLocation} disabled={locBusy}>
                  <MapPin className="size-4 mr-1" />{form.latitude != null ? `Captured (${form.latitude.toFixed(4)}, ${form.longitude!.toFixed(4)})` : locBusy ? "Getting location..." : "Use my current location"}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">Stand in the classroom and tap this. Students outside the radius can't self check-in.</p>
              </div>
              <Button onClick={create} className="w-full">Create & open scanner</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3">
        {(sessions ?? []).map((s: any) => (
          <Card key={s.id}>
            <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold">{s.courses?.code} · {s.courses?.title}</div>
                <div className="text-xs text-muted-foreground">{s.title ?? "—"} · {new Date(s.starts_at).toLocaleString()} · grace {s.grace_minutes}m {s.latitude != null && `· geofence ${s.radius_m}m`}</div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-2 py-1 rounded font-medium ${s.status === "OPEN" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>{s.status}</span>
                <Button size="sm" variant="outline" onClick={() => toggle(s)}>{s.status === "OPEN" ? <><Lock className="size-3 mr-1" />Close</> : <><Unlock className="size-3 mr-1" />Reopen</>}</Button>
                {s.status === "OPEN" && <Button size="sm" variant="outline" onClick={() => projectQr(s.id)}><Projector className="size-3 mr-1" />Project</Button>}
                {s.status === "OPEN" && <Link to={"/scan" as string} search={{ session: s.id } as any}><Button size="sm"><ScanLine className="size-3 mr-1" />Scan</Button></Link>}
                <Button size="sm" variant="ghost" onClick={() => removeSession(s.id)} title="Delete session"><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!sessions?.length && <Card><CardContent className="p-8 text-center text-muted-foreground">No sessions yet</CardContent></Card>}
      </div>
    </AppShell>
  );
}
