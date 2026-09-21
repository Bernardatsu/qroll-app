import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  Building2,
  CalendarRange,
  History,
  Users,
  CalendarClock,
  ScanLine,
  FileBarChart,
  Megaphone,
  Settings,
  Shield,
  CreditCard,
  HelpCircle,
  FileText,
  Lock,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Sliders,
  FolderKanban,
  GraduationCap,
  MoveHorizontal,
  LayoutList,
  Columns3,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "My Account — QRoll" },
      {
        name: "description",
        content: "Academic directory, tutor account tools, and system settings.",
      },
    ],
  }),
  component: AccountPage,
});

interface SectionItem {
  to: string;
  icon: any;
  title: string;
  description: string;
  fullWidth?: boolean;
}

interface SectionConfig {
  id: number;
  shortLabel: string;
  fullLabel: string;
  icon: any;
  badge: string;
  title: string;
  description: string;
  items: SectionItem[];
}

const ACCOUNT_SECTIONS: SectionConfig[] = [
  {
    id: 0,
    shortLabel: "Tools",
    fullLabel: "All Tools & Settings",
    icon: Sliders,
    badge: "1 of 3 · Tools",
    title: "All Tools & Settings",
    description: "Attendance sessions, scanner, reports, announcements & guides",
    items: [
      {
        to: "/sessions",
        icon: CalendarClock,
        title: "Attendance Sessions",
        description: "Open live class sessions, generate projected QR codes, and monitor scans.",
      },
      {
        to: "/scan",
        icon: ScanLine,
        title: "QR Code Scanner",
        description: "Fast scanning via built-in camera, external webcam or barcode hardware.",
      },
      {
        to: "/reports",
        icon: FileBarChart,
        title: "Reports & Analysis",
        description: "Clean deduplicated attendance summaries, 10-mark scores and Excel exports.",
      },
      {
        to: "/announcements",
        icon: Megaphone,
        title: "Announcements & Tasks",
        description: "Broadcast classroom notices and push alerts directly to student portals.",
      },
      {
        to: "/manual",
        icon: HelpCircle,
        title: "User Manual",
        description: "Step-by-step instructions for courses, rosters, GPS tolerance and QR cards.",
      },
      {
        to: "/terms",
        icon: FileText,
        title: "Terms & Privacy",
        description: "Academic privacy policy, student data retention and compliance terms.",
      },
    ],
  },
  {
    id: 1,
    shortLabel: "Directory",
    fullLabel: "Academic Directory",
    icon: FolderKanban,
    badge: "2 of 3 · Directory",
    title: "Academic Directory",
    description: "Semesters, departments, courses, academic history & student rosters",
    items: [
      {
        to: "/semesters",
        icon: CalendarRange,
        title: "Semesters",
        description: "Set active term, start/end dates, academic weeks and exam windows.",
      },
      {
        to: "/departments",
        icon: Building2,
        title: "Departments",
        description: "Faculties, degree programs and academic department hierarchies.",
      },
      {
        to: "/courses",
        icon: BookOpen,
        title: "Courses",
        description: "Course codes, descriptions, class levels and student rosters.",
      },
      {
        to: "/history",
        icon: History,
        title: "Academic History",
        description: "Archived past semester attendance records and historical transcripts.",
      },
      {
        to: "/students",
        icon: Users,
        title: "Students Roster & Passes",
        description: "Enrolled student index numbers, profiles, and printable attendance QR cards.",
        fullWidth: true,
      },
    ],
  },
  {
    id: 2,
    shortLabel: "Security",
    fullLabel: "Settings & Security",
    icon: Shield,
    badge: "3 of 3 · Security",
    title: "Settings & Security",
    description: "Device authorization, billing, account security and preferences",
    items: [
      {
        to: "/settings",
        icon: Settings,
        title: "General & GPS Settings",
        description: "Classroom geofence radius, passing marks and attendance thresholds.",
      },
      {
        to: "/settings",
        icon: Smartphone,
        title: "Device Authorization",
        description: "Manage active trusted devices and enforce the 4-device session limit.",
      },
      {
        to: "/billing",
        icon: CreditCard,
        title: "Billing & Subscription",
        description: "View current subscription plan, manage billing invoices and upgrades.",
      },
      {
        to: "/settings",
        icon: Lock,
        title: "Security & Password",
        description: "Update lecturer login password and review authentication logs.",
      },
    ],
  },
];

