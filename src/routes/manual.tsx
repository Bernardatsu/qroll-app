import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  BookOpen,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Download,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  HelpCircle,
  Home,
  Layers,
  QrCode,
  ScanLine,
  Search,
  ShieldCheck,
  Smartphone,
  Users,
  WifiOff,
  X,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/manual")({
  head: () => ({
    meta: [
      { title: "User Manual & System Guide — QRoll" },
      {
        name: "description",
        content:
          "Comprehensive step-by-step user manual for lecturers, administrators, and students using QRoll.",
      },
      { property: "og:title", content: "User Manual & System Guide — QRoll" },
      {
        property: "og:description",
        content: "Step-by-step guide for QR code attendance, grading, scanning, and reports.",
      },
      { property: "og:type", content: "article" },
    ],
  }),
  component: ManualPage,
});

interface GuideSection {
  id: string;
  category: "lecturer" | "student" | "admin" | "faq";
  title: string;
  badge: string;
  icon: any;
  summary: string;
  steps: { title: string; desc: string }[];
  tips?: string[];
}

const SECTIONS: GuideSection[] = [
  {
    id: "getting-started",
    category: "admin",
    title: "1. Academic Setup (Departments & Semesters)",
    badge: "Initial Setup",
    icon: Layers,
    summary: "Establish your university structure before adding courses and students.",
    steps: [
      {
        title: "Create Academic Departments",
        desc: "Navigate to 'Departments' from the sidebar. Add your departments (e.g., Computer Science, Electrical Engineering, Nursing).",
      },
      {
        title: "Set Up Academic Semesters",
        desc: "Go to 'Semesters'. Add the current academic year and semester (e.g., 2025/2026 Semester 1). Mark it as 'Current Semester'.",
      },
      {
        title: "Define Class Levels",
        desc: "Under 'Students', manage levels (100, 200, 300, 400). You can also add custom levels if needed.",
      },
    ],
    tips: [
      "Always set an active semester so new courses and attendance sessions are grouped correctly.",
    ],
  },
  {
    id: "courses-setup",
    category: "lecturer",
    title: "2. Courses & Student Enrollment",
    badge: "Lecturer & Admin",
    icon: BookOpen,
    summary: "Configure course codes, credit hours, and assign enrolled students.",
    steps: [
      {
        title: "Create a Course",
        desc: "Go to 'Courses' and click '+ Add Course'. Enter Course Code (e.g., CS 301), Course Title, Department, Level, and Credit Hours.",
      },
      {
        title: "Register Students to the Course",
        desc: "Click on any course row or click 'Enrollments' to batch-register students of that level or department to the course.",
      },
      {
        title: "Publish Course Announcements & Assignments",
        desc: "Lecturers can post course notices and assign submissions directly from the Announcements and Assignments tabs.",
      },
    ],
  },
  {
    id: "students-qr",
    category: "lecturer",
    title: "3. Students & Individual QR Code Passes",
    badge: "Core Feature",
    icon: Users,
    summary: "Import student rosters, generate individual QR codes, and print ID badges.",
    steps: [
      {
        title: "Add Individual Students",
        desc: "Under 'Students', click '+ Add Student'. Provide Full Name, Index Number, Level, and Department.",
      },
      {
        title: "Bulk Excel Import",
        desc: "Click 'Import Excel'. Upload an .xlsx file with column headers: 'Full Name', 'Index Number', 'Level', and 'Department'. QRoll automatically generates unique QR credentials for every student.",
      },
      {
        title: "Generate & Print Student QR Passes",
        desc: "Click the QR Code icon next to any student to view their high-resolution pass. Click 'Save PNG' to save the QR image, or 'Print Pass' for a formatted physical badge.",
      },
    ],
    tips: [
      "Students can also view and download their own QR pass directly by logging into the Student Portal with their Index Number!",
    ],
  },
  {
    id: "live-session-projector",
    category: "lecturer",
    title: "4. Live Session & Projector Screen Check-in",
    badge: "Classroom Mode",
    icon: CalendarClock,
    summary: "Launch a class session and project the dynamic check-in QR on the auditorium screen.",
    steps: [
      {
        title: "Create a Session",
        desc: "Go to 'Sessions' and click '+ New Session'. Select the course, date, start time, and duration.",
      },
      {
        title: "Project Session QR Code on Wall / Screen",
        desc: "Click 'Project QR' on the active session. This opens a high-contrast full-screen view with a live rotating QR code.",
      },
      {
        title: "Students Scan to Self Check-In",
        desc: "Students scan the projected screen using their smartphone camera or QRoll student page. Their attendance is recorded instantaneously.",
      },
      {
        title: "Anti-Cheating & Dynamic Token",
        desc: "The projector QR code dynamically refreshes to prevent students from sharing static screenshots outside the lecture hall.",
      },
    ],
  },
  {
    id: "camera-scanner",
    category: "lecturer",
    title: "5. Multi-Camera QR Scanner & Offline Mode",
    badge: "Scanner Tool",
    icon: ScanLine,
    summary: "Use your laptop or phone camera to scan student QR codes at the lecture door.",
    steps: [
      {
        title: "Open Scanner",
        desc: "Click 'Scanner' in the sidebar or dashboard. Select your active course session from the dropdown.",
      },
      {
        title: "Grant Camera Permission",
        desc: "Allow camera access in your browser. You can switch between front and back cameras on mobile devices.",
      },
      {
        title: "Scan Student QR Badges",
        desc: "Hold student QR cards in front of the lens. The system provides instant audio beep feedback and marks the student present.",
      },
      {
        title: "Manual Index Entry Fallback",
        desc: "If a student forgot their phone/badge, type their index number in the manual input box and click 'Mark Present'.",
      },
      {
        title: "Offline Sync Support",
        desc: "If internet connection is lost, the scanner keeps operating locally in offline mode. When internet is restored, all cached check-ins automatically sync to the cloud.",
      },
    ],
  },
  {
    id: "reports-grading",
    category: "lecturer",
    title: "6. Attendance Reports & 10-Mark University Grading",
    badge: "Grading & Export",
    icon: FileSpreadsheet,
    summary: "Automated attendance tracking, grade calculations, and at-risk student monitoring.",
    steps: [
      {
        title: "Select Course and Session Range",
        desc: "Navigate to 'Reports'. Choose your course and optional date range. Summary metrics update instantly.",
      },
      {
        title: "10-Mark Attendance Grading Formula",
        desc: "QRoll automatically computes the standard university 10-mark continuous assessment score based on attended sessions over total sessions.",
      },
      {
        title: "Identify At-Risk Students",
        desc: "The report automatically highlights students whose attendance falls below 75% in red badges so you can issue exam disqualification warnings.",
      },
      {
        title: "Export to Excel, CSV or PDF",
        desc: "Click 'Export Excel' to download an Excel sheet with all students, sessions dates, attendance percentages, and final marks. Click 'Print / PDF' for a clean printable administrative report.",
      },
    ],
  },
  {
    id: "student-portal",
    category: "student",
    title: "7. Student Portal Access & QR Pass",
    badge: "For Students",
    icon: GraduationCap,
    summary:
      "How students sign in, retrieve their digital QR pass, and monitor attendance records.",
    steps: [
      {
        title: "Visit the Student Page",
        desc: "Navigate to '/student' on your phone or computer. Enter your university Index Number.",
      },
      {
        title: "Initial Password Setup",
        desc: "If signing in for the first time, set a secure password (minimum 6 characters).",
      },
      {
        title: "View Digital QR Code Pass",
        desc: "Your student dashboard shows your personal QR code. You can download the PNG or show your screen to the lecturer's scanner.",
      },
      {
        title: "Track Attendance & Warnings",
        desc: "View attendance percentage for each enrolled course. Any course below the 75% threshold displays an immediate warning banner.",
      },
    ],
  },
  {
    id: "billing-plans",
    category: "admin",
    title: "8. Billing, Plans & Subscription",
    badge: "Billing",
    icon: CreditCard,
    summary: "Free trial details, plans, and payment methods.",
    steps: [
      {
        title: "7-Day Free Trial with All Features",
        desc: "Every newly registered lecturer or institution receives a full 7-day free trial with unlimited students, courses, scanning, and exports.",
      },
      {
        title: "Choose a Subscription Plan",
        desc: "Go to 'Billing & Plans'. Select from Monthly (GHS 45.00), Per Semester (GHS 120.00), or Yearly (GHS 450.00).",
      },
      {
        title: "Pay via Mobile Money or Card",
        desc: "Payments are processed securely. Supports MTN Mobile Money, Telecel Cash, AT Money, Visa, Mastercard, and Bank Transfer.",
      },
      {
        title: "Instant Activation",
        desc: "Upon successful payment, your account is immediately verified and upgraded with no waiting period.",
      },
    ],
  },
  {
    id: "troubleshooting-faq",
    category: "faq",
    title: "9. Frequently Asked Questions & Troubleshooting",
    badge: "FAQ",
    icon: HelpCircle,
    summary: "Quick solutions for common classroom scenarios.",
    steps: [
      {
        title: "Camera not opening on Scanner?",
        desc: "Make sure you have granted browser permissions for camera access. On mobile, ensure no other app is currently using the camera.",
      },
      {
        title: "Student QR code not scanning?",
        desc: "Ensure the student's screen brightness is turned up, or wipe any smudges on printed badges. You can also type their index number directly into the manual entry field.",
      },
      {
        title: "Can students scan the session QR remotely from their hostel?",
        desc: "No! Projector session QR codes rotate continuously. Only students physically present inside the lecture hall looking at the screen can scan the active token.",
      },
      {
        title: "What if there is no internet in the lecture hall?",
        desc: "QRoll works offline! The scanner tool queues all scans on your local device and syncs them as soon as you reconnect to Wi-Fi or mobile data.",
      },
    ],
  },
];

function ManualPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filteredSections = useMemo(() => {
    return SECTIONS.filter((sec) => {
      const matchTab = activeTab === "all" || sec.category === activeTab;
      const q = search.toLowerCase().trim();
      const matchQuery =
        !q ||
        sec.title.toLowerCase().includes(q) ||
        sec.summary.toLowerCase().includes(q) ||
        sec.steps.some(
          (s) => s.title.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q),
        );
      return matchTab && matchQuery;
    });
  }, [activeTab, search]);

  const close = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      router.navigate({ to: "/dashboard" });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur px-4 py-3 sm:px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground font-bold">
              <BookOpen className="size-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold leading-tight">
                QRoll System User Manual
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Complete walkthrough for lecturers, administrators & students
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a href="/app-manual.pdf" download="QRoll-User-Manual.pdf">
              <Button variant="outline" size="sm" className="text-xs">
                <Download className="size-3.5 mr-1" />
                <span className="hidden sm:inline">Download PDF</span>
              </Button>
            </a>
            <Link to={"/dashboard" as string}>
              <Button variant="outline" size="sm" className="text-xs">
                <Home className="size-3.5 mr-1" />
                <span className="hidden sm:inline">Dashboard</span>
              </Button>
            </Link>
            <Button size="sm" variant="ghost" onClick={close} aria-label="Close manual">
              <X className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Banner / Introduction */}
        <div className="rounded-2xl bg-knust-gradient text-primary-foreground p-6 sm:p-8 shadow-sm">
          <div className="max-w-3xl space-y-2">
            <Badge variant="secondary" className="text-xs font-semibold uppercase tracking-wider">
              Official Documentation
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Welcome to the QRoll Knowledge Base
            </h2>
            <p className="text-sm sm:text-base text-primary-foreground/85 leading-relaxed">
              Find detailed explanations for every tool in the QRoll suite: session creation, QR
              code generation, classroom projection, camera scanning, Excel reports, and
              subscription plans.
            </p>
          </div>

          {/* Search Bar */}
          <div className="mt-6 max-w-lg relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search guides, tools, or topics..."
              className="pl-10 bg-background text-foreground border-none shadow-md h-11"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
            <TabsList className="grid grid-cols-5 w-full sm:w-auto">
              <TabsTrigger value="all">All Guides</TabsTrigger>
              <TabsTrigger value="lecturer">Lecturer</TabsTrigger>
              <TabsTrigger value="student">Student</TabsTrigger>
              <TabsTrigger value="admin">Admin</TabsTrigger>
              <TabsTrigger value="faq">FAQ</TabsTrigger>
            </TabsList>
          </Tabs>
          <span className="text-xs text-muted-foreground">
            Showing {filteredSections.length} guide{filteredSections.length === 1 ? "" : "s"}
          </span>
        </div>

        {/* Guides Grid */}
        <div className="space-y-6">
          {filteredSections.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground">
              <HelpCircle className="size-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="font-semibold">No matching guides found</p>
              <p className="text-xs mt-1">Try clearing your search query or switching tabs.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setSearch("");
                  setActiveTab("all");
                }}
              >
                Reset filter
              </Button>
            </Card>
          ) : (
            filteredSections.map((sec) => (
              <Card key={sec.id} className="border-border/80 shadow-sm overflow-hidden bg-card">
                <CardHeader className="bg-muted/40 border-b pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
                        <sec.icon className="size-5" />
                      </div>
                      <div>
                        <CardTitle className="text-lg font-bold text-foreground">
                          {sec.title}
                        </CardTitle>
                        <p className="text-sm font-medium text-foreground/80 mt-1">{sec.summary}</p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="w-fit shrink-0 text-xs font-semibold px-2.5 py-1 border-primary/30 text-primary"
                    >
                      {sec.badge}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-5 sm:p-6 space-y-4">
                  <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                    {sec.steps.map((st, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-border/80 bg-background/80 p-4 space-y-2 flex flex-col justify-between shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center gap-2.5 font-bold text-sm text-foreground">
                            <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground text-[11px] font-bold shrink-0">
                              {i + 1}
                            </span>
                            {st.title}
                          </div>
                          <p className="text-sm text-foreground/85 leading-relaxed font-normal">
                            {st.desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {sec.tips && sec.tips.length > 0 && (
                    <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm text-foreground space-y-1.5">
                      <div className="font-bold text-primary flex items-center gap-1.5">
                        <CheckCircle2 className="size-4.5" /> Pro Tip:
                      </div>
                      {sec.tips.map((t, idx) => (
                        <p
                          key={idx}
                          className="text-foreground/90 pl-6 font-medium text-sm leading-relaxed"
                        >
                          {t}
                        </p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Bottom Quick Navigation Links */}
        <div className="rounded-xl border bg-card p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-base">Ready to start managing your classroom?</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Jump straight to the dashboard or start a live scanner session.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link to={"/scan" as string}>
              <Button size="sm" className="text-xs">
                <ScanLine className="size-4 mr-1.5" /> Open Scanner
              </Button>
            </Link>
            <Link to={"/sessions" as string}>
              <Button size="sm" variant="outline" className="text-xs">
                <CalendarClock className="size-4 mr-1.5" /> View Sessions
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
