import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { firebaseAuth, firestoreDb } from "@/integrations/firebase/config";
import { collection, query, where, getCountFromServer, getDocs } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users,
  BookOpen,
  CalendarClock,
  Clock,
  ArrowRight,
  GraduationCap,
  HelpCircle,
  CheckCircle2,
  FolderKanban,
  Settings,
  Building2,
  QrCode,
  Compass,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — QRoll" },
      {
        name: "description",
        content: "Live QRoll dashboard: students, courses, sessions and scan activity at a glance.",
      },
      { property: "og:title", content: "Dashboard — QRoll" },
      {
        property: "og:description",
        content: "Live QRoll dashboard: students, courses, sessions and scan activity at a glance.",
      },
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
        <div
          className={`size-11 shrink-0 rounded-xl grid place-items-center transition-transform duration-300 group-hover:scale-110 ${tint}`}
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground truncate">
            {label}
          </div>
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const { user, roles } = useAuth();
  const currentUid = user?.id || firebaseAuth.currentUser?.uid;

  const [stats, setStats] = useState({
    students: 0,
    courses: 0,
    sessions: 0,
    semesters: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!currentUid) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    async function loadDashboardMetrics() {
      setIsLoading(true);
      try {
        // High-efficiency aggregated count queries:
        // getCountFromServer charges only 1 read per 1,000 documents instead of downloading all documents!
        const [studCountRes, coursesSnap, sessCountRes, termsSnap] = await Promise.all([
          getCountFromServer(
            query(collection(firestoreDb, "students"), where("owner_id", "==", currentUid)),
          ).catch(async () => {
            const fallback = await getDocs(
              query(collection(firestoreDb, "students"), where("owner_id", "==", currentUid)),
            );
            return { data: () => ({ count: fallback.size }) };
          }),
          getDocs(
            query(collection(firestoreDb, "courses"), where("owner_id", "==", currentUid)),
          ).catch(() => ({ docs: [] }) as any),
          getCountFromServer(
            query(
              collection(firestoreDb, "attendance_sessions"),
              where("owner_id", "==", currentUid),
            ),
          ).catch(async () => {
            const fallback = await getDocs(
              query(
                collection(firestoreDb, "attendance_sessions"),
                where("owner_id", "==", currentUid),
              ),
            );
            return { data: () => ({ count: fallback.size }) };
          }),
          getDocs(
            query(collection(firestoreDb, "academic_terms"), where("owner_id", "==", currentUid)),
          ).catch(() => ({ docs: [] }) as any),
        ]);

        if (!isMounted) return;

        const activeCourses = coursesSnap.docs.filter(
          (d: any) => !(d.data() as any).archived,
        ).length;
        const currentTerms = termsSnap.docs.filter((d: any) => (d.data() as any).is_current).length;

        setStats({
          students: studCountRes.data().count,
          courses: activeCourses,
          sessions: sessCountRes.data().count,
          semesters: currentTerms,
        });
      } catch (err) {
        console.warn("Dashboard stats load error:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadDashboardMetrics();

    return () => {
      isMounted = false;
    };
  }, [currentUid]);

  const data = stats;

  return (
    <AppShell>
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-knust-gradient text-primary-foreground p-4 sm:p-6 md:p-8 mb-6 animate-in fade-in slide-in-from-top-2 duration-500 shadow-md">
        <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -left-10 -bottom-10 size-40 rounded-full bg-white/5 blur-2xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 sm:px-3 py-1 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider sm:tracking-widest max-w-full">
              <GraduationCap className="size-3.5 shrink-0" />{" "}
              <span className="truncate">University Classroom Management</span>
            </div>
            <h1 className="mt-2.5 sm:mt-3 text-2xl sm:text-3xl font-bold tracking-tight">
              Welcome back
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-primary-foreground/85 break-words">
              {user?.email} · {roles.join(", ") || "Tutor"}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5 w-full sm:w-auto shrink-0">
            <Link to={"/manual" as string} className="w-full sm:w-auto flex-1 sm:flex-initial">
              <Button
                variant="outline"
                className="w-full sm:w-auto justify-center bg-white/15 hover:bg-white/25 text-white border-white/30 font-medium h-10 sm:h-9 text-xs sm:text-sm"
              >
                <HelpCircle className="size-4 mr-1.5 text-blue-200" /> User Manual
              </Button>
            </Link>
            <Link
              to={"/account" as string}
              className="w-full sm:w-auto flex-1 sm:flex-initial shrink-0"
            >
              <Button
                variant="default"
                className="w-full sm:w-auto justify-center bg-white hover:bg-blue-50 text-blue-900 font-bold h-10 sm:h-9 text-xs sm:text-sm shadow-md"
              >
                <FolderKanban className="size-4 mr-1.5" /> My Account
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          icon={Users}
          label="Total Students"
          value={data?.students ?? 0}
          tint="bg-blue-500/15 text-blue-600 dark:text-blue-400"
          delay={0}
        />
        <Stat
          icon={BookOpen}
          label="Active Courses"
          value={data?.courses ?? 0}
          tint="bg-blue-600/20 text-blue-700 dark:text-blue-300"
          delay={80}
        />
        <Stat
          icon={CalendarClock}
          label="Total Sessions"
          value={data?.sessions ?? 0}
          tint="bg-blue-500/10 text-blue-600 dark:text-blue-400"
          delay={160}
        />
        <Stat
          icon={Clock}
          label="Active Semesters"
          value={data?.semesters ?? 1}
          tint="bg-blue-500/20 text-blue-700 dark:text-blue-300"
          delay={240}
        />
      </div>

      {/* Quick Access Action Bar: Students, Courses, Departments, Sessions, Scan */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-blue-200/80 dark:border-blue-900/40 bg-white dark:bg-card shadow-xs">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-blue-600 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-blue-300">
            Quick Access:
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={"/students" as string} id="quick-btn-students">
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs gap-1.5 h-8.5 shadow-xs"
            >
              <Users className="size-3.5" />
              <span>Students</span>
            </Button>
          </Link>
          <Link to={"/courses" as string} id="quick-btn-courses">
            <Button
              size="sm"
              className="bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs gap-1.5 h-8.5 shadow-xs"
            >
              <BookOpen className="size-3.5" />
              <span>Courses</span>
            </Button>
          </Link>
          <Link to={"/departments" as string} id="quick-btn-departments">
            <Button
              variant="outline"
              size="sm"
              className="border-blue-200 dark:border-blue-800/80 text-blue-900 dark:text-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-xs gap-1.5 h-8.5"
            >
              <Building2 className="size-3.5 text-blue-600 dark:text-blue-400" />
              <span>Departments</span>
            </Button>
          </Link>
          <Link to={"/sessions" as string} id="quick-btn-sessions">
            <Button
              variant="outline"
              size="sm"
              className="border-blue-200 dark:border-blue-800/80 text-blue-900 dark:text-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-xs gap-1.5 h-8.5"
            >
              <CalendarClock className="size-3.5 text-blue-600 dark:text-blue-400" />
              <span>Sessions</span>
            </Button>
          </Link>
          <Link to={"/scan" as string} id="quick-btn-scan">
            <Button
              variant="outline"
              size="sm"
              className="border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-100 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-xs font-semibold gap-1.5 h-8.5"
            >
              <QrCode className="size-3.5 text-blue-600 dark:text-blue-400" />
              <span>Scan & Verify</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Primary Dashboard Hub Cards: Students, Courses, My Account, Settings */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Students Card */}
        <Link
          to={"/students" as string}
          id="dashboard-students-card"
          className="group relative overflow-hidden rounded-2xl border border-blue-200/80 dark:border-blue-900/50 bg-white dark:bg-card text-slate-900 dark:text-foreground p-5 transition-all duration-300 hover:-translate-y-1 hover:border-blue-500 hover:shadow-lg shadow-sm flex flex-col justify-between"
        >
          <div className="pointer-events-none absolute -right-10 -bottom-10 size-32 rounded-full bg-blue-600/5 blur-xl transition-transform group-hover:scale-125" />
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="size-11 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 group-hover:scale-105 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-xs">
                <Users className="size-5" />
              </div>
              <ArrowRight className="size-4 text-blue-600 dark:text-blue-400 transition-transform group-hover:translate-x-1" />
            </div>
            <div className="mt-3.5">
              <div className="text-base font-bold text-slate-900 dark:text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                Students
              </div>
              <p className="text-xs text-slate-500 dark:text-blue-200/60 mt-1 line-clamp-2">
                Manage student rosters, generate QR cards, and monitor enrollment.
              </p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-blue-900/30 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Enrolled</span>
            <span className="font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/70 px-2 py-0.5 rounded border border-blue-200/60 dark:border-blue-800">
              {data?.students ?? 0} Students
            </span>
          </div>
        </Link>

        {/* Courses Card */}
        <Link
          to={"/courses" as string}
          id="dashboard-courses-card"
          className="group relative overflow-hidden rounded-2xl border border-blue-200/80 dark:border-blue-900/50 bg-white dark:bg-card text-slate-900 dark:text-foreground p-5 transition-all duration-300 hover:-translate-y-1 hover:border-blue-500 hover:shadow-lg shadow-sm flex flex-col justify-between"
        >
          <div className="pointer-events-none absolute -right-10 -bottom-10 size-32 rounded-full bg-blue-600/5 blur-xl transition-transform group-hover:scale-125" />
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="size-11 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 group-hover:scale-105 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-xs">
                <BookOpen className="size-5" />
              </div>
              <ArrowRight className="size-4 text-blue-600 dark:text-blue-400 transition-transform group-hover:translate-x-1" />
            </div>
            <div className="mt-3.5">
              <div className="text-base font-bold text-slate-900 dark:text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                Courses
              </div>
              <p className="text-xs text-slate-500 dark:text-blue-200/60 mt-1 line-clamp-2">
                Manage curriculum, assign lecturers, and organize academic departments.
              </p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-blue-900/30 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Active</span>
            <span className="font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/70 px-2 py-0.5 rounded border border-blue-200/60 dark:border-blue-800">
              {data?.courses ?? 0} Courses
            </span>
          </div>
        </Link>

        {/* My Account Card */}
        <Link
          to={"/account" as string}
          id="dashboard-my-account-card"
          className="group relative overflow-hidden rounded-2xl border border-blue-200/80 dark:border-blue-900/50 bg-white dark:bg-card text-slate-900 dark:text-foreground p-5 transition-all duration-300 hover:-translate-y-1 hover:border-blue-500 hover:shadow-lg shadow-sm flex flex-col justify-between"
        >
          <div className="pointer-events-none absolute -right-10 -bottom-10 size-32 rounded-full bg-blue-600/5 blur-xl transition-transform group-hover:scale-125" />
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="size-11 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 group-hover:scale-105 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-xs">
                <FolderKanban className="size-5" />
              </div>
              <ArrowRight className="size-4 text-blue-600 dark:text-blue-400 transition-transform group-hover:translate-x-1" />
            </div>
            <div className="mt-3.5">
              <div className="text-base font-bold text-slate-900 dark:text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                My Account
              </div>
              <p className="text-xs text-slate-500 dark:text-blue-200/60 mt-1 line-clamp-2">
                Access Semesters, Departments, History, and Organization profile.
              </p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-blue-900/30 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Directory</span>
            <span className="font-semibold text-blue-600 dark:text-blue-400">Hub Overview</span>
          </div>
        </Link>

        {/* Settings Card */}
        <Link
          to={"/settings" as string}
          id="dashboard-settings-card"
          className="group relative overflow-hidden rounded-2xl border border-blue-200/80 dark:border-blue-900/50 bg-white dark:bg-card text-slate-900 dark:text-foreground p-5 transition-all duration-300 hover:-translate-y-1 hover:border-blue-500 hover:shadow-lg shadow-sm flex flex-col justify-between"
        >
          <div className="pointer-events-none absolute -right-10 -bottom-10 size-32 rounded-full bg-blue-600/5 blur-xl transition-transform group-hover:scale-125" />
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="size-11 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 group-hover:scale-105 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-xs">
                <Settings className="size-5" />
              </div>
              <ArrowRight className="size-4 text-blue-600 dark:text-blue-400 transition-transform group-hover:translate-x-1" />
            </div>
            <div className="mt-3.5">
              <div className="text-base font-bold text-slate-900 dark:text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                Settings
              </div>
              <p className="text-xs text-slate-500 dark:text-blue-200/60 mt-1 line-clamp-2">
                Configure GPS radius, device lock tolerances, and alerts.
              </p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-blue-900/30 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Security</span>
            <span className="font-semibold text-blue-600 dark:text-blue-400">4-Device Lock</span>
          </div>
        </Link>
      </div>

      {/* Quick Short Steps Guide: Add Departments, Courses, Sessions and Scan */}
      <section
        id="dashboard-steps-guide"
        className="mt-8 mb-4 rounded-2xl border border-blue-200/80 dark:border-blue-900/60 bg-linear-to-b from-blue-50/50 via-white to-white dark:from-blue-950/30 dark:via-card dark:to-card p-5 sm:p-6 shadow-sm"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-blue-100 dark:border-blue-900/50">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[11px] font-bold uppercase tracking-wider mb-1.5">
              <Compass className="size-3.5 text-blue-600 dark:text-blue-400" />
              <span>Step-by-Step Workflow</span>
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              Quick Steps Guide to Taking Attendance
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-blue-200/70 mt-0.5">
              Follow these 4 short steps in sequence to set up your institution and capture verified
              attendance:
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Step 1: Add Departments */}
          <div className="relative flex flex-col justify-between rounded-xl border border-blue-200/70 dark:border-blue-900/50 bg-white dark:bg-card p-4 transition-all duration-200 hover:border-blue-500 hover:shadow-md">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="size-7 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                  1
                </span>
                <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                  Step 1
                </span>
              </div>
              <div className="size-10 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-3">
                <Building2 className="size-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Add Departments</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                Establish academic departments and faculty divisions first to organize all courses.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-blue-900/30">
              <Link to={"/departments" as string}>
                <Button
                  size="sm"
                  className="w-full justify-between bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold h-8 shadow-xs"
                >
                  <span>Add Departments</span>
                  <ArrowRight className="size-3.5" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Step 2: Add Courses */}
          <div className="relative flex flex-col justify-between rounded-xl border border-blue-200/70 dark:border-blue-900/50 bg-white dark:bg-card p-4 transition-all duration-200 hover:border-blue-500 hover:shadow-md">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="size-7 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                  2
                </span>
                <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                  Step 2
                </span>
              </div>
              <div className="size-10 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-3">
                <BookOpen className="size-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Add Courses</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                Create course codes, titles, assigned lecturers, and enroll student rosters.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-blue-900/30">
              <Link to={"/courses" as string}>
                <Button
                  size="sm"
                  className="w-full justify-between bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold h-8 shadow-xs"
                >
                  <span>Add Courses</span>
                  <ArrowRight className="size-3.5" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Step 3: Create Sessions */}
          <div className="relative flex flex-col justify-between rounded-xl border border-blue-200/70 dark:border-blue-900/50 bg-white dark:bg-card p-4 transition-all duration-200 hover:border-blue-500 hover:shadow-md">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="size-7 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                  3
                </span>
                <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                  Step 3
                </span>
              </div>
              <div className="size-10 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-3">
                <CalendarClock className="size-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Create Sessions</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                Launch a live lecture session with dynamic rotating QR and optional GPS check-in.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-blue-900/30">
              <Link to={"/sessions" as string}>
                <Button
                  size="sm"
                  className="w-full justify-between bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold h-8 shadow-xs"
                >
                  <span>Create Session</span>
                  <ArrowRight className="size-3.5" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Step 4: Scan */}
          <div className="relative flex flex-col justify-between rounded-xl border border-blue-200/70 dark:border-blue-900/50 bg-white dark:bg-card p-4 transition-all duration-200 hover:border-blue-500 hover:shadow-md">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="size-7 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                  4
                </span>
                <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                  Step 4
                </span>
              </div>
              <div className="size-10 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-3">
                <QrCode className="size-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Scan & Verify</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                Scan student passes with your camera or barcode scanner with instant attendance
                records.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-blue-900/30">
              <Link to={"/scan" as string}>
                <Button
                  size="sm"
                  className="w-full justify-between bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold h-8 shadow-xs"
                >
                  <span>Open Scanner</span>
                  <ArrowRight className="size-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
