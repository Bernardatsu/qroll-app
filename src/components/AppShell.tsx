import { Link, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LogOut, LayoutDashboard, Users, BookOpen, CalendarClock, ScanLine, FileBarChart, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/students", label: "Students", icon: Users, adminOnly: true },
  { to: "/courses", label: "Courses", icon: BookOpen, adminOnly: true },
  { to: "/departments", label: "Departments", icon: Building2, adminOnly: true },
  { to: "/sessions", label: "Sessions", icon: CalendarClock },
  { to: "/scan", label: "Scanner", icon: ScanLine },
  { to: "/reports", label: "Reports", icon: FileBarChart },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, isAdmin, roles } = useAuth();
  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  };
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="md:w-64 md:min-h-screen md:border-r border-border bg-knust-gradient text-primary-foreground md:flex md:flex-col">
        <div className="px-5 py-5 flex items-center gap-3 border-b border-white/10">
          <div className="size-10 rounded-lg bg-gold grid place-items-center font-bold text-gold-foreground">K</div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">KNUST</div>
            <div className="text-xs opacity-80">Attendance System</div>
          </div>
        </div>
        <nav className="flex md:flex-col gap-1 p-2 overflow-x-auto md:overflow-visible">
          {nav.filter((n) => !n.adminOnly || isAdmin).map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white whitespace-nowrap"
              activeProps={{ className: "bg-white/15 text-white" }}
            >
              <n.icon className="size-4" /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto p-3 border-t border-white/10 hidden md:block">
          <div className="text-xs opacity-80 truncate">{user?.email}</div>
          <div className="text-[10px] uppercase tracking-wider text-gold/90 mt-0.5">{roles[0] ?? "no role"}</div>
          <Button variant="secondary" size="sm" className="mt-2 w-full" onClick={signOut}>
            <LogOut className="size-4 mr-1" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 bg-background">
        <div className="md:hidden flex items-center justify-between px-4 py-2 border-b">
          <div className="text-xs text-muted-foreground">{user?.email}</div>
          <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="size-4" /></Button>
        </div>
        <div className="p-4 md:p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
