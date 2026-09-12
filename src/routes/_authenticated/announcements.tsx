import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { firebaseAuth, firestoreDb } from "@/integrations/firebase/config";
import { collection, getDocs, addDoc, deleteDoc, doc } from "firebase/firestore";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Megaphone, Trash2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/announcements")({
  head: () => ({
    meta: [
      { title: "Announcements — QRoll" },
      {
        name: "description",
        content: "Send announcements to a class level, a single course, or every student on QRoll.",
      },
      { property: "og:title", content: "Announcements — QRoll" },
      {
        property: "og:description",
        content: "Send announcements to a class level, a single course, or every student on QRoll.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnnouncementsPage,
});

type Row = {
  id: string;
  title: string;
  body: string;
  levels: string[];
  course_id: string | null;
  starts_on: string;
  expires_on: string | null;
};
type CourseRow = { id: string; code: string; title: string };

const LEVELS = ["100", "200", "300", "400"];

function AnnouncementsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [levels, setLevels] = useState<string[]>([]);
  const [courseId, setCourseId] = useState<string>("all");
  const [expiresOn, setExpiresOn] = useState("");

  const load = async () => {
    const currentUid = firebaseAuth.currentUser?.uid;
    if (!currentUid) {
      setRows([]);
      setCourses([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [aSnap, cSnap] = await Promise.all([
        getDocs(
          query(collection(firestoreDb, "announcements"), where("owner_id", "==", currentUid)),
        ),
        getDocs(query(collection(firestoreDb, "courses"), where("owner_id", "==", currentUid))),
      ]);
      const aList = aSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Row[];
      aList.sort((x, y) => (y.starts_on || "").localeCompare(x.starts_on || ""));
      const cList = cSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as CourseRow[];
      cList.sort((x, y) => (x.code || "").localeCompare(y.code || ""));
      setRows(aList);
      setCourses(cList);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load announcements");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const toggleLevel = (l: string) =>
    setLevels((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]));

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return toast.error("Add a title and a message");
    const currentUid = firebaseAuth.currentUser?.uid;
    if (!currentUid) return toast.error("You must be signed in");
    setBusy(true);
    try {
      await addDoc(collection(firestoreDb, "announcements"), {
        title: title.trim(),
        body: body.trim(),
        levels,
        course_id: courseId === "all" ? null : courseId,
        expires_on: expiresOn || null,
        starts_on: new Date().toISOString(),
        owner_id: currentUid,
      });
      toast.success("Announcement posted");
      setTitle("");
      setBody("");
      setLevels([]);
      setCourseId("all");
      setExpiresOn("");
      void load();
    } catch (err: any) {
      toast.error(err?.message || "Failed to post announcement");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (
      !confirm(
        "⚠️ WARNING: Are you sure you want to permanently delete this announcement?\n\nIt will immediately disappear from student portal feeds. This cannot be undone!",
      )
    )
      return;
    try {
      await deleteDoc(doc(firestoreDb, "announcements", id));
      setRows((r) => r.filter((x) => x.id !== id));
      toast.success("Announcement removed");
    } catch (err: any) {
      toast.error(err?.message || "Failed to remove announcement");
    }
  };

  const courseName = useMemo(() => {
    const m = new Map(courses.map((c) => [c.id, `${c.code} — ${c.title}`]));
    return (id: string | null) => (id ? (m.get(id) ?? "Course") : "All my courses");
  }, [courses]);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Megaphone className="size-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Announcements</h1>
            <p className="text-sm text-muted-foreground">
              Students see these on their student page.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">New announcement</CardTitle>
            <CardDescription>
              Choose who should see it. Leave levels unticked to reach every level.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={post} className="space-y-4">
              <div>
                <Label>Title</Label>
                <div className="flex flex-wrap gap-1.5 my-1.5">
                  {["Room Change", "Class Cancellation", "Quiz Availability", "Urgent Notice"].map(
                    (preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setTitle(`${preset}: `)}
                        className="text-xs px-2.5 py-1 rounded-full border border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary transition-colors"
                      >
                        + {preset}
                      </button>
                    ),
                  )}
                </div>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Room Change: PB 200 instead of LT 1"
                />
              </div>
              <div>
                <Label>Message</Label>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                  placeholder="Bring your student ID. Venue changed to PB 200."
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Course</Label>
                  <Select value={courseId} onValueChange={setCourseId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All my courses</SelectItem>
                      {courses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.code} — {c.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Hide after (optional)</Label>
                  <Input
                    type="date"
                    value={expiresOn}
                    onChange={(e) => setExpiresOn(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Levels</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={levels.length === 0 ? "default" : "outline"}
                    onClick={() => setLevels([])}
                  >
                    All Levels (Broadcast)
                  </Button>
                  {LEVELS.map((l) => (
                    <Button
                      key={l}
                      type="button"
                      size="sm"
                      variant={levels.includes(l) ? "default" : "outline"}
                      onClick={() => toggleLevel(l)}
                    >
                      Level {l}
                    </Button>
                  ))}
                  {levels.length > 0 && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setLevels([])}>
                      Clear Selection
                    </Button>
                  )}
                </div>
              </div>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="size-4 mr-2 animate-spin" />}Post announcement
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Posted</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!loading && rows.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing posted yet.</p>
            )}
            {rows.map((r) => (
              <div key={r.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{r.title}</div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {r.body}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant="secondary">{courseName(r.course_id)}</Badge>
                      <Badge variant="outline">
                        {r.levels.length === 0
                          ? "All levels"
                          : r.levels.map((l) => `L${l}`).join(", ")}
                      </Badge>
                      <Badge variant="outline">
                        {r.expires_on ? `until ${r.expires_on}` : "no end date"}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(r.id)}
                    aria-label="Delete announcement"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
