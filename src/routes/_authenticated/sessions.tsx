import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { firebaseAuth, firestoreDb } from "@/integrations/firebase/config";
import { useAuth } from "@/lib/auth";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
  query,
  where,
} from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  ScanLine,
  Lock,
  Unlock,
  Projector,
  MapPin,
  Trash2,
  AlertTriangle,
} from "lucide-react";

import QRCode from "qrcode";
import { toast } from "sonner";
import { getPublicOrigin } from "@/lib/public-origin";

export const Route = createFileRoute("/_authenticated/sessions")({
  head: () => ({ meta: [{ title: "Sessions — QRoll" }] }),
  component: SessionsPage,
});

function SessionsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [form, setForm] = useState<{
    course_id: string;
    title: string;
    mode: string;
    latitude: number | null;
    longitude: number | null;
    radius_m: number;
  }>({
    course_id: "",
    title: "",
    mode: "single",
    latitude: null,
    longitude: null,
    radius_m: 80,
  });
  const [locBusy, setLocBusy] = useState(false);
  const [projecting, setProjecting] = useState<{
    id: string;
    code: string;
    title: string;
    dataUrl: string;
    url: string;
  } | null>(null);

  const { user } = useAuth();
  const currentUid = user?.id || firebaseAuth.currentUser?.uid;

  const { data: courses, isLoading: coursesLoading } = useQuery({
    queryKey: ["courses-active", currentUid],
    queryFn: async () => {
      const uid = currentUid || firebaseAuth.currentUser?.uid;
      if (!uid) return [];
      const snap = await getDocs(
        query(collection(firestoreDb, "courses"), where("owner_id", "==", uid)),
      );
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((c) => !c.archived);
      return list.sort((a, b) => (a.code || "").localeCompare(b.code || ""));
    },
    enabled: !!(currentUid || firebaseAuth.currentUser?.uid),
  });

  const { data: sessions } = useQuery({
    queryKey: ["sessions", currentUid, courses],
    queryFn: async () => {
      if (!currentUid) return [];
      const snap = await getDocs(
        query(collection(firestoreDb, "attendance_sessions"), where("owner_id", "==", currentUid)),
      );
      const courseMap = new Map((courses ?? []).map((c: any) => [c.id, c]));
      const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const list = await Promise.all(
        snap.docs.map(async (d) => {
          const data = d.data() as any;
          if (data.status === "OPEN" && data.starts_at && data.starts_at < cutoff) {
            try {
              await updateDoc(doc(firestoreDb, "attendance_sessions", d.id), {
                status: "CLOSED",
                ends_at: new Date().toISOString(),
              });
              data.status = "CLOSED";
              data.ends_at = new Date().toISOString();
            } catch {
              // ignore
            }
          }
          const c = courseMap.get(data.course_id);
          return {
            id: d.id,
            ...data,
            courses: c ? { code: c.code, title: c.title, level: c.level } : null,
          };
        }),
      );
      return list.sort((a, b) => (b.starts_at || "").localeCompare(a.starts_at || ""));
    },
    enabled: !!currentUid,
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
      (err) => {
        setLocBusy(false);
        toast.error(err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const create = async () => {
    if (!form.course_id) return toast.error("Pick a course");
    let lat = form.latitude;
    let lng = form.longitude;
    if (lat == null || lng == null) {
      lat = 5.6037;
      lng = -0.187;
      toast.info("Using default campus coordinates for classroom geofence");
    }
    const currentUid = firebaseAuth.currentUser?.uid;
    try {
      const docRef = await addDoc(collection(firestoreDb, "attendance_sessions"), {
        course_id: form.course_id,
        title: form.title || null,
        mode: form.mode,
        latitude: lat,
        longitude: lng,
        radius_m: form.radius_m,
        created_by: currentUid ?? null,
        owner_id: currentUid ?? null,
        status: "OPEN",
        starts_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
      toast.success("Session created — reuse it every class day");
      setOpen(false);
      setForm({
        course_id: "",
        title: "",
        mode: "single",
        latitude: null,
        longitude: null,
        radius_m: 80,
      });
      qc.invalidateQueries({ queryKey: ["sessions"] });
      window.location.href = `/scan?session=${docRef.id}`;
    } catch (err: any) {
      toast.error(err?.message || "Failed to create session");
    }
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
    try {
      await updateDoc(doc(firestoreDb, "attendance_sessions", s.id), updates);
      toast.success(status === "OPEN" ? "Session reopened for today" : "Session closed");
      qc.invalidateQueries({ queryKey: ["sessions"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to update session");
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteDoc(doc(firestoreDb, "attendance_sessions", deleting.id));
      setDeleting(null);
      toast.success("Session deleted");
      qc.invalidateQueries({ queryKey: ["sessions"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete session");
    }
  };

  const projectQr = async (s: any) => {
    try {
      const url = `${getPublicOrigin()}/check-in?session=${s.id}`;
      const dataUrl = await QRCode.toDataURL(url, {
        width: 800,
        margin: 2,
        color: { dark: "#1e3a8a", light: "#ffffff" },
      });
      setProjecting({
        id: s.id,
        code: s.courses?.code ?? "Class",
        title: s.title || s.courses?.title || "Attendance Session",
        dataUrl,
        url,
      });
    } catch {
      toast.error("Failed to generate projection QR code");
    }
  };

  const openInNewWindow = () => {
    if (!projecting) return;
    const w = window.open("", "_blank");
    if (!w) return toast.error("Allow popups to project in a new window");
    w.document.write(
      `<html><head><title>Project Check-in QR</title><meta name="viewport" content="width=device-width,initial-scale=1" /><style>body{margin:0;background:#fff;font-family:system-ui;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;min-height:100vh;color:#12294a;padding:24px;box-sizing:border-box}h1{margin:8px 0;font-size:28px}p{color:#555;margin:4px 0 16px;font-size:18px;text-align:center}img{max-width:80vmin;max-height:65vmin;box-shadow:0 4px 20px rgba(0,0,0,0.08);border-radius:12px;padding:8px}button{margin-top:20px;background:#12294a;color:#fff;border:0;padding:12px 24px;font-size:16px;border-radius:8px;cursor:pointer}button.close-x{position:fixed;top:12px;right:12px;background:#c00;padding:8px 14px;margin:0;font-weight:bold}</style></head><body><button class="close-x" onclick="window.close()">✕ Close</button><h1>${projecting.code} — Scan to Check In</h1><p>Point your phone camera, tap the link, allow location, and enter your index number.</p><img src="${projecting.dataUrl}" /><p style="margin-top:16px;font-size:14px;word-break:break-all;color:#777">${projecting.url}</p><button onclick="window.close()">Close Window</button></body></html>`,
    );
    w.document.close();
  };

  return (
    <AppShell>
      <div className="flex justify-between mb-6">
        <h1 className="text-3xl font-bold">Attendance Sessions</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4 mr-1" />
              New session
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create session</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <Label>Course</Label>
                  {(!courses || courses.length === 0) && (
                    <Link to="/courses" className="text-xs text-primary underline">
                      + Add Course
                    </Link>
                  )}
                </div>
                <Select
                  value={form.course_id}
                  onValueChange={(v) => setForm({ ...form, course_id: v })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue
                      placeholder={coursesLoading ? "Loading courses..." : "Pick a course"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {courses && courses.length > 0 ? (
                      courses.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.code} — {c.title}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-3 text-xs text-center text-muted-foreground">
                        No courses found. Please add a course first.
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Title (optional)</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Week 4 lecture"
                />
              </div>
              <div>
                <Label>Attendance method</Label>
                <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Scan once = present</SelectItem>
                    <SelectItem value="inout">Sign in + sign out (two scans)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  This session is reusable — reopen it every class day and each day is reported
                  separately.
                </p>
              </div>
              <div>
                <Label>Geofence radius (m)</Label>
                <Input
                  type="number"
                  value={form.radius_m}
                  onChange={(e) => setForm({ ...form, radius_m: Number(e.target.value) })}
                />
              </div>

              <div>
                <Label>Classroom location (GPS anti-cheat)</Label>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full mt-1"
                  onClick={useMyLocation}
                  disabled={locBusy}
                >
                  <MapPin className="size-4 mr-1" />
                  {form.latitude != null
                    ? `Captured (${form.latitude.toFixed(4)}, ${form.longitude!.toFixed(4)})`
                    : locBusy
                      ? "Getting location..."
                      : "Use my current location"}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">
                  Stand in the classroom and tap this. Students outside the radius can't self
                  check-in.
                </p>
              </div>
              <Button onClick={create} className="w-full">
                Create & open scanner
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3">
        {(sessions ?? []).map((s: any) => (
          <Card key={s.id}>
            <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold">
                  {s.courses?.code} · {s.courses?.title}
                  {s.courses?.level ? ` · L${s.courses.level}` : ""}
                </div>
                <div className="text-xs text-muted-foreground">
                  {s.title ?? "—"} · last opened {new Date(s.starts_at).toLocaleString()} ·{" "}
                  {s.mode === "inout" ? "sign in + sign out" : "single scan"}
                  {s.latitude != null ? ` · geofence ${s.radius_m}m` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-xs px-2 py-1 rounded font-medium ${s.status === "OPEN" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
                >
                  {s.status}
                </span>
                <Button size="sm" variant="outline" onClick={() => toggle(s)}>
                  {s.status === "OPEN" ? (
                    <>
                      <Lock className="size-3 mr-1" />
                      Close
                    </>
                  ) : (
                    <>
                      <Unlock className="size-3 mr-1" />
                      Reopen
                    </>
                  )}
                </Button>
                {s.status === "OPEN" && (
                  <Button size="sm" variant="outline" onClick={() => projectQr(s)}>
                    <Projector className="size-3 mr-1" />
                    Project
                  </Button>
                )}
                {s.status === "OPEN" && (
                  <Link to={"/scan" as string} search={{ session: s.id } as any}>
                    <Button size="sm">
                      <ScanLine className="size-3 mr-1" />
                      Scan
                    </Button>
                  </Link>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeleting(s)}
                  title="Delete session"
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!sessions?.length && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No sessions yet
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" />
              Delete this session?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <b>every class day recorded under this session</b> — all
              weeks of attendance for {deleting?.courses?.code}. Please open <b>Reports</b> and
              export (Excel / CSV / PDF) the overall and daily reports first. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel — let me save the reports</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Delete without saving
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Parent QR Code Classroom Projector Dialog */}
      <Dialog open={!!projecting} onOpenChange={(v) => !v && setProjecting(null)}>
        <DialogContent className="max-w-lg text-center">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {projecting?.code} — Projector Check-In QR
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 flex flex-col items-center">
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Project this QR onto the screen. Students scan it, verify their location inside the
              classroom, and check in.
            </p>
            {projecting?.dataUrl && (
              <div className="p-3 bg-white rounded-2xl shadow-sm border border-border/50 max-w-xs w-full flex items-center justify-center">
                <img
                  src={projecting.dataUrl}
                  alt="Class Check-in QR"
                  className="w-full h-auto aspect-square rounded-lg"
                />
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground font-mono break-all px-4">
              {projecting?.url}
            </p>
          </div>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" onClick={openInNewWindow}>
              Open in Separate Tab
            </Button>
            <Button onClick={() => setProjecting(null)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
