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

  const { data: courses } = useQuery({
    queryKey: ["courses-active"],
    queryFn: async () => (await supabase.from("courses").select("id, code, title, level").order("code")).data ?? [],
  });

  const { data: sessions } = useQuery({
    queryKey: ["sessions-for-course", courseId],
    enabled: !!courseId,
    queryFn: async () => (await supabase.from("attendance_sessions").select("id, title, starts_at").eq("course_id", courseId).order("starts_at", { ascending: true })).data ?? [],
  });

  const activeSessions = useMemo(() => {
    if (!sessions) return [];
    if (mode === "daily" && sessionId) return sessions.filter((s: any) => s.id === sessionId);
    return sessions;
  }, [sessions, mode, sessionId]);

  const { data: report } = useQuery({
    queryKey: ["report", courseId, mode, sessionId, activeSessions.map((s: any) => s.id).join(",")],
    enabled: !!courseId && (mode === "semester" || !!sessionId),
    queryFn: async () => {
      const sessionIds = activeSessions.map((s: any) => s.id);
      // Union of registered students + any student who has scanned in these sessions
      const [{ data: regs }, { data: records }] = await Promise.all([
        supabase.from("course_registrations").select("students(id, full_name, index_number, level)").eq("course_id", courseId),
        sessionIds.length
          ? supabase.from("attendance_records").select("student_id, session_id, students(id, full_name, index_number, level)").in("session_id", sessionIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const studentMap = new Map<string, any>();
      for (const r of regs ?? []) if (r.students) studentMap.set(r.students.id, r.students);
      for (const rec of records ?? []) if (rec.students) studentMap.set(rec.students.id, rec.students);

      const scannedByStudent = new Map<string, Set<string>>();
      for (const rec of records ?? []) {
        if (!scannedByStudent.has(rec.student_id)) scannedByStudent.set(rec.student_id, new Set());
        scannedByStudent.get(rec.student_id)!.add(rec.session_id);
      }

      const rows = Array.from(studentMap.values())
        .map((s: any) => {
          const scans: number[] = activeSessions.map((sess: any) => (scannedByStudent.get(s.id)?.has(sess.id) ? 1 : 0));
          const total = scans.reduce((a, b) => a + b, 0);
          return { id: s.id, full_name: s.full_name, index_number: s.index_number, level: s.level, scans, total };
        })
        .sort((a, b) => a.full_name.localeCompare(b.full_name));

      return { rows, sessions: activeSessions, totalSessions: activeSessions.length };
    },
  });

  const courseLabel = useMemo(() => courses?.find((c: any) => c.id === courseId), [courses, courseId]);
  const modeLabel = mode === "semester" ? "semester" : `daily-${sessionId.slice(0, 8)}`;

  const buildExportRows = () => {
    if (!report) return { rows: [] as any[], headers: [] as string[] };
    const sessionHeaders = report.sessions.map((s: any) => new Date(s.starts_at).toLocaleDateString() + (s.title ? ` (${s.title})` : ""));
    const headers = ["Name", "Index", "Level", ...sessionHeaders, "Total"];
    const rows = report.rows.map((r) => {
      const base: Record<string, string | number> = { Name: r.full_name, Index: r.index_number, Level: r.level };
      report.sessions.forEach((s: any, i: number) => { base[sessionHeaders[i]] = r.scans[i]; });
      base["Total"] = r.total;
      return base;
    });
    return { rows, headers };
  };

  const exportFn = (fmt: "xlsx" | "csv" | "pdf") => {
    const { rows, headers } = buildExportRows();
    if (!rows.length) return;
    const filename = `${courseLabel?.code ?? "report"}-${modeLabel}`;
    if (fmt === "xlsx") exportToExcel(rows, filename);
    else if (fmt === "csv") exportToCSV(rows, filename);
    else exportToPDF(
      `${courseLabel?.code} — ${courseLabel?.title} (${mode})`,
      headers,
      rows.map((r) => headers.map((h) => r[h] ?? "")),
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
          <CardHeader><CardTitle>{courseLabel?.code} — {report.rows.length} students · {report.totalSessions} session{report.totalSessions === 1 ? "" : "s"}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-3 sticky left-0 bg-muted/50">Name</th>
                    <th className="p-3">Index</th>
                    <th className="p-3">Level</th>
                    {report.sessions.map((s: any) => (
                      <th key={s.id} className="p-3 text-center whitespace-nowrap text-xs">
                        {new Date(s.starts_at).toLocaleDateString()}
                        {s.title ? <div className="font-normal text-muted-foreground">{s.title}</div> : null}
                      </th>
                    ))}
                    <th className="p-3 text-center">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-3 font-medium sticky left-0 bg-background">{r.full_name}</td>
                      <td className="p-3 font-mono text-xs">{r.index_number}</td>
                      <td className="p-3">{r.level}</td>
                      {r.scans.map((v, i) => (
                        <td key={i} className={`p-3 text-center font-semibold ${v ? "text-success" : "text-muted-foreground"}`}>{v}</td>
                      ))}
                      <td className="p-3 text-center font-bold">{r.total}</td>
                    </tr>
                  ))}
                  {!report.rows.length && <tr><td colSpan={4 + report.sessions.length} className="p-6 text-center text-muted-foreground">No data</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