export function AccountPage() {
  const { user, roles, isAdmin } = useAuth();
  const role = roles[0] ?? "Lecturer";
  const [activeSection, setActiveSection] = useState<number>(0);
  const [viewMode, setViewMode] = useState<"carousel" | "list">("carousel");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Mouse drag-to-move state for desktop
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startScrollLeft, setStartScrollLeft] = useState(0);
  const [hasDragged, setHasDragged] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  const scrollToIndex = (index: number) => {
    setActiveSection(index);
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const children = Array.from(container.children) as HTMLElement[];
    if (children[index]) {
      const target = children[index];
      container.scrollTo({
        left: target.offsetLeft - container.offsetLeft,
        behavior: "smooth",
      });
    } else {
      const panelWidth = container.clientWidth;
      container.scrollTo({
        left: index * panelWidth,
        behavior: "smooth",
      });
    }
  };

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const scrollPos = container.scrollLeft;
    const maxScroll = container.scrollWidth - container.clientWidth;
    if (maxScroll > 0) {
      setScrollProgress(scrollPos / maxScroll);
    }
    const children = Array.from(container.children) as HTMLElement[];
    if (children.length > 0) {
      let closestIndex = 0;
      let minDiff = Infinity;
      children.forEach((child, idx) => {
        const childLeft = child.offsetLeft - container.offsetLeft;
        const diff = Math.abs(scrollPos - childLeft);
        if (diff < minDiff) {
          minDiff = diff;
          closestIndex = idx;
        }
      });
      if (closestIndex !== activeSection && closestIndex >= 0 && closestIndex <= 2) {
        setActiveSection(closestIndex);
      }
    }
  };

  // Mouse drag handlers for desktop smooth horizontal movement
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    setIsDragging(true);
    setHasDragged(false);
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
    setStartScrollLeft(scrollContainerRef.current.scrollLeft);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const distance = (x - startX) * 1.35;
    if (Math.abs(x - startX) > 6) {
      setHasDragged(true);
    }
    scrollContainerRef.current.scrollLeft = startScrollLeft - distance;
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const scrollPos = container.scrollLeft;
      const children = Array.from(container.children) as HTMLElement[];
      if (children.length > 0) {
        let closestIndex = 0;
        let minDiff = Infinity;
        children.forEach((child, idx) => {
          const childLeft = child.offsetLeft - container.offsetLeft;
          const diff = Math.abs(scrollPos - childLeft);
          if (diff < minDiff) {
            minDiff = diff;
            closestIndex = idx;
          }
        });
        scrollToIndex(closestIndex);
      }
    }
  };

  const handleMouseLeave = () => {
    if (isDragging) {
      setIsDragging(false);
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (hasDragged) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // Ensure scroll position resets cleanly when toggling carousel
  useEffect(() => {
    if (viewMode === "carousel") {
      const timer = setTimeout(() => {
        scrollToIndex(activeSection);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [viewMode, activeSection]);

  return (
    <AppShell>
      <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto min-w-0">
        {/* Tutor Profile Header Card - Responsive royal blue banner */}
        <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 border border-blue-600/30 text-white p-4 sm:p-6 md:p-8 shadow-md">
          <div className="pointer-events-none absolute -right-16 -top-16 size-48 sm:size-64 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-12 -bottom-12 size-36 sm:size-48 rounded-full bg-blue-400/20 blur-2xl" />

          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-5">
            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 border border-white/25 px-2.5 py-0.5 text-[11px] font-semibold text-white max-w-full">
                <GraduationCap className="size-3.5 text-blue-200 shrink-0" />
                <span className="truncate">My Tutor Account & System Hub</span>
              </div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-white truncate max-w-full">
                {(user as any)?.displayName || user?.email || "Tutor Dashboard"}
              </h1>
              <div className="text-xs sm:text-sm text-blue-100/90 flex flex-wrap items-center gap-1.5 break-all">
                <span className="truncate max-w-[240px] sm:max-w-none">{user?.email}</span>
                <span>·</span>
                <span className="text-white font-semibold">{role}</span>
                {isAdmin && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] uppercase font-bold bg-white/20 text-white border border-white/30 shrink-0">
                    Administrator
                  </span>
                )}
              </div>
            </div>

            {/* Quick action buttons - balanced 2-column on mobile screen */}
            <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center sm:gap-2.5 shrink-0">
              <Link to={"/settings" as string} className="w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full bg-white/15 border-white/30 text-white hover:bg-white/25 font-semibold text-xs h-9 sm:h-9 active:scale-[0.98]"
                >
                  <Settings className="size-3.5 mr-1.5 text-blue-200 shrink-0" />
                  Preferences
                </Button>
              </Link>
              <Link to={"/dashboard" as string} className="w-full sm:w-auto">
                <Button
                  size="sm"
                  className="w-full bg-white text-blue-900 hover:bg-blue-50 font-bold text-xs h-9 sm:h-9 shadow-md active:scale-[0.98]"
                >
                  <ArrowRight className="size-3.5 mr-1.5 shrink-0" />
                  Dashboard
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Mobile-Friendly Tabs & Navigation Toolbar */}
        <div className="space-y-2.5 bg-slate-100 dark:bg-card p-2 sm:p-3 rounded-xl border border-slate-200 dark:border-border shadow-xs">
          {/* Main 3 Section Tabs: Clean 3-segment grid on small mobile, flex row on sm+ */}
          <div className="grid grid-cols-3 gap-1 sm:flex sm:items-center sm:gap-2 w-full">
            {ACCOUNT_SECTIONS.map((tab) => {
              const active = activeSection === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (viewMode === "list") {
                      const el = document.getElementById(`account-section-${tab.id}`);
                      el?.scrollIntoView({ behavior: "smooth", block: "start" });
                      setActiveSection(tab.id);
                    } else {
                      scrollToIndex(tab.id);
                    }
                  }}
                  className={`flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-2 sm:px-3.5 py-2 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-150 min-h-[38px] ${
                    active
                      ? "bg-blue-600 text-white font-bold shadow-xs"
                      : "text-slate-600 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground hover:bg-white dark:hover:bg-muted active:bg-slate-200"
                  }`}
                >
                  <Icon
                    className={`size-3.5 sm:size-4 shrink-0 ${active ? "text-white" : "text-blue-600 dark:text-blue-400"}`}
                  />
                  <span className="sm:hidden text-[11px] leading-none font-medium truncate">
                    {tab.shortLabel}
                  </span>
                  <span className="hidden sm:inline whitespace-nowrap">{tab.fullLabel}</span>
                </button>
              );
            })}
          </div>

          {/* Sub-toolbar: View mode switcher & Carousel controls */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/60 dark:border-border/60">
            {/* View Mode Toggle: Swipe Carousel vs. Continuous List */}
            <div className="inline-flex items-center gap-1 bg-white dark:bg-muted p-0.5 rounded-lg border border-slate-200 dark:border-border">
              <button
                onClick={() => setViewMode("carousel")}
                aria-label="Swipe carousel view"
                className={`px-2 py-1 rounded text-[11px] sm:text-xs font-semibold flex items-center gap-1 transition-colors ${
                  viewMode === "carousel"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground"
                }`}
              >
                <Columns3 className="size-3.5 shrink-0" />
                <span>Swipe</span>
              </button>
              <button
                onClick={() => setViewMode("list")}
                aria-label="Continuous list view"
                className={`px-2 py-1 rounded text-[11px] sm:text-xs font-semibold flex items-center gap-1 transition-colors ${
                  viewMode === "list"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground"
                }`}
              >
                <LayoutList className="size-3.5 shrink-0" />
                <span>List</span>
              </button>
            </div>

            {/* Carousel navigation & indicators */}
            {viewMode === "carousel" ? (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60 px-2 py-0.5 rounded-full font-medium">
                  <MoveHorizontal className="size-3 text-blue-600 dark:text-blue-400 animate-pulse" />
                  <span className="hidden xs:inline">Swipe or use arrows</span>
                  <span className="xs:hidden">{activeSection + 1}/3</span>
                </span>

                <Button
                  variant="outline"
                  size="icon"
                  disabled={activeSection === 0}
                  onClick={() => scrollToIndex(Math.max(0, activeSection - 1))}
                  aria-label="Previous section"
                  className="size-8 bg-white dark:bg-muted border-slate-200 dark:border-border text-slate-700 dark:text-foreground hover:bg-slate-50 dark:hover:bg-card disabled:opacity-30 active:scale-95"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={activeSection === 2}
                  onClick={() => scrollToIndex(Math.min(2, activeSection + 1))}
                  aria-label="Next section"
                  className="size-8 bg-white dark:bg-muted border-slate-200 dark:border-border text-slate-700 dark:text-foreground hover:bg-slate-50 dark:hover:bg-card disabled:opacity-30 active:scale-95"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            ) : (
              <span className="text-[11px] text-slate-500 dark:text-muted-foreground font-medium">
                Continuous vertical scroll
              </span>
            )}
          </div>
        </div>

        {/* Real-time horizontal scroll progress bar in carousel mode */}
        {viewMode === "carousel" && (
          <div className="h-1 w-full bg-slate-200 dark:bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-500 transition-all duration-150"
              style={{ width: `${Math.max(12, scrollProgress * 100)}%` }}
            />
          </div>
        )}

        {/* ========================================================================= */}
        {/* CAROUSEL MODE: HORIZONTALLY SWIPEABLE CONTAINERS                           */}
        {/* ========================================================================= */}
        {viewMode === "carousel" && (
          <div
            id="my-account-horizontal-container"
            ref={scrollContainerRef}
            onScroll={handleScroll}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            className={`flex w-full overflow-x-auto snap-x snap-mandatory gap-3 sm:gap-5 pb-3 sm:pb-4 pt-0.5 scroll-smooth transition-colors touch-pan-x overscroll-x-contain scrollbar-none ${
              isDragging ? "cursor-grabbing select-none" : "cursor-grab"
            }`}
            style={{
              scrollbarWidth: "none",
            }}
          >
            {ACCOUNT_SECTIONS.map((section) => {
              const SectionIcon = section.icon;
              return (
                <div
                  key={section.id}
                  className="w-full min-w-full sm:min-w-[90%] md:min-w-[620px] lg:min-w-[700px] xl:flex-1 shrink-0 snap-center"
                >
                  <Card className="h-full bg-white dark:bg-card border border-slate-200 dark:border-border shadow-xs text-slate-900 dark:text-foreground">
                    <CardHeader className="border-b border-slate-100 dark:border-border/60 p-3.5 sm:p-5 bg-slate-50/50 dark:bg-muted/20">
                      <div className="flex items-start sm:items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="size-9 sm:size-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                            <SectionIcon className="size-4.5 sm:size-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <CardTitle className="text-base sm:text-lg font-bold text-slate-900 dark:text-foreground truncate">
                              {section.title}
                            </CardTitle>
                            <CardDescription className="text-xs text-slate-500 dark:text-muted-foreground line-clamp-1 sm:line-clamp-none mt-0.5">
                              {section.description}
                            </CardDescription>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/60 px-2 py-0.5 rounded shrink-0 whitespace-nowrap">
                          {section.badge}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-5 grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-2">
                      {section.items.map((item, idx) => {
                        const ItemIcon = item.icon;
                        return (
                          <Link
                            key={idx}
                            to={item.to as string}
                            onClick={handleCardClick}
                            className={`group p-3 sm:p-3.5 rounded-xl border border-slate-200/80 dark:border-border bg-slate-50/60 hover:bg-blue-50/70 dark:bg-muted/30 dark:hover:bg-blue-950/20 hover:border-blue-300 dark:hover:border-blue-700/60 active:scale-[0.99] active:bg-blue-100/50 dark:active:bg-blue-900/30 transition-all duration-150 shadow-xs flex items-center justify-between gap-3 min-h-[58px] sm:min-h-[64px] ${
                              item.fullWidth ? "sm:col-span-2" : ""
                            }`}
                          >
                            <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                              <div className="p-2 rounded-lg bg-blue-100/80 dark:bg-blue-950 text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0 mt-0.5">
                                <ItemIcon className="size-4 sm:size-4.5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                                  {item.title}
                                </div>
                                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                                  {item.description}
                                </p>
                              </div>
                            </div>
                            <ChevronRight className="size-4 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 shrink-0 transition-transform group-hover:translate-x-0.5" />
                          </Link>
                        );
                      })}
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        )}

        {/* Scroll position indicators (Carousel mode only) */}
        {viewMode === "carousel" && (
          <div className="flex flex-col items-center justify-center gap-1.5 pt-0.5 pb-2">
            <div className="flex items-center justify-center gap-2">
              {[0, 1, 2].map((idx) => (
                <button
                  key={idx}
                  onClick={() => scrollToIndex(idx)}
                  aria-label={`Jump to panel ${idx + 1}`}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    activeSection === idx
                      ? "w-8 sm:w-9 bg-blue-600 shadow-xs"
                      : "w-2.5 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400"
                  }`}
                />
              ))}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-muted-foreground sm:hidden">
              Swipe left / right to browse tools
            </p>
          </div>
        )}

        {/* ========================================================================= */}
        {/* LIST MODE: CONTINUOUS VERTICAL STACK (Ideal for slim screens)              */}
        {/* ========================================================================= */}
        {viewMode === "list" && (
          <div className="space-y-4 sm:space-y-6">
            {ACCOUNT_SECTIONS.map((section) => {
              const SectionIcon = section.icon;
              return (
                <div
                  key={section.id}
                  id={`account-section-${section.id}`}
                  className="w-full scroll-mt-24"
                >
                  <Card className="bg-white dark:bg-card border border-slate-200 dark:border-border shadow-xs text-slate-900 dark:text-foreground">
                    <CardHeader className="border-b border-slate-100 dark:border-border/60 p-3.5 sm:p-5 bg-slate-50/50 dark:bg-muted/20">
                      <div className="flex items-start sm:items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="size-9 sm:size-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                            <SectionIcon className="size-4.5 sm:size-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <CardTitle className="text-base sm:text-lg font-bold text-slate-900 dark:text-foreground truncate">
                              {section.title}
                            </CardTitle>
                            <CardDescription className="text-xs text-slate-500 dark:text-muted-foreground line-clamp-1 sm:line-clamp-none mt-0.5">
                              {section.description}
                            </CardDescription>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/60 px-2 py-0.5 rounded shrink-0 whitespace-nowrap">
                          {section.badge}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-5 grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-2">
                      {section.items.map((item, idx) => {
                        const ItemIcon = item.icon;
                        return (
                          <Link
                            key={idx}
                            to={item.to as string}
                            className={`group p-3 sm:p-3.5 rounded-xl border border-slate-200/80 dark:border-border bg-slate-50/60 hover:bg-blue-50/70 dark:bg-muted/30 dark:hover:bg-blue-950/20 hover:border-blue-300 dark:hover:border-blue-700/60 active:scale-[0.99] active:bg-blue-100/50 dark:active:bg-blue-900/30 transition-all duration-150 shadow-xs flex items-center justify-between gap-3 min-h-[58px] sm:min-h-[64px] ${
                              item.fullWidth ? "sm:col-span-2" : ""
                            }`}
                          >
                            <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                              <div className="p-2 rounded-lg bg-blue-100/80 dark:bg-blue-950 text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0 mt-0.5">
                                <ItemIcon className="size-4 sm:size-4.5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                                  {item.title}
                                </div>
                                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                                  {item.description}
                                </p>
                              </div>
                            </div>
                            <ChevronRight className="size-4 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 shrink-0 transition-transform group-hover:translate-x-0.5" />
                          </Link>
                        );
                      })}
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
