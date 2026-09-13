import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { firebaseAuth, firestoreDb } from "@/integrations/firebase/config";
import { useAuth } from "@/lib/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, FileText, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { exportToExcel, exportToCSV, exportToPDF } from "@/lib/exporters";
import { calculateAttendanceGrade } from "@/lib/grading";
import { isStudentInCourse } from "@/lib/class-matching";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Attendance Reports — QRoll" },
      {
        name: "description",
        content:
          "Daily and whole-semester QR attendance reports per course, with at-risk absentee tracking and Excel, CSV and PDF export.",
      },
      { property: "og:title", content: "Attendance Reports — QRoll" },
      {
        property: "og:description",
        content: "Daily and semester attendance reports with export and absentee alerts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

type Mode = "overall" | "daily";
type Risk = "all" | "at-risk" | "passed";
type Presence = "all" | "present" | "absent";

const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);
const prettyDay = (d: string) => new Date(d + "T00:00:00").toLocaleDateString();

function ReportsPage() {
  const [courseId, setCourseId] = useState<string>("");
  const [mode, setMode] = useState<Mode>("overall");
  const [day, setDay] = useState<string>("");
  const [maxMisses, setMaxMisses] = useState<number>(3);
  const [risk, setRisk] = useState<Risk>("all");
  const [presence, setPresence] = useState<Presence>("all");
  const [gradeWeight, setGradeWeight] = useState<number>(5);

  const { user } = useAuth();
  const currentUid = user?.id || firebaseAuth.currentUser?.uid;

  const { data: courses, isLoading: coursesLoading } = useQuery({
    queryKey: ["courses-active", currentUid],
    queryFn: async () => {
      const uid = currentUid || firebaseAuth.currentUser?.uid;
      if (!uid) return [];
      try {
        const snap = await getDocs(
          query(collection(firestoreDb, "courses"), where("owner_id", "==", uid)),
        );
        const list = snap.docs
          .map((d) => ({
            id: d.id,
            code: (d.data() as any).code,
            title: (d.data() as any).title,
            level: (d.data() as any).level,
            department_id: (d.data() as any).department_id || null,
            archived: (d.data() as any).archived,
          }))
          .filter((c) => !c.archived);
        return list.sort((a, b) => (a.code || "").localeCompare(b.code || ""));
      } catch (err) {
        console.error("Failed to load courses for reports:", err);
        return [];
      }
    },
    enabled: !!(currentUid || firebaseAuth.currentUser?.uid),
  });

  useEffect(() => {
    if (!courseId && courses && courses.length > 0) {
      setCourseId(courses[0].id);
    }
  }, [courses, courseId]);

  const { data: raw, isLoading: rawLoading } = useQuery({
    queryKey: ["report-data", courseId, currentUid],
    enabled: !!courseId && !!(currentUid || firebaseAuth.currentUser?.uid),
    queryFn: async () => {
      const uid = currentUid || firebaseAuth.currentUser?.uid;
      if (!uid || !courseId) return { sessions: [], regs: [], records: [] };

      try {
        const [sessSnap, regsSnap, allStudSnap, deptsSnap] = await Promise.all([
          getDocs(
            query(collection(firestoreDb, "attendance_sessions"), where("owner_id", "==", uid)),
          ),
          getDocs(
            query(
              collection(firestoreDb, "course_registrations"),
              where("owner_id", "==", uid),
              where("course_id", "==", courseId),
            ),
          ),
          getDocs(query(collection(firestoreDb, "students"), where("owner_id", "==", uid))),
          getDocs(query(collection(firestoreDb, "departments"), where("owner_id", "==", uid))),
        ]);

        const deptMap = new Map<string, string>();
        deptsSnap.docs.forEach((d) => {
          deptMap.set(d.id, (d.data() as any).name || "");
        });

        const studentMap = new Map<string, any>();
        allStudSnap.docs.forEach((d) => {
          const s = d.data() as any;
          studentMap.set(d.id, {
            id: d.id,
            full_name: s.full_name,
            index_number: s.index_number,
            level: s.level,
            department_id: s.department_id || null,
            program: s.program || null,
          });
        });

        // Filter sessions for this course
        const sessions = sessSnap.docs
          .filter((d) => (d.data() as any).course_id === courseId)
          .map((d) => ({
            id: d.id,
            title: (d.data() as any).title,
            starts_at: (d.data() as any).starts_at,
          }));
        const sessionIds = new Set(sessions.map((s) => s.id));

        const regs = regsSnap.docs.map((d) => {
          const rData = d.data() as any;
          return {
            id: d.id,
            ...rData,
            students: studentMap.get(rData.student_id) || null,
          };
        });

        let records: any[] = [];
        if (sessionIds.size > 0) {
          try {
            const recSnap = await getDocs(
              query(collection(firestoreDb, "attendance_records"), where("owner_id", "==", uid)),
            );
            records = recSnap.docs
              .filter((d) => sessionIds.has((d.data() as any).session_id))
              .map((d) => {
                const data = d.data() as any;
                return {
                  id: d.id,
                  student_id: data.student_id,
                  session_id: data.session_id,
                  session_date: data.session_date,
                  check_in_at: data.check_in_at,
                  status: data.status || "PRESENT",
                  students: studentMap.get(data.student_id) || null,
                };
              });
          } catch (recErr) {
            console.warn("Could not query records by owner_id, trying fallback:", recErr);
          }
        }

        return {
          sessions,
          regs,
          records,
          allStudents: Array.from(studentMap.values()),
          deptMap,
        };
      } catch (err: any) {
        console.error("Error fetching report data:", err);
        toast.error("Could not load report data: " + (err?.message || "Check network"));
        return { sessions: [], regs: [], records: [], allStudents: [], deptMap: new Map() };
      }
    },
  });

  // Every distinct class day that actually happened for this course
  const allDays = useMemo(() => {
    const set = new Set<string>();
    for (const r of raw?.records ?? [])
      set.add(r.session_date ?? (r.check_in_at ? dayKey(r.check_in_at) : ""));
    set.delete("");
    return Array.from(set).sort();
  }, [raw]);

  const weekOfDay = (d: string) => {
    if (!allDays.length) return 1;
    const first = new Date(allDays[0] + "T00:00:00").getTime();
    const diff = new Date(d + "T00:00:00").getTime() - first;
    return Math.max(1, Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1);
  };

  const activeDays = useMemo(() => {
    if (mode === "daily") return day ? [day] : [];
    return allDays;
  }, [mode, day, allDays]);

  const report = useMemo(() => {
    if (!raw || !courseId) return null;
    const studentMap = new Map<string, any>();
    const currentCourse = (courses ?? []).find((c) => c.id === courseId);
    const regStudentIds = new Set(raw.regs.map((r: any) => r.student_id));

    // 1. Populate all students who belong to this course by class level & department
    for (const s of raw.allStudents || []) {
      if (isStudentInCourse(s, currentCourse as any, regStudentIds, raw.deptMap)) {
        studentMap.set(s.id, s);
      }
    }

    // 2. Also ensure all explicitly registered students are included
    for (const r of raw.regs) {
      if ((r as any).students && !studentMap.has((r as any).students.id)) {
        studentMap.set((r as any).students.id, (r as any).students);
      }
    }

    // 3. Include any student with historical records
    for (const rec of raw.records) {
      if (rec.students && !studentMap.has(rec.students.id)) {
        studentMap.set(rec.students.id, rec.students);
      }
    }

    // student -> set of days scanned
    const scanned = new Map<string, Set<string>>();
    for (const rec of raw.records) {
      const d = rec.session_date ?? (rec.check_in_at ? dayKey(rec.check_in_at) : null);
      if (!d) continue;
      if (!scanned.has(rec.student_id)) scanned.set(rec.student_id, new Set());
      scanned.get(rec.student_id)!.add(d);
    }

    const rows = Array.from(studentMap.values())
      .map((s: any) => {
        const cells = activeDays.map((d) => (scanned.get(s.id)?.has(d) ? 1 : 0));
        const scans = cells.filter((v) => v === 1).length;
        const missed = cells.length - scans;
        const pct = cells.length ? Math.round((scans / cells.length) * 100) : 0;
        const gradeInfo = calculateAttendanceGrade(pct);
        return {
          id: s.id,
          full_name: s.full_name,
          index_number: s.index_number,
          level: s.level,
          cells,
          scans,
          missed,
          pct,
          score: Math.round((pct / 100) * gradeWeight * 100) / 100,
          attendanceMarks: gradeInfo.marks,
          attendanceGradeLabel: gradeInfo.label,
          atRisk: missed > maxMisses,
        };
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name));

    return { rows, days: activeDays };
  }, [raw, courseId, activeDays, maxMisses, gradeWeight]);

  const visibleRows = useMemo(() => {
    if (!report) return [];
    let rows = report.rows;
    if (risk === "at-risk") rows = rows.filter((r) => r.atRisk);
    else if (risk === "passed") rows = rows.filter((r) => !r.atRisk);
    if (presence === "present") rows = rows.filter((r) => r.scans > 0);
    else if (presence === "absent") rows = rows.filter((r) => r.scans === 0);
    return rows;
  }, [report, risk, presence]);

  const [sessionDay, setSessionDay] = useState<string>("");

  // Keep sessionDay updated if allDays changes
  useEffect(() => {
    if (allDays.length && (!sessionDay || !allDays.includes(sessionDay))) {
      setSessionDay(allDays[allDays.length - 1]);
    }
  }, [allDays, sessionDay]);

  const courseLabel = useMemo(
    () => courses?.find((c: any) => c.id === courseId),
    [courses, courseId],
  );
  const atRiskCount = report?.rows.filter((r) => r.atRisk).length ?? 0;
  const presentCount = report?.rows.filter((r) => r.scans > 0).length ?? 0;
  const absentCount = (report?.rows.length ?? 0) - presentCount;

  // Compilation export: always spans all semester days
  const exportCompilation = (fmt: "xlsx" | "csv" | "pdf") => {
    if (!raw || !courseId || !allDays.length) {
      toast.error("No course sessions found to compile");
      return;
    }
    const studentMap = new Map<string, any>();
    for (const r of raw.regs)
      if ((r as any).students) studentMap.set((r as any).students.id, (r as any).students);
    for (const rec of raw.records) if (rec.students) studentMap.set(rec.students.id, rec.students);

    const scanned = new Map<string, Set<string>>();
    for (const rec of raw.records) {
      const d = rec.session_date ?? (rec.check_in_at ? dayKey(rec.check_in_at) : null);
      if (!d) continue;
      if (!scanned.has(rec.student_id)) scanned.set(rec.student_id, new Set());
      scanned.get(rec.student_id)!.add(d);
    }

    const dayHeaders = allDays.map((d) => `W${weekOfDay(d)} · ${prettyDay(d)}`);
    const headers = [
      "Name",
      "Index Number",
      "Level",
      ...dayHeaders,
      "Total Scans",
      "Total Missed",
      "Attendance %",
      "Attendance Grade (/10 Marks)",
      `Score (/${gradeWeight})`,
      "Status",
    ];

    let studentsList = Array.from(studentMap.values()).map((s: any) => {
      const cells = allDays.map((d) => (scanned.get(s.id)?.has(d) ? 1 : 0));
      const scans = cells.filter((v) => v === 1).length;
      const missed = cells.length - scans;
      const pct = cells.length ? Math.round((scans / cells.length) * 100) : 0;
      const gradeInfo = calculateAttendanceGrade(pct);
      return {
        full_name: s.full_name,
        index_number: s.index_number,
        level: s.level ?? "",
        cells,
        scans,
        missed,
        pct,
        gradeMarks: gradeInfo.marks,
        score: Math.round((pct / 100) * gradeWeight * 100) / 100,
        atRisk: missed > maxMisses,
      };
    });

    if (risk === "at-risk") studentsList = studentsList.filter((s) => s.atRisk);
    else if (risk === "passed") studentsList = studentsList.filter((s) => !s.atRisk);
    if (presence === "present") studentsList = studentsList.filter((s) => s.scans > 0);
    else if (presence === "absent") studentsList = studentsList.filter((s) => s.scans === 0);

    const rows = studentsList.map((s) => {
      const row: Record<string, string | number> = {
        Name: s.full_name,
        "Index Number": s.index_number,
        Level: s.level,
      };
      allDays.forEach((_d, idx) => {
        row[dayHeaders[idx]] = s.cells[idx];
      });
      row["Total Scans"] = s.scans;
      row["Total Missed"] = s.missed;
      row["Attendance %"] = `${s.pct}%`;
      row["Attendance Grade (/10 Marks)"] = `${s.gradeMarks}/10 Marks`;
      row[`Score (/${gradeWeight})`] = s.score;
      row["Status"] = s.atRisk ? `AT RISK (>${maxMisses} missed)` : "PASSED";
      return row;
    });

    const filename = `${courseLabel?.code ?? "Course"}-Complete-Compilation`;
    if (fmt === "xlsx") exportToExcel(rows, filename);
    else if (fmt === "csv") exportToCSV(rows, filename);
    else {
      exportToPDF(
        `${courseLabel?.code} — ${courseLabel?.title} (Complete Semester Compilation)`,
        headers,
        rows.map((r) => headers.map((h) => r[h] ?? "")),
        filename,
      );
    }
  };

  // Specific session export: single class day with check-in timestamp
  const exportSpecificSession = (fmt: "xlsx" | "csv" | "pdf") => {
    const target = mode === "daily" ? day : sessionDay;
    if (!target) {
      toast.error("Please pick a session day to export");
      return;
    }
    const studentMap = new Map<string, any>();
    for (const r of raw?.regs ?? [])
      if ((r as any).students) studentMap.set((r as any).students.id, (r as any).students);
    for (const rec of raw?.records ?? [])
      if (rec.students) studentMap.set(rec.students.id, rec.students);

    // Map student_id -> check_in timestamp for this target day
    const checkInMap = new Map<string, string>();
    for (const rec of raw?.records ?? []) {
      const d = rec.session_date ?? (rec.check_in_at ? dayKey(rec.check_in_at) : null);
      if (d === target) {
        checkInMap.set(
          rec.student_id,
          rec.check_in_at ? new Date(rec.check_in_at).toLocaleTimeString() : "Checked In",
        );
      }
    }

    const headers = [
      "Name",
      "Index Number",
      "Level",
      "Session Date",
      "Presence Status",
      "Check-in Time",
    ];
    let list = Array.from(studentMap.values()).map((s: any) => {
      const isPresent = checkInMap.has(s.id);
      return {
        full_name: s.full_name,
        index_number: s.index_number,
        level: s.level ?? "",
        session_date: prettyDay(target),
        status: isPresent ? "PRESENT" : "ABSENT",
        time: checkInMap.get(s.id) ?? "—",
        isPresent,
      };
    });

    if (presence === "present") list = list.filter((s) => s.isPresent);
    else if (presence === "absent") list = list.filter((s) => !s.isPresent);

    const rows = list.map((s) => ({
      Name: s.full_name,
      "Index Number": s.index_number,
      Level: s.level,
      "Session Date": s.session_date,
      "Presence Status": s.status,
      "Check-in Time": s.time,
    }));

    const filename = `${courseLabel?.code ?? "Course"}-Session-W${weekOfDay(target)}-${target}`;
    if (fmt === "xlsx") exportToExcel(rows, filename);
    else if (fmt === "csv") exportToCSV(rows, filename);
    else {
      exportToPDF(
        `${courseLabel?.code} — ${courseLabel?.title} (Session: Week ${weekOfDay(target)} · ${prettyDay(target)})`,
        headers,
        rows.map((r) => headers.map((h) => r[h] ?? "")),
        filename,
      );
    }
  };

  return (
    <AppShell>
      <h1 className="text-2xl md:text-3xl font-bold mb-1">Reports</h1>
      <p className="text-sm text-muted-foreground mb-5">
        Pick a course, then view a single class day or the combined semester total. <b>1</b> =
        scanned, <b>0</b> = did not scan.
      </p>

      <Card className="mb-4">
        <CardContent className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="text-xs text-muted-foreground">Course</Label>
            <Select
              value={courseId}
              onValueChange={(v) => {
                setCourseId(v);
                setDay("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a course" />
              </SelectTrigger>
              <SelectContent>
                {(courses ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code} — {c.title}
                    {c.level ? ` (L${c.level})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">View</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="overall">Overall (whole semester)</SelectItem>
                <SelectItem value="daily">Daily (one class day)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === "daily" && (
            <div>
              <Label className="text-xs text-muted-foreground">Week / day</Label>
              <Select value={day} onValueChange={setDay}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a class day" />
                </SelectTrigger>
                <SelectContent>
                  {allDays.map((d) => (
                    <SelectItem key={d} value={d}>
                      Week {weekOfDay(d)} · {prettyDay(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs text-muted-foreground">Allowed misses</Label>
            <Input
              type="number"
              min={0}
              value={maxMisses}
              onChange={(e) => setMaxMisses(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              Attendance weight (% of final grade)
            </Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={gradeWeight}
              onChange={(e) => setGradeWeight(Math.max(0, Math.min(100, Number(e.target.value))))}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-4 pt-2">
            <Label className="text-xs font-semibold text-muted-foreground mb-2 block uppercase tracking-wider">
              Attendance Filter Toggle
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Tabs value={presence} onValueChange={(v) => setPresence(v as Presence)}>
                <TabsList>
                  <TabsTrigger value="all">All ({report?.rows.length ?? 0})</TabsTrigger>
                  <TabsTrigger value="present">Present ({presentCount})</TabsTrigger>
                  <TabsTrigger value="absent">Absent ({absentCount})</TabsTrigger>
                </TabsList>
              </Tabs>
              <Tabs value={risk} onValueChange={(v) => setRisk(v as Risk)}>
                <TabsList>
                  <TabsTrigger value="all">All Statuses</TabsTrigger>
                  <TabsTrigger value="at-risk" className="text-destructive font-semibold">
                    At Risk ({atRiskCount})
                  </TabsTrigger>
                  <TabsTrigger value="passed">
                    Passed ({(report?.rows.length ?? 0) - atRiskCount})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DEDICATED DOWNLOAD OPTIONS: COMPILATION VS SPECIFIC SESSION */}
      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileSpreadsheet className="size-4 text-primary" />
              Complete Attendance Compilation
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Download the entire semester attendance matrix across all lectures with attendance %,
              10-mark grades, and at-risk standing.
            </p>
          </CardHeader>
          <CardContent className="pt-2 flex flex-wrap items-center gap-2">
            <Button
              variant="default"
              size="sm"
              disabled={!courses?.length || !raw?.sessions?.length}
              onClick={() => exportCompilation("xlsx")}
            >
              <FileSpreadsheet className="size-4 mr-1.5" />
              Excel (.xlsx)
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!courses?.length || !raw?.sessions?.length}
              onClick={() => exportCompilation("csv")}
            >
              <Download className="size-4 mr-1.5" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!courses?.length || !raw?.sessions?.length}
              onClick={() => exportCompilation("pdf")}
            >
              <FileText className="size-4 mr-1.5" />
              PDF Report
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" />
              Specific Session Download
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Download attendance for a specific lecture session, complete with student check-in
              timestamps and presence verification.
            </p>
          </CardHeader>
          <CardContent className="pt-2 space-y-3">
            <div className="max-w-xs">
              <Select value={sessionDay} onValueChange={setSessionDay}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select class session" />
                </SelectTrigger>
                <SelectContent>
                  {allDays.map((d) => (
                    <SelectItem key={d} value={d}>
                      Week {weekOfDay(d)} · {prettyDay(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!sessionDay}
                onClick={() => exportSpecificSession("xlsx")}
              >
                <FileSpreadsheet className="size-4 mr-1.5" />
                Session Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!sessionDay}
                onClick={() => exportSpecificSession("csv")}
              >
                <Download className="size-4 mr-1.5" />
                Session CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!sessionDay}
                onClick={() => exportSpecificSession("pdf")}
              >
                <FileText className="size-4 mr-1.5" />
                Session PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {report && !!report.days.length && atRiskCount > 0 && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm flex items-start gap-2">
          <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <b>{atRiskCount}</b> student{atRiskCount === 1 ? " has" : "s have"} missed more than{" "}
            <b>{maxMisses}</b> class{maxMisses === 1 ? "" : "es"}. Use the <b>At risk</b> tab to see
            and export just those students.
          </div>
        </div>
      )}

      {report && (
        <Card>
          <CardHeader className="gap-3">
            <CardTitle className="text-base">
              {courseLabel?.code} — {visibleRows.length} student
              {visibleRows.length === 1 ? "" : "s"} · {report.days.length} class day
              {report.days.length === 1 ? "" : "s"}
            </CardTitle>
            <Tabs value={risk} onValueChange={(v) => setRisk(v as Risk)}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="at-risk">At risk ({atRiskCount})</TabsTrigger>
                <TabsTrigger value="passed">
                  Passed ({(report.rows.length ?? 0) - atRiskCount})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-3 sticky left-0 bg-muted/50">Name</th>
                    <th className="p-3">Index</th>
                    <th className="p-3">Level</th>
                    {report.days.map((d) => (
                      <th key={d} className="p-3 text-center whitespace-nowrap text-xs">
                        <div className="font-semibold text-primary">Week {weekOfDay(d)}</div>
                        <div>{prettyDay(d)}</div>
                      </th>
                    ))}
                    <th className="p-3 text-center">Scans</th>
                    <th className="p-3 text-center">Missed</th>
                    <th className="p-3 text-center">%</th>
                    <th className="p-3 text-center whitespace-nowrap">Grade (/10)</th>
                    <th className="p-3 text-center whitespace-nowrap">Score /{gradeWeight}</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-3 font-medium sticky left-0 bg-background">{r.full_name}</td>
                      <td className="p-3 font-mono text-xs">{r.index_number}</td>
                      <td className="p-3">{r.level}</td>
                      {r.cells.map((v, i) => (
                        <td
                          key={i}
                          className={`p-3 text-center font-semibold ${v === 1 ? "text-success" : "text-muted-foreground"}`}
                        >
                          {v}
                        </td>
                      ))}
                      <td className="p-3 text-center font-bold text-success">{r.scans}</td>
                      <td className="p-3 text-center font-bold text-muted-foreground">
                        {r.missed}
                      </td>
                      <td className="p-3 text-center font-semibold">{r.pct}%</td>
                      <td className="p-3 text-center">
                        <Badge variant="outline" className="font-mono text-xs font-semibold">
                          {r.attendanceMarks}/10
                        </Badge>
                      </td>
                      <td className="p-3 text-center font-semibold text-primary">{r.score}</td>
                      <td className="p-3 text-center">
                        <span
                          className={`text-xs px-2 py-1 rounded font-medium ${r.atRisk ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}`}
                        >
                          {r.atRisk ? "AT RISK" : "PASSED"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!visibleRows.length && (
                    <tr>
                      <td
                        colSpan={9 + report.days.length}
                        className="p-6 text-center text-muted-foreground"
                      >
                        {allDays.length
                          ? "No students to show"
                          : "No attendance recorded for this course yet"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-3 text-xs text-muted-foreground border-t">
              Legend: <b className="text-success">1</b> scanned · <b>0</b> did not scan ·{" "}
              <b>At risk</b> = missed more than {maxMisses} class{maxMisses === 1 ? "" : "es"}.
            </div>
          </CardContent>
        </Card>
      )}

      {!courseId && (
        <Card className="p-8 text-center border-dashed">
          <FileSpreadsheet className="size-10 mx-auto mb-2 text-muted-foreground/60" />
          <h3 className="font-semibold text-base mb-1">Select a course to view reports</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Choose any course from the selector above to see full semester attendance records,
            individual session breakdowns, and 10-mark grades.
          </p>
        </Card>
      )}
    </AppShell>
  );
}
