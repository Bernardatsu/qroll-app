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
import { ClipboardList, Trash2, Loader2, LinkIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/assignments")({
  head: () => ({
    meta: [
      { title: "Assignments — QRoll" },
      { name: "description", content: "Post assignments with deadlines and submission links; students see them on their student page." },
      { property: "og:title", content: "Assignments — QRoll" },
      { property: "og:description", content: "Post assignments with deadlines and submission links for your classes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssignmentsPage,
});

type Row = {
  id: string;
  title: string;
  details: string;
  submission_url: string | null;
  levels: string[];
  course_id: string | null;
  due_at: string | null;
};
type CourseRow = { id: string; code: string; title: string };

const LEVELS = ["100", "200", "300", "400"];

function AssignmentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [url, setUrl] = useState("");
  const [levels, setLevels] = useState<string[]>([]);
  const [courseId, setCourseId] = useState<string>("all");
  const [dueAt, setDueAt] = useState("");

  const load = async () => {
    setLoading(true);
    const [a, c] = await Promise.all([
      (supabase as any).from("assignments").select("*").order("due_at", { ascending: true, nullsFirst: false }),
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
    if (!title.trim()) return toast.error("Give the assignment a title");
    setBusy(true);
    const { error } = await (supabase as any).from("assignments").insert({
      title: title.trim(),
      details: details.trim(),
      submission_url: url.trim() || null,
      levels,
      course_id: courseId === "all" ? null : courseId,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Assignment posted");
    setTitle(""); setDetails(""); setUrl(""); setLevels([]); setCourseId("all"); setDueAt("");
    void load();
  };

  const remove = async (id: string) => {
    const { error } = await (supabase as any).from("assignments").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setRows((r) => r.filter((x) => x.id !== id));
    toast.success("Assignment removed");
  };

  const courseName = useMemo(() => {
    const m = new Map(courses.map((c) => [c.id, `${c.code} — ${c.title}`]));
    return (id: string | null) => (id ? (m.get(id) ?? "Course") : "All my courses");
  }, [courses]);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <ClipboardList className="size-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Assignments</h1>
            <p className="text-sm text-muted-foreground">
              Deadlines and submission links appear on your students' page.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">New assignment</CardTitle>
            <CardDescription>Leave levels unticked to reach every level.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={post} className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Problem set 2" />
              </div>
              <div>
                <Label>Instructions</Label>
                <Textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={4} placeholder="Answer questions 1–5. Submit a single PDF." />
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
                  <Label>Deadline (optional)</Label>
                  <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Submission link (optional)</Label>
                <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://forms.gle/..." />
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
                {busy && <Loader2 className="size-4 mr-2 animate-spin" />}Post assignment
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
              <div key={r.id} className="rounded-lg border p-3 transition-colors hover:bg-muted/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{r.title}</div>
                    {r.details && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{r.details}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant="secondary">{courseName(r.course_id)}</Badge>
                      <Badge variant="outline">
                        {r.levels.length === 0 ? "All levels" : r.levels.map((l) => `L${l}`).join(", ")}
                      </Badge>
                      <Badge variant={r.due_at ? "default" : "outline"}>
                        {r.due_at ? `due ${new Date(r.due_at).toLocaleString()}` : "no deadline"}
                      </Badge>
                    </div>
                    {r.submission_url && (
                      <a
                        href={r.submission_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                      >
                        <LinkIcon className="size-3.5" /> Submission link
                      </a>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => remove(r.id)} aria-label="Delete assignment">
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
