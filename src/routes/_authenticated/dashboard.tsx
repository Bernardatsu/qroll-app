import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, BookOpen, CalendarClock, CheckCircle2, Clock, QrCode, FileSpreadsheet, ArrowRight, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — QRoll" },
      { name: "description", content: "Live QRoll dashboard: students, courses, sessions and scan activity at a glance." },
      { property: "og:title", content: "Dashboard — QRoll" },
      { property: "og:description", content: "Live QRoll dashboard: students, courses, sessions and scan activity at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Stat({
  icon: Icon,
  label,
  value,
  tint,
  delay,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
  tint: string;
  delay: number;
}) {
  return (
    <Card
      className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl animate-in fade-in slide-in-from-bottom-3"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "backwards" }}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-primary/5 transition-transform duration-500 group-hover:scale-150" />
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`size-11 shrink-0 rounded-xl grid place-items-center transition-transform duration-300 group-hover:scale-110 ${tint}`}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground truncate">{label}</div>
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

const QUICK_ACTIONS = [
  { to: "/scan", label: "Open scanner", desc: "Scan student QR codes", icon: QrCode },
  { to: "/sessions", label: "Sessions", desc: "Open or reuse a session", icon: CalendarClock },
  { to: "/students", label: "Students", desc: "Add, import, print QRs", icon: Users },
  { to: "/reports", label: "Reports", desc: "Export Excel & PDF", icon: FileSpreadsheet },
] as const;

function Dashboard() {
  const { user, roles } = useAuth();
  const { data, isLoading } = useQuery({
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

  const scans = (data?.PRESENT ?? 0) + (data?.IN_PROGRESS ?? 0);
  const engagement = data && data.students > 0 ? Math.min(100, Math.round((scans / Math.max(1, data.students)) * 100)) : 0;

  return (
    <AppShell>
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-knust-gradient text-primary-foreground p-6 sm:p-8 mb-6 animate-in fade-in slide-in-from-top-2 duration-500">
        <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -left-10 bottom--10 size-40 rounded-full bg-white/5 blur-2xl" />
        <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest">
              <Sparkles className="size-3.5" /> QRoll
            </div>
            <h1 className="mt-3 truncate text-2xl sm:text-3xl font-bold">Welcome back</h1>
            <p className="mt-1 truncate text-sm text-primary-foreground/80">
              {user?.email} · {roles.join(", ") || "no role"}
            </p>
          </div>
          <Link to={"/scan" as string} className="shrink-0">
            <Button variant="secondary" className="shadow-sm">
              <QrCode className="size-4 mr-1" /> Scan
            </Button>
          </Link>
        </div>

        <div className="relative mt-6">
          <div className="flex items-center justify-between text-xs text-primary-foreground/80">
            <span>Scan activity</span>
            <span className="tabular-nums">{scans} total scans</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-gold transition-[width] duration-1000 ease-out"
              style={{ width: `${isLoading ? 0 : Math.max(4, engagement)}%` }}
            />
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={Users} label="Students" value={data?.students ?? 0} tint="bg-primary/10 text-primary" delay={0} />
        <Stat icon={BookOpen} label="Courses" value={data?.courses ?? 0} tint="bg-gold/20 text-gold" delay={80} />
        <Stat icon={CalendarClock} label="Sessions" value={data?.sessions ?? 0} tint="bg-accent text-accent-foreground" delay={160} />
        <Stat icon={Clock} label="In progress" value={data?.IN_PROGRESS ?? 0} tint="bg-warning/30 text-warning-foreground" delay={240} />
        <Stat icon={CheckCircle2} label="Scans recorded" value={data?.PRESENT ?? 0} tint="bg-success/20 text-success" delay={320} />
      </div>

      {/* Quick actions */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {QUICK_ACTIONS.map((a, i) => (
          <Link
            key={a.to}
            to={a.to as string}
            className="group rounded-xl border bg-card p-4 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg animate-in fade-in slide-in-from-bottom-3"
            style={{ animationDelay: `${360 + i * 70}ms`, animationFillMode: "backwards" }}
          >
            <div className="flex items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <a.icon className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="truncate font-semibold">{a.label}</div>
                <div className="truncate text-xs text-muted-foreground">{a.desc}</div>
              </div>
              <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        ))}
      </div>

      <Card className="mt-6 animate-in fade-in duration-700">
        <CardHeader><CardTitle>Getting started</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. Create departments and academic years.</p>
          <p>2. Add students (manually or via Excel import) — each gets a printable QR code.</p>
          <p>3. Create courses and register students.</p>
          <p>4. Open a session, scan student QR codes, then export reports.</p>
        </CardContent>
      </Card>
    </AppShell>
  );
}
