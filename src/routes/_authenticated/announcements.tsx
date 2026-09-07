import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
      { name: "description", content: "Send announcements to a class level, a single course, or every student on QRoll." },
      { property: "og:title", content: "Announcements — QRoll" },
      { property: "og:description", content: "Send announcements to a class level, a single course, or every student on QRoll." },
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
    setLoading(true);
    const [a, c] = await Promise.all([
      (supabase as any).from("announcements").select("*").order("starts_on", { ascending: false }),
      supabase.from("courses").select("id, code, title").order("code"),
    ]);
    if (a.error) toast.error(a.error.message);
    setRows((a.data ?? []) as Row[]);
    setCourses((c.data ?? []) as CourseRow[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const toggleLevel = (l: string) =>
    setLevels((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]));

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return toast.error("Add a title and a message");
    setBusy(true);
    const { error } = await (supabase as any).from("announcements").insert({
      title: title.trim(),
      body: body.trim(),
      levels,
      course_id: courseId === "all" ? null : courseId,
      expires_on: expiresOn || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Announcement posted");
    setTitle(""); setBody(""); setLevels([]); setCourseId("all"); setExpiresOn("");
    void load();
  };

  const remove = async (id: string) => {
    const { error } = await (supabase as any).from("announcements").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setRows((r) => r.filter((x) => x.id !== id));
    toast.success("Announcement removed");
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
            <CardDescription>Choose who should see it. Leave levels unticked to reach every level.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={post} className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quiz on Friday" />
              </div>
              <div>
                <Label>Message</Label>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Bring your student ID. Venue changed to PB 200." />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Course</Label>
                  <Select value={courseId} onValueChange={setCourseId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All my courses</SelectItem>
                      {courses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.code} — {c.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Hide after (optional)</Label>
                  <Input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Levels</Label>
                <div className="flex flex-wrap gap-2">
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
                      Clear
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
          <CardHeader><CardTitle className="text-base">Posted</CardTitle></CardHeader>
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
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{r.body}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant="secondary">{courseName(r.course_id)}</Badge>
                      <Badge variant="outline">
                        {r.levels.length === 0 ? "All levels" : r.levels.map((l) => `L${l}`).join(", ")}
                      </Badge>
                      <Badge variant="outline">
                        {r.expires_on ? `until ${r.expires_on}` : "no end date"}
                      </Badge>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => remove(r.id)} aria-label="Delete announcement">
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
