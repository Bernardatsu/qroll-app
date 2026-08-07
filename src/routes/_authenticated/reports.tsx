import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, FileText, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { exportToExcel, exportToCSV, exportToPDF } from "@/lib/exporters";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Attendance Reports — QRoll" },
      { name: "description", content: "Daily and whole-semester QR attendance reports per course, with at-risk absentee tracking and Excel, CSV and PDF export." },
      { property: "og:title", content: "Attendance Reports — QRoll" },
      { property: "og:description", content: "Daily and semester attendance reports with export and absentee alerts." },
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

  const { data: courses } = useQuery({
    queryKey: ["courses-active"],
    queryFn: async () => (await supabase.from("courses").select("id, code, title, level").order("code")).data ?? [],
  });

  const { data: raw } = useQuery({
    queryKey: ["report-data", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data: sessions } = await supabase
        .from("attendance_sessions")
        .select("id, title, starts_at")
        .eq("course_id", courseId);
      const sessionIds = (sessions ?? []).map((s) => s.id);
      const [{ data: regs }, records] = await Promise.all([
        supabase.from("course_registrations").select("students(id, full_name, index_number, level)").eq("course_id", courseId),
        sessionIds.length
          ? supabase
              .from("attendance_records")
              .select("student_id, session_id, session_date, check_in_at, students(id, full_name, index_number, level)")
              .in("session_id", sessionIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      return { sessions: sessions ?? [], regs: regs ?? [], records: (records as any).data ?? [] };
    },
  });

  // Every distinct class day that actually happened for this course
  const allDays = useMemo(() => {
    const set = new Set<string>();
    for (const r of raw?.records ?? []) set.add(r.session_date ?? (r.check_in_at ? dayKey(r.check_in_at) : ""));
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
    for (const r of raw.regs) if ((r as any).students) studentMap.set((r as any).students.id, (r as any).students);
    for (const rec of raw.records) if (rec.students) studentMap.set(rec.students.id, rec.students);

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

  const courseLabel = useMemo(() => courses?.find((c: any) => c.id === courseId), [courses, courseId]);
  const atRiskCount = report?.rows.filter((r) => r.atRisk).length ?? 0;
  const presentCount = report?.rows.filter((r) => r.scans > 0).length ?? 0;
  const absentCount = (report?.rows.length ?? 0) - presentCount;

  const buildExportRows = () => {
    if (!report) return { rows: [] as any[], headers: [] as string[] };
    const dayHeaders = report.days.map((d) => `W${weekOfDay(d)} · ${prettyDay(d)}`);
    const headers = ["Name", "Index", "Level", ...dayHeaders, "Scans", "Missed", "Attendance %", `Score (/${gradeWeight})`, "Status"];
    const rows = visibleRows.map((r) => {
      const base: Record<string, string | number> = { Name: r.full_name, Index: r.index_number, Level: r.level ?? "" };
      report.days.forEach((_d, i) => { base[dayHeaders[i]] = r.cells[i]; });
      base["Scans"] = r.scans;
      base["Missed"] = r.missed;
      base["Attendance %"] = r.pct;
      base[`Score (/${gradeWeight})`] = r.score;
      base["Status"] = r.atRisk ? `AT RISK (>${maxMisses} missed)` : "PASSED";
      return base;
    });
    return { rows, headers };
  };

  const exportFn = (fmt: "xlsx" | "csv" | "pdf") => {
    const { rows, headers } = buildExportRows();
    if (!rows.length) return;
    const label = mode === "overall" ? "overall" : `W${weekOfDay(day)}-${day}`;
    const suffix = presence === "all" ? "" : `-${presence}`;
    const filename = `${courseLabel?.code ?? "report"}-${label}${suffix}`;
    if (fmt === "xlsx") exportToExcel(rows, filename);
    else if (fmt === "csv") exportToCSV(rows, filename);
    else
      exportToPDF(
        `${courseLabel?.code} — ${courseLabel?.title} (${mode === "overall" ? "Whole semester" : `Week ${weekOfDay(day)} · ${prettyDay(day)}`})`,
        headers,
        rows.map((r) => headers.map((h) => r[h] ?? "")),
        filename,
      );
  };

  return (
    <AppShell>
      <h1 className="text-2xl md:text-3xl font-bold mb-1">Reports</h1>
      <p className="text-sm text-muted-foreground mb-5">
        Pick a course, then view a single class day or the combined semester total. <b>1</b> = scanned, <b>0</b> = did not scan.
      </p>

      <Card className="mb-4">
        <CardContent className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="text-xs text-muted-foreground">Course</Label>
            <Select value={courseId} onValueChange={(v) => { setCourseId(v); setDay(""); }}>
              <SelectTrigger><SelectValue placeholder="Pick a course" /></SelectTrigger>
              <SelectContent>{(courses ?? []).map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.code} — {c.title}{c.level ? ` (L${c.level})` : ""}</SelectItem>
              ))}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">View</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
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
                <SelectTrigger><SelectValue placeholder="Pick a class day" /></SelectTrigger>
                <SelectContent>{allDays.map((d) => (
                  <SelectItem key={d} value={d}>Week {weekOfDay(d)} · {prettyDay(d)}</SelectItem>
                ))}</SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs text-muted-foreground">Allowed misses</Label>
            <Input type="number" min={0} value={maxMisses} onChange={(e) => setMaxMisses(Math.max(0, Number(e.target.value)))} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Attendance weight (% of final grade)</Label>
            <Input type="number" min={0} max={100} step={0.5} value={gradeWeight} onChange={(e) => setGradeWeight(Math.max(0, Math.min(100, Number(e.target.value))))} />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <Label className="text-xs text-muted-foreground mb-1.5 block">Show</Label>
            <Tabs value={presence} onValueChange={(v) => setPresence(v as Presence)}>
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="all" className="flex-1 sm:flex-none">All ({report?.rows.length ?? 0})</TabsTrigger>
                <TabsTrigger value="present" className="flex-1 sm:flex-none">Present ({presentCount})</TabsTrigger>
                <TabsTrigger value="absent" className="flex-1 sm:flex-none">Absent ({absentCount})</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
            <Button variant="outline" size="sm" disabled={!visibleRows.length} onClick={() => exportFn("xlsx")}><FileSpreadsheet className="size-4 mr-1" />Excel</Button>
            <Button variant="outline" size="sm" disabled={!visibleRows.length} onClick={() => exportFn("csv")}><Download className="size-4 mr-1" />CSV</Button>
            <Button variant="outline" size="sm" disabled={!visibleRows.length} onClick={() => exportFn("pdf")}><FileText className="size-4 mr-1" />PDF</Button>
            <span className="text-xs text-muted-foreground self-center">
              Downloads follow the filters above — {mode === "overall" ? "full compiled course report" : "this single session/day only"}.
            </span>
          </div>
        </CardContent>
      </Card>

      {report && !!report.days.length && atRiskCount > 0 && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm flex items-start gap-2">
          <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <b>{atRiskCount}</b> student{atRiskCount === 1 ? " has" : "s have"} missed more than <b>{maxMisses}</b> class{maxMisses === 1 ? "" : "es"}.
            Use the <b>At risk</b> tab to see and export just those students.
          </div>
        </div>
      )}

      {report && (
        <Card>
          <CardHeader className="gap-3">
            <CardTitle className="text-base">
              {courseLabel?.code} — {visibleRows.length} student{visibleRows.length === 1 ? "" : "s"} · {report.days.length} class day{report.days.length === 1 ? "" : "s"}
            </CardTitle>
            <Tabs value={risk} onValueChange={(v) => setRisk(v as Risk)}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="at-risk">At risk ({atRiskCount})</TabsTrigger>
                <TabsTrigger value="passed">Passed ({(report.rows.length ?? 0) - atRiskCount})</TabsTrigger>
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
                        <td key={i} className={`p-3 text-center font-semibold ${v === 1 ? "text-success" : "text-muted-foreground"}`}>{v}</td>
                      ))}
                      <td className="p-3 text-center font-bold text-success">{r.scans}</td>
                      <td className="p-3 text-center font-bold text-muted-foreground">{r.missed}</td>
                      <td className="p-3 text-center font-semibold">{r.pct}%</td>
                      <td className="p-3 text-center font-semibold text-primary">{r.score}</td>
                      <td className="p-3 text-center">
                        <span className={`text-xs px-2 py-1 rounded font-medium ${r.atRisk ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}`}>
                          {r.atRisk ? "AT RISK" : "PASSED"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!visibleRows.length && (
                    <tr><td colSpan={8 + report.days.length} className="p-6 text-center text-muted-foreground">
                      {allDays.length ? "No students to show" : "No attendance recorded for this course yet"}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-3 text-xs text-muted-foreground border-t">
              Legend: <b className="text-success">1</b> scanned · <b>0</b> did not scan · <b>At risk</b> = missed more than {maxMisses} class{maxMisses === 1 ? "" : "es"}.
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
