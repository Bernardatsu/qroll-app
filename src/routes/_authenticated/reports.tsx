import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileText, FileSpreadsheet } from "lucide-react";
import { exportToExcel, exportToCSV, exportToPDF } from "@/lib/exporters";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — KNUST" }] }),
  component: ReportsPage,
});

type Mode = "semester" | "daily";

function ReportsPage() {
  const [courseId, setCourseId] = useState<string>("");
  const [mode, setMode] = useState<Mode>("semester");
  const [sessionId, setSessionId] = useState<string>("");
  const [threshold] = useState(75);

  const { data: courses } = useQuery({
    queryKey: ["courses-active"],
    queryFn: async () => (await supabase.from("courses").select("id, code, title, level").order("code")).data ?? [],
  });

  const { data: sessions } = useQuery({
    queryKey: ["sessions-for-course", courseId],
    enabled: !!courseId,
    queryFn: async () => (await supabase.from("attendance_sessions").select("id, title, starts_at").eq("course_id", courseId).order("starts_at", { ascending: false })).data ?? [],
  });

  const { data: report } = useQuery({
    queryKey: ["report", courseId, mode, sessionId],
    enabled: !!courseId && (mode === "semester" || !!sessionId),
    queryFn: async () => {
      const sessQ = supabase.from("attendance_sessions").select("id").eq("course_id", courseId);
      if (mode === "daily") sessQ.eq("id", sessionId);
      const [{ data: regs }, { data: sessList }] = await Promise.all([
        supabase.from("course_registrations").select("students(id, full_name, index_number, level)").eq("course_id", courseId),
        sessQ,
      ]);
      const sessionIds = (sessList ?? []).map((x) => x.id);
      const totalSessions = sessionIds.length;
      const { data: records } = sessionIds.length
        ? await supabase.from("attendance_records").select("student_id, status, session_id, check_in_at").in("session_id", sessionIds)
        : { data: [] as any[] };
      const rows = (regs ?? []).map((r: any) => {
        const s = r.students;
        const mine = (records ?? []).filter((rec: any) => rec.student_id === s.id);
        const present = mine.filter((m) => m.status === "PRESENT" || m.status === "LATE_ARRIVAL").length;
        const absent = totalSessions - present;
        const late = mine.filter((m) => m.status === "LATE_ARRIVAL").length;
        const pct = totalSessions ? Math.round((present / totalSessions) * 1000) / 10 : 0;
        return { full_name: s.full_name, index_number: s.index_number, level: s.level, present, absent, late, total: totalSessions, percentage: pct, flagged: pct < threshold };
      }).sort((a, b) => a.full_name.localeCompare(b.full_name));
      return { rows, totalSessions };
    },
  });

  const courseLabel = useMemo(() => courses?.find((c: any) => c.id === courseId), [courses, courseId]);
  const modeLabel = mode === "semester" ? "semester" : `daily-${sessionId.slice(0, 8)}`;

  const exportFn = (fmt: "xlsx" | "csv" | "pdf") => {
    if (!report) return;
    const rows = report.rows.map((r) => ({
      Name: r.full_name, Index: r.index_number, Level: r.level,
      Present: r.present, Absent: r.absent, Late: r.late, Total: r.total,
      "%": r.percentage, Flagged: r.flagged ? "YES" : "",
    }));
    const filename = `${courseLabel?.code ?? "report"}-${modeLabel}`;
    if (fmt === "xlsx") exportToExcel(rows, filename);
    else if (fmt === "csv") exportToCSV(rows, filename);
    else exportToPDF(
      `${courseLabel?.code} — ${courseLabel?.title} (${mode})`,
      ["Name", "Index", "Level", "Present", "Absent", "Late", "Total", "%"],
      rows.map((r) => [r.Name, r.Index, r.Level, r.Present, r.Absent, r.Late, r.Total, r["%"] + "%"]),
      filename,
    );
  };

  return (
    <AppShell>
      <h1 className="text-3xl font-bold mb-6">Reports</h1>
      <Card className="mb-4">
        <CardContent className="p-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[220px]">
            <label className="text-xs text-muted-foreground">Course</label>
            <Select value={courseId} onValueChange={(v) => { setCourseId(v); setSessionId(""); }}>
              <SelectTrigger><SelectValue placeholder="Pick a course" /></SelectTrigger>
              <SelectContent>{(courses ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="min-w-[160px]">
            <label className="text-xs text-muted-foreground">View</label>
            <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="semester">Overall (semester)</SelectItem>
                <SelectItem value="daily">Daily (one session)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === "daily" && (
            <div className="min-w-[220px]">
              <label className="text-xs text-muted-foreground">Session</label>
              <Select value={sessionId} onValueChange={setSessionId}>
                <SelectTrigger><SelectValue placeholder="Pick a session" /></SelectTrigger>
                <SelectContent>{(sessions ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{new Date(s.starts_at).toLocaleString()} {s.title ? `— ${s.title}` : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" disabled={!report} onClick={() => exportFn("xlsx")}><FileSpreadsheet className="size-4 mr-1" />Excel</Button>
            <Button variant="outline" disabled={!report} onClick={() => exportFn("csv")}><Download className="size-4 mr-1" />CSV</Button>
            <Button variant="outline" disabled={!report} onClick={() => exportFn("pdf")}><FileText className="size-4 mr-1" />PDF</Button>
          </div>
        </CardContent>
      </Card>

      {report && (
        <Card>
          <CardHeader><CardTitle>{courseLabel?.code} — {report.rows.length} students · {report.totalSessions} session{report.totalSessions === 1 ? "" : "s"} · threshold {threshold}%</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr><th className="p-3">Name</th><th className="p-3">Index</th><th className="p-3">Level</th><th className="p-3">Present</th><th className="p-3">Absent</th><th className="p-3">Late</th><th className="p-3">%</th></tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.index_number} className={`border-t ${r.flagged ? "bg-destructive/5" : ""}`}>
                      <td className="p-3 font-medium">{r.full_name}</td>
                      <td className="p-3 font-mono text-xs">{r.index_number}</td>
                      <td className="p-3">{r.level}</td>
                      <td className="p-3">{r.present}</td>
                      <td className="p-3">{r.absent}</td>
                      <td className="p-3">{r.late}</td>
                      <td className={`p-3 font-semibold ${r.flagged ? "text-destructive" : "text-success"}`}>{r.percentage}%</td>
                    </tr>
                  ))}
                  {!report.rows.length && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No registered students</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
