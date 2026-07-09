import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, BookOpen, CalendarClock, CheckCircle2, Clock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { TrialBanner } from "@/components/TrialBanner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — KNUST Attendance" }] }),
  component: Dashboard,
});

function Stat({ icon: Icon, label, value, tint }: { icon: typeof Users; label: string; value: number | string; tint: string }) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`size-11 rounded-xl grid place-items-center ${tint}`}><Icon className="size-5" /></div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const { user, roles } = useAuth();
  const { data } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [students, courses, sessions, attendance] = await Promise.all([
        supabase.from("students").select("*", { count: "exact", head: true }),
        supabase.from("courses").select("*", { count: "exact", head: true }).eq("archived", false),
        supabase.from("attendance_sessions").select("*", { count: "exact", head: true }),
        supabase.from("attendance_records").select("status"),
      ]);
      const rows = attendance.data ?? [];
      const tally = { PRESENT: 0, IN_PROGRESS: 0 } as Record<string, number>;
      rows.forEach((r) => { tally[r.status] = (tally[r.status] ?? 0) + 1; });
      return {
        students: students.count ?? 0,
        courses: courses.count ?? 0,
        sessions: sessions.count ?? 0,
        ...tally,
      } as { students: number; courses: number; sessions: number; PRESENT: number; IN_PROGRESS: number };
    },
  });

  return (
    <AppShell>
      <TrialBanner />
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Welcome back</h1>
        <p className="text-muted-foreground">Signed in as {user?.email} · {roles.join(", ") || "no role"}</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={Users} label="Students" value={data?.students ?? 0} tint="bg-primary/10 text-primary" />
        <Stat icon={BookOpen} label="Courses" value={data?.courses ?? 0} tint="bg-gold/20 text-gold-foreground" />
        <Stat icon={CalendarClock} label="Sessions" value={data?.sessions ?? 0} tint="bg-accent text-accent-foreground" />
        <Stat icon={Clock} label="In progress" value={data?.IN_PROGRESS ?? 0} tint="bg-warning/30 text-warning-foreground" />
        <Stat icon={CheckCircle2} label="Scans (present)" value={data?.PRESENT ?? 0} tint="bg-success/20 text-success" />
      </div>
      <Card className="mt-6">
        <CardHeader><CardTitle>Getting started</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. Create departments and academic years.</p>
          <p>2. Add students (manually or via Excel import) — each gets a printable QR code.</p>
          <p>3. Create courses and register students.</p>
          <p>4. Open a session, scan student QR twice (check-in, check-out), export reports.</p>
        </CardContent>
      </Card>
    </AppShell>
  );
}
