import { Link, useRouterState } from "@tanstack/react-router";
import { motion } from "motion/react";
import { LayoutDashboard, ScanLine, CalendarClock, FileBarChart, Megaphone } from "lucide-react";

interface NavButtonProps {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  isCenter?: boolean;
}

export function FloatingBottomBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const navItems: NavButtonProps[] = [
    { to: "/sessions", label: "Sessions", icon: CalendarClock },
    { to: "/scan", label: "Scanner", icon: ScanLine },
    { to: "/dashboard", label: "Home", icon: LayoutDashboard, isCenter: true },
    { to: "/reports", label: "Reports", icon: FileBarChart },
    { to: "/announcements", label: "Announcements", icon: Megaphone },
  ];

  return (
    <div
      id="floating-tutor-navbar-wrapper"
      className="fixed bottom-3 sm:bottom-4 inset-x-0 z-40 flex justify-center pointer-events-none px-3 select-none"
    >
      <motion.nav
        id="floating-tutor-navbar"
        initial={{ y: 30, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        className="pointer-events-auto flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full bg-white/80 dark:bg-slate-950/80 backdrop-blur-2xl border border-slate-200/80 dark:border-blue-500/25 shadow-[0_10px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.6)] ring-1 ring-black/5 dark:ring-white/10"
      >
        {navItems.map((item) => {
          const isActive = pathname === item.to;
          const Icon = item.icon;

          if (item.isCenter) {
            return (
              <Link
                key={item.to}
                to={item.to as string}
                id="floating-nav-home"
                aria-label="Dashboard Home"
                className="relative group focus:outline-none px-0.5"
              >
                <motion.div
                  whileHover={{ scale: 1.08, y: -2 }}
                  whileTap={{ scale: 0.94 }}
                  className={`relative flex items-center justify-center size-11 sm:size-12 rounded-full shadow-md transition-all duration-200 ${
                    isActive
                      ? "bg-blue-600 text-white ring-3 ring-blue-400/40 shadow-blue-700/40"
                      : "bg-slate-900 dark:bg-blue-600 text-white hover:bg-blue-600 hover:ring-2 hover:ring-blue-400/30"
                  }`}
                >
                  <Icon className="size-5 sm:size-5.5" />
                  <span className="sr-only">Home (Dashboard)</span>
                </motion.div>
                <span className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none text-[10px] font-bold uppercase tracking-wider bg-slate-900/90 text-white px-2 py-0.5 rounded-md whitespace-nowrap shadow-md">
                  Dashboard
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.to}
              to={item.to as string}
              id={`floating-nav-${item.label.toLowerCase()}`}
              aria-label={item.label}
              className="relative group focus:outline-none"
            >
              <motion.div
                whileHover={{ scale: 1.04, y: -1 }}
                whileTap={{ scale: 0.95 }}
                className={`relative flex flex-col items-center justify-center px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full min-w-[54px] sm:min-w-[66px] transition-all duration-200 ${
                  isActive
                    ? "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold shadow-xs"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10"
                }`}
              >
                <Icon
                  className={`size-4 sm:size-4.5 transition-colors ${
                    isActive
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white"
                  }`}
                />
                <span className="text-[10px] sm:text-[11px] font-medium tracking-tight mt-0.5 leading-none whitespace-nowrap">
                  {item.label}
                </span>

                {isActive && (
                  <motion.div
                    layoutId="floating-nav-active-dot"
                    className="absolute -bottom-0.5 size-1 rounded-full bg-blue-600 dark:bg-blue-400"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </motion.div>
            </Link>
          );
        })}
      </motion.nav>
    </div>
  );
}
