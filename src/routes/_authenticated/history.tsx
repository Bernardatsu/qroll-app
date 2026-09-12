import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { firestoreDb } from "@/integrations/firebase/config";
import { collection, getDocs } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Archive,
  Search,
  Download,
  FileSpreadsheet,
  FileText,
  History as HistoryIcon,
} from "lucide-react";
import { exportToExcel, exportToCSV, exportToPDF } from "@/lib/exporters";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Academic History — QRoll" },
      {
        name: "description",
        content:
          "Search attendance history across every academic year and semester, including archived terms, and export historical course or student records.",
      },
      { property: "og:title", content: "Academic History — QRoll" },
      {
        property: "og:description",
        content:
          "Cross-semester attendance history, permanent archive search and historical exports.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Academic History — QRoll" },
      {
        name: "twitter:description",
        content: "Cross-semester attendance history and archive search.",
      },
    ],
  }),
  component: HistoryPage,
});

type Scope = "courses" | "students";

type TermRow = {
  id: string;
  year_name: string;
  semester: string;
  starts_on: string | null;
  ends_on: string | null;
  is_current: boolean;
  archived_at: string | null;
};

function pct(a: number, b: number) {
  return b > 0 ? Math.round((a / b) * 100) : 0;
}

function HistoryPage() {
  const [termId, setTermId] = useState<string>("all");
  const [scope, setScope] = useState<Scope>("courses");
  const [q, setQ] = useState("");

  const currentUid = firebaseAuth.currentUser?.uid;

  const { data: terms } = useQuery({
    queryKey: ["history-terms", currentUid],
    queryFn: async () => {
      if (!currentUid) return [];
      const snap = await getDocs(
        query(collection(firestoreDb, "academic_terms"), where("owner_id", "==", currentUid)),
      );
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as TermRow[];
      return list.sort((a, b) => {
        const yComp = (b.year_name || "").localeCompare(a.year_name || "");
        if (yComp !== 0) return yComp;
        return (a.semester || "").localeCompare(b.semester || "");
      });
    },
    enabled: !!currentUid,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["history-data", currentUid],
    queryFn: async () => {
      if (!currentUid) return { courses: [], sessions: [], records: [], regs: [] };
      const [coursesSnap, sessionsSnap, recordsSnap, regsSnap, studSnap] = await Promise.all([
        getDocs(query(collection(firestoreDb, "courses"), where("owner_id", "==", currentUid))),
        getDocs(
          query(
            collection(firestoreDb, "attendance_sessions"),
            where("owner_id", "==", currentUid),
          ),
        ),
        getDocs(
          query(collection(firestoreDb, "attendance_records"), where("owner_id", "==", currentUid)),
        ),
        getDocs(
          query(
            collection(firestoreDb, "course_registrations"),
            where("owner_id", "==", currentUid),
          ),
        ),
        getDocs(query(collection(firestoreDb, "students"), where("owner_id", "==", currentUid))),
      ]);
      const studentMap = new Map<string, any>();
      studSnap.docs.forEach((d) => {
        const s = d.data() as any;
        studentMap.set(d.id, {
          id: d.id,
          full_name: s.full_name,
          index_number: s.index_number,
          level: s.level,
        });
      });

      const courses = coursesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      const sessions = sessionsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      const records = recordsSnap.docs.map((d) => {
        const rData = d.data() as any;
        return {
          id: d.id,
          ...rData,
          students: studentMap.get(rData.student_id) || null,
        };
      });
      const regs = regsSnap.docs.map((d) => {
        const rData = d.data() as any;
        return {
          id: d.id,
          ...rData,
          students: studentMap.get(rData.student_id) || null,
        };
      });

      return { courses, sessions, records, regs };
    },
  });

  const termLabel = useMemo(() => {
    const map = new Map<string, string>();
    (terms ?? []).forEach((t) => map.set(t.id, `${t.year_name} · ${t.semester} semester`));
    return map;
  }, [terms]);

  const courseRows = useMemo(() => {
    if (!data) return [];
    const sessionsByCourse = new Map<string, string[]>();
    data.sessions.forEach((s) => {
      const list = sessionsByCourse.get(s.course_id) ?? [];
      list.push(s.id);
      sessionsByCourse.set(s.course_id, list);
    });
    const attendedBySession = new Map<string, number>();
    data.records.forEach((r) =>
      attendedBySession.set(r.session_id, (attendedBySession.get(r.session_id) ?? 0) + 1),
    );
    const regsByCourse = new Map<string, number>();
    data.regs.forEach((r) =>
      regsByCourse.set(r.course_id, (regsByCourse.get(r.course_id) ?? 0) + 1),
    );

    return data.courses
      .filter((c) => termId === "all" || c.term_id === termId)
      .map((c) => {
        const ids = sessionsByCourse.get(c.id) ?? [];
        const students = regsByCourse.get(c.id) ?? 0;
        const attended = ids.reduce((sum, id) => sum + (attendedBySession.get(id) ?? 0), 0);
        const possible = ids.length * students;
        return {
          id: c.id,
          code: c.code,
          title: c.title,
          level: c.level,
          term: c.term_id ? (termLabel.get(c.term_id) ?? "—") : "—",
          sessions: ids.length,
          students,
          attendance: pct(attended, possible),
        };
      })
      .filter((r) => {
        const needle = q.trim().toLowerCase();
        if (!needle) return true;
        return `${r.code} ${r.title} ${r.term}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [data, termId, q, termLabel]);

  const studentRows = useMemo(() => {
    if (!data) return [];
    const courseIds = new Set(
      data.courses.filter((c) => termId === "all" || c.term_id === termId).map((c) => c.id),
    );
    const sessionCourse = new Map<string, string>();
    data.sessions.forEach((s) => sessionCourse.set(s.id, s.course_id));
    const sessionsPerCourse = new Map<string, number>();
    data.sessions.forEach((s) => {
      if (courseIds.has(s.course_id))
        sessionsPerCourse.set(s.course_id, (sessionsPerCourse.get(s.course_id) ?? 0) + 1);
    });

    const students = new Map<
      string,
      { name: string; index: string; level: number | null; courses: Set<string>; attended: number }
    >();
    data.regs.forEach((r) => {
      const s = r.students;
      if (!s || !courseIds.has(r.course_id)) return;
      const entry = students.get(s.id) ?? {
        name: s.full_name,
        index: s.index_number,
        level: s.level,
        courses: new Set<string>(),
        attended: 0,
      };
      entry.courses.add(r.course_id);
      students.set(s.id, entry);
    });
    data.records.forEach((rec) => {
      const courseId = sessionCourse.get(rec.session_id);
      if (!courseId || !courseIds.has(courseId)) return;
      const s = rec.students;
      if (!s) return;
      const entry = students.get(s.id) ?? {
        name: s.full_name,
        index: s.index_number,
        level: s.level,
        courses: new Set<string>(),
        attended: 0,
      };
      entry.attended += 1;
      students.set(s.id, entry);
    });

    return [...students.entries()]
      .map(([id, e]) => {
        const possible = [...e.courses].reduce(
          (sum, cid) => sum + (sessionsPerCourse.get(cid) ?? 0),
          0,
        );
        return {
          id,
          name: e.name,
          index: e.index,
          level: e.level,
          courses: e.courses.size,
          attended: e.attended,
          possible,
          attendance: pct(e.attended, possible),
        };
      })
      .filter((r) => {
        const needle = q.trim().toLowerCase();
        if (!needle) return true;
        return `${r.name} ${r.index}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, termId, q]);

  const exportRows = () =>
    scope === "courses"
      ? courseRows.map((r) => ({
          Course: r.code,
          Title: r.title,
          Level: r.level ?? "",
          Semester: r.term,
          Classes: r.sessions,
          Students: r.students,
          "Attendance %": r.attendance,
        }))
      : studentRows.map((r) => ({
          Student: r.name,
          "Index number": r.index,
          Level: r.level ?? "",
          Courses: r.courses,
          "Classes attended": r.attended,
          "Classes possible": r.possible,
          "Attendance %": r.attendance,
        }));

  const fileName = () => {
    const term =
      termId === "all"
        ? "all-semesters"
        : (termLabel.get(termId) ?? "semester").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    return `qroll-history-${scope}-${term}`;
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <HistoryIcon className="size-6 text-primary" /> Academic history
            </h1>
            <p className="text-sm text-muted-foreground">
              Every semester ever recorded, including archived ones. Records here are permanent.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/semesters">
              <Archive className="mr-1 size-4" /> Manage semesters
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Search the archive</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
            <div className="space-y-1.5">
              <Label htmlFor="history-search">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="history-search"
                  className="pl-8"
                  placeholder={
                    scope === "courses" ? "Course code or title" : "Student name or index number"
                  }
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Semester</Label>
              <Select value={termId} onValueChange={setTermId}>
                <SelectTrigger>
                  <SelectValue placeholder="All semesters" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All semesters</SelectItem>
                  {(terms ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.year_name} · {t.semester}
                      {t.archived_at ? " (archived)" : t.is_current ? " (current)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3">
              <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
                <TabsList>
                  <TabsTrigger value="courses">By course</TabsTrigger>
                  <TabsTrigger value="students">By student</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportToExcel(exportRows(), fileName())}
                >
                  <FileSpreadsheet className="mr-1 size-4" /> Excel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportToCSV(exportRows(), fileName())}
                >
                  <Download className="mr-1 size-4" /> CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const rows = exportRows();
                    const headers = rows.length ? Object.keys(rows[0]) : [];
                    exportToPDF(
                      "Academic history",
                      headers,
                      rows.map((r) =>
                        headers.map((h) => String((r as Record<string, unknown>)[h] ?? "")),
                      ),
                      fileName(),
                    );
                  }}
                >
                  <FileText className="mr-1 size-4" /> PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {scope === "courses"
                ? `${courseRows.length} course(s)`
                : `${studentRows.length} student(s)`}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {isLoading ? (
              <p className="py-6 text-sm text-muted-foreground">Loading history…</p>
            ) : scope === "courses" ? (
              courseRows.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">No courses match that search.</p>
              ) : (
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3">Course</th>
                      <th className="py-2 pr-3">Semester</th>
                      <th className="py-2 pr-3">Level</th>
                      <th className="py-2 pr-3">Classes</th>
                      <th className="py-2 pr-3">Students</th>
                      <th className="py-2 pr-3">Attendance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courseRows.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="py-2 pr-3">
                          <div className="font-medium">{r.code}</div>
                          <div className="text-xs text-muted-foreground">{r.title}</div>
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">{r.term}</td>
                        <td className="py-2 pr-3">{r.level ?? "—"}</td>
                        <td className="py-2 pr-3">{r.sessions}</td>
                        <td className="py-2 pr-3">{r.students}</td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2">
                            <Progress value={r.attendance} className="h-2 w-24" />
                            <span className="tabular-nums">{r.attendance}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : studentRows.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">No students match that search.</p>
            ) : (
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Student</th>
                    <th className="py-2 pr-3">Index</th>
                    <th className="py-2 pr-3">Level</th>
                    <th className="py-2 pr-3">Courses</th>
                    <th className="py-2 pr-3">Attended</th>
                    <th className="py-2 pr-3">Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {studentRows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="py-2 pr-3 font-medium">{r.name}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{r.index}</td>
                      <td className="py-2 pr-3">{r.level ?? "—"}</td>
                      <td className="py-2 pr-3">{r.courses}</td>
                      <td className="py-2 pr-3">
                        {r.attended}/{r.possible}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <Progress value={r.attendance} className="h-2 w-24" />
                          <span className="tabular-nums">{r.attendance}%</span>
                          {r.attendance < 75 && <Badge variant="destructive">at risk</Badge>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
