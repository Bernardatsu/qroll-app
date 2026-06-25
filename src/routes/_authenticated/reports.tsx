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

function ReportsPage() {
  const [courseId, setCourseId] = useState<string>("");
  const [threshold] = useState(75);

  const { data: courses } = useQuery({
    queryKey: ["courses-active"],
    queryFn: async () => (await supabase.from("courses").select("id, code, title, level").order("code")).data ?? [],
  });

  const { data: report } = useQuery({
    queryKey: ["report", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const [{ data: regs }, { data: sessions }, { data: records }] = await Promise.all([
        supabase.from("course_registrations").select("students(id, full_name, index_number, level)").eq("course_id", courseId),
        supabase.from("attendance_sessions").select("id").eq("course_id", courseId),
        supabase.from("attendance_records").select("student_id, status, session_id, attendance_sessions!inner(course_id)").eq("attendance_sessions.course_id", courseId),
      ]);
      const totalSessions = sessions?.length ?? 0;
      const rows = (regs ?? []).map((r: any) => {
        const s = r.students;
        const mine = (records ?? []).filter((rec: any) => rec.student_id === s.id);
        const present = mine.filter((m) => m.status === "PRESENT" || m.status === "LATE_ARRIVAL").length;
        const absent = mine.filter((m) => m.status === "ABSENT").length;
        const late = mine.filter((m) => m.status === "LATE_ARRIVAL").length;
        const pct = totalSessions ? Math.round((present / totalSessions) * 1000) / 10 : 0;
        return { full_name: s.full_name, index_number: s.index_number, level: s.level, present, absent, late, total: totalSessions, percentage: pct, flagged: pct < threshold };
      });
      return { rows, totalSessions };
    },
  });

  const courseLabel = useMemo(() => courses?.find((c: any) => c.id === courseId), [courses, courseId]);

  const exportFn = (fmt: "xlsx" | "csv" | "pdf") => {
    if (!report) return;
    const rows = report.rows.map((r) => ({
      Name: r.full_name, Index: r.index_number, Level: r.level,
      Present: r.present, Absent: r.absent, Late: r.late, Total: r.total,
      "%": r.percentage, Flagged: r.flagged ? "YES" : "",
    }));
    const filename = `${courseLabel?.code ?? "report"}-attendance`;
    if (fmt === "xlsx") exportToExcel(rows, filename);
    else if (fmt === "csv") exportToCSV(rows, filename);
    else exportToPDF(
      `${courseLabel?.code} — ${courseLabel?.title}`,
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
          <div className="flex-1 min-w-[240px]">
            <label className="text-xs text-muted-foreground">Course</label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger><SelectValue placeholder="Pick a course" /></SelectTrigger>
              <SelectContent>{(courses ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={!report} onClick={() => exportFn("xlsx")}><FileSpreadsheet className="size-4 mr-1" />Excel</Button>
            <Button variant="outline" disabled={!report} onClick={() => exportFn("csv")}><Download className="size-4 mr-1" />CSV</Button>
            <Button variant="outline" disabled={!report} onClick={() => exportFn("pdf")}><FileText className="size-4 mr-1" />PDF</Button>
          </div>
        </CardContent>
      </Card>

      {report && (
        <Card>
          <CardHeader><CardTitle>{courseLabel?.code} — {report.rows.length} students · {report.totalSessions} sessions · threshold {threshold}%</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr><th className="p-3">Name</th><th className="p-3">Index</th><th className="p-3">Present</th><th className="p-3">Absent</th><th className="p-3">Late</th><th className="p-3">%</th></tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.index_number} className={`border-t ${r.flagged ? "bg-destructive/5" : ""}`}>
                      <td className="p-3 font-medium">{r.full_name}</td>
                      <td className="p-3 font-mono text-xs">{r.index_number}</td>
                      <td className="p-3">{r.present}</td>
                      <td className="p-3">{r.absent}</td>
                      <td className="p-3">{r.late}</td>
                      <td className={`p-3 font-semibold ${r.flagged ? "text-destructive" : "text-success"}`}>{r.percentage}%</td>
                    </tr>
                  ))}
                  {!report.rows.length && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No registered students</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
