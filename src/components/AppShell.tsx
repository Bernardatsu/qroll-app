import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  LogOut,
  LayoutDashboard,
  Users,
  BookOpen,
  CalendarClock,
  ScanLine,
  FileBarChart,
  Building2,
  Menu,
  Share2,
  Settings,
  CreditCard,
  FileText,
  Shield,
  CalendarRange,
  History,
  Megaphone,
  ClipboardList,
} from "lucide-react";
import { firebaseAuth } from "@/integrations/firebase/config";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import qrollLogo from "@/assets/qroll-logo.png";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  registerOrVerifyDevice,
  getDeviceId,
  listenToDeviceStatus,
  type UserDevice,
} from "@/lib/device-manager";
import { DeviceLimitDialog } from "@/components/DeviceLimitDialog";
import { toast } from "sonner";
import { clearUserAppCache } from "@/lib/query-client";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
};
const nav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/students", label: "Students", icon: Users, adminOnly: true },
  { to: "/courses", label: "Courses", icon: BookOpen, adminOnly: true },
  { to: "/departments", label: "Departments", icon: Building2, adminOnly: true },
  { to: "/semesters", label: "Semesters", icon: CalendarRange, adminOnly: true },
  { to: "/sessions", label: "Sessions", icon: CalendarClock },
  { to: "/scan", label: "Scanner", icon: ScanLine },
  { to: "/portal-links", label: "Student QR Portal", icon: Share2, adminOnly: true },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/history", label: "Academic History", icon: History },
  { to: "/announcements", label: "Announcements & Tasks", icon: Megaphone },
  { to: "/billing", label: "Billing & Plans", icon: CreditCard },
  { to: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1 p-2">
      {nav
        .filter((n) => !n.adminOnly || isAdmin)
        .map((n) => {
          const active = pathname === n.to;
          return (
            <Link
              key={n.to}
              to={n.to as string}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-white/20 text-white"
                  : "text-white/85 hover:bg-white/10 hover:text-white"
              }`}
            >
              <n.icon className="size-4 shrink-0" /> {n.label}
            </Link>
          );
        })}
    </nav>
  );
}

function SidebarBody({
  email,
  role,
  onSignOut,
  isAdmin,
  onNavigate,
}: {
  email?: string;
  role: string;
  onSignOut: () => void;
  isAdmin: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-knust-gradient text-primary-foreground">
      <div className="px-5 py-5 flex items-center gap-3.5 border-b border-white/10">
        <div className="size-14 rounded-2xl bg-white p-1.5 shadow-md flex items-center justify-center shrink-0">
          <img src={qrollLogo} alt="QRoll logo" className="size-full object-contain" />
        </div>
        <div className="leading-tight min-w-0">
          <div className="text-base font-bold tracking-tight text-white truncate">QRoll</div>
          <div className="text-xs text-white/80 truncate">Attendance System</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <NavLinks isAdmin={isAdmin} onNavigate={onNavigate} />
      </div>
      <div className="px-2 pt-3 pb-2 border-t border-white/10">
        <div className="px-2 pb-1.5 text-[10px] uppercase tracking-wider text-white/50 font-semibold">
          Help & Legal
        </div>
        <Link
          to={"/manual" as string}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white transition-colors"
        >
          <BookOpen className="size-4 shrink-0" /> App Manual
        </Link>
        <Link
          to={"/terms" as string}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white transition-colors"
        >
          <FileText className="size-4 shrink-0" /> Terms of Service
        </Link>
        <Link
          to={"/privacy" as string}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white transition-colors"
        >
          <Shield className="size-4 shrink-0" /> Privacy Policy
        </Link>
      </div>
      <div className="p-3 border-t border-white/10">
        <div className="text-xs opacity-80 truncate">{email}</div>
        <div className="text-[10px] uppercase tracking-wider text-gold/90 mt-0.5">{role}</div>
        <Button variant="secondary" size="sm" className="mt-2 w-full" onClick={onSignOut}>
          <LogOut className="size-4 mr-1" /> Sign out
        </Button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, isAdmin, roles } = useAuth();
  const [open, setOpen] = useState(false);
  const [deviceLimitOpen, setDeviceLimitOpen] = useState(false);
  const [activeDevices, setActiveDevices] = useState<UserDevice[]>([]);
  const role = roles[0] ?? "no role";

  const signOut = async () => {
    clearUserAppCache();
    await firebaseAuth.signOut();
    router.navigate({ to: "/auth" });
  };

  // Enforce 4-device limit & listen for revocation
  useEffect(() => {
    if (!user?.id) return;
    const currentDeviceId = getDeviceId();

    // Register/verify this device
    registerOrVerifyDevice(user.id).then((res) => {
      if (res.limitReached) {
        setActiveDevices(res.activeDevices);
        setDeviceLimitOpen(true);
      }
    });

    // Real-time listener: if another session revoked this device, force logout
    const unsub = listenToDeviceStatus(user.id, currentDeviceId, () => {
      toast.error("This device was removed from your account devices. Signed out.");
      void signOut();
    });

    return () => unsub();
  }, [user?.id]);

  return (
    <div className="min-h-screen flex w-full">
      {user?.id && (
        <DeviceLimitDialog
          open={deviceLimitOpen}
          userId={user.id}
          devices={activeDevices}
          onResolved={() => setDeviceLimitOpen(false)}
        />
      )}

      <main className="flex-1 min-w-0 bg-background flex flex-col">
        {/* Header navigation */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 px-3 sm:px-6 py-2.5 border-b bg-background/95 backdrop-blur shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open menu"
                  className="shrink-0 size-9"
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-72 max-w-[85vw]">
                <SheetHeader className="sr-only">
                  <SheetTitle>Navigation</SheetTitle>
                </SheetHeader>
                <SidebarBody
                  email={user?.email}
                  role={role}
                  onSignOut={() => {
                    setOpen(false);
                    void signOut();
                  }}
                  isAdmin={isAdmin}
                  onNavigate={() => setOpen(false)}
                />
              </SheetContent>
            </Sheet>

            <Link to={"/dashboard" as string} className="flex items-center gap-2.5 min-w-0 group">
              <div className="size-9 sm:size-11 rounded-xl bg-white p-1 shadow-sm ring-1 ring-border/50 flex items-center justify-center shrink-0 transition-transform group-hover:scale-105">
                <img src={qrollLogo} alt="QRoll logo" className="size-full object-contain" />
              </div>
              <div className="min-w-0">
                <div className="text-base sm:text-lg font-bold tracking-tight leading-none text-foreground">
                  QRoll
                </div>
                <div className="text-[10px] text-muted-foreground hidden sm:block tracking-wide uppercase font-semibold">
                  Attendance System
                </div>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-1.5">
            <Link to={"/dashboard" as string} aria-label="Dashboard">
              <Button
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex text-xs font-semibold gap-1.5 h-8"
              >
                <LayoutDashboard className="size-3.5" /> Dashboard
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={signOut}
              aria-label="Sign out"
              className="text-xs h-8 px-2.5 font-medium"
            >
              <LogOut className="size-3.5 mr-1" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </header>

        {/* Content area: well-proportioned responsive container */}
        <div className="flex-1 w-full max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 min-w-0">
          {children}
        </div>
      </main>
    </div>
  );
}
