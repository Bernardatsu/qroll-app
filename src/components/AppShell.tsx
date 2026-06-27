import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import pesaLogo from "@/assets/pesa-logo.png.asset.json";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

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
  { to: "/sessions", label: "Sessions", icon: CalendarClock },
  { to: "/scan", label: "Scanner", icon: ScanLine },
  { to: "/reports", label: "Reports", icon: FileBarChart },
];

function NavLinks({
  isAdmin,
  onNavigate,
}: {
  isAdmin: boolean;
  onNavigate?: () => void;
}) {
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
      <div className="px-5 py-5 flex items-center gap-3 border-b border-white/10">
        <img
          src={pesaLogo.url}
          alt="Petroleum Engineering Students Association logo"
          className="size-11 rounded-full bg-white object-contain p-0.5 shrink-0"
        />
        <div className="leading-tight min-w-0">
          <div className="text-sm font-semibold truncate">PESA KNUST</div>
          <div className="text-xs opacity-80 truncate">Attendance System</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <NavLinks isAdmin={isAdmin} onNavigate={onNavigate} />
      </div>
      <div className="p-3 border-t border-white/10">
        <div className="text-xs opacity-80 truncate">{email}</div>
        <div className="text-[10px] uppercase tracking-wider text-gold/90 mt-0.5">
          {role}
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="mt-2 w-full"
          onClick={onSignOut}
        >
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
  const role = roles[0] ?? "no role";

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen flex w-full">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:border-r md:border-border">
        <SidebarBody
          email={user?.email}
          role={role}
          onSignOut={signOut}
          isAdmin={isAdmin}
        />
      </aside>

      <main className="flex-1 min-w-0 bg-background flex flex-col">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-2 px-3 py-2 border-b bg-background/95 backdrop-blur">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
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
          <div className="flex items-center gap-2 min-w-0">
            <img
              src={pesaLogo.url}
              alt="Petroleum Engineering Students Association logo"
              className="size-8 rounded-full bg-white object-contain p-0.5 shrink-0"
            />
            <div className="text-sm font-semibold truncate">KNUST Attendance</div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            aria-label="Sign out"
          >
            <LogOut className="size-4" />
          </Button>
        </header>

        <div className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
