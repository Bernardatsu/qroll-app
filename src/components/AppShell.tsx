import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { LogOut, LayoutDashboard, ArrowLeft, Shield, User } from "lucide-react";
import { firebaseAuth } from "@/integrations/firebase/config";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import qrollLogo from "@/assets/qroll-logo.png";
import {
  registerOrVerifyDevice,
  getDeviceId,
  listenToDeviceStatus,
  type UserDevice,
} from "@/lib/device-manager";
import { DeviceLimitDialog } from "@/components/DeviceLimitDialog";
import { NotificationBell } from "@/components/NotificationBell";
import { FloatingBottomBar } from "@/components/FloatingBottomBar";
import { toast } from "sonner";
import { clearUserAppCache } from "@/lib/query-client";

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isDashboard = pathname === "/dashboard";
  const { user, isAdmin, roles } = useAuth();
  const [deviceLimitOpen, setDeviceLimitOpen] = useState(false);
  const [activeDevices, setActiveDevices] = useState<UserDevice[]>([]);
  const [idToken, setIdToken] = useState<string | undefined>(undefined);
  const role = roles[0] ?? "Lecturer";

  useEffect(() => {
    if (user?.id) {
      firebaseAuth.currentUser
        ?.getIdToken()
        .then(setIdToken)
        .catch(() => {});
    }
  }, [user?.id]);

  const signOut = async () => {
    clearUserAppCache();
    await firebaseAuth.signOut();
    router.navigate({ to: "/auth" });
  };

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      router.navigate({ to: "/dashboard" });
    }
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
    <div className="min-h-screen flex w-full flex-col bg-background">
      {user?.id && (
        <DeviceLimitDialog
          open={deviceLimitOpen}
          userId={user.id}
          devices={activeDevices}
          onResolved={() => setDeviceLimitOpen(false)}
        />
      )}

      <main className="flex-1 min-w-0 flex flex-col relative">
        {/* Header navigation */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 px-3.5 sm:px-6 py-2.5 border-b bg-background/95 backdrop-blur shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* On non-dashboard pages, show Back button */}
            {!isDashboard && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                aria-label="Go back"
                className="h-8 px-2 sm:px-3 text-xs font-semibold gap-1.5 hover:bg-muted text-foreground shrink-0"
              >
                <ArrowLeft className="size-4" />
                <span className="hidden sm:inline">Back</span>
              </Button>
            )}

            <Link to={"/dashboard" as string} className="flex items-center gap-2.5 min-w-0 group">
              <div className="size-9 sm:size-10 rounded-xl bg-white p-1 shadow-sm ring-1 ring-border/50 flex items-center justify-center shrink-0 transition-transform group-hover:scale-105">
                <img src={qrollLogo} alt="QRoll logo" className="size-full object-contain" />
              </div>
              <div className="min-w-0">
                <div className="text-base sm:text-lg font-bold tracking-tight leading-none text-foreground flex items-center gap-1.5">
                  QRoll
                  {isAdmin && (
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 font-bold">
                      Admin
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground hidden sm:block tracking-wide uppercase font-semibold">
                  Attendance System
                </div>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* On non-dashboard pages, show Home button in header */}
            {!isDashboard && (
              <Link to={"/dashboard" as string} aria-label="Home Dashboard">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs font-semibold gap-1.5 h-8 border-blue-600/30 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                >
                  <LayoutDashboard className="size-3.5" />
                  <span>Home</span>
                </Button>
              </Link>
            )}

            {user?.id && (
              <NotificationBell
                userId={user.id}
                role={role}
                authToken={idToken}
                settingsUrl="/settings"
              />
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={signOut}
              aria-label="Sign out"
              className="text-xs h-8 px-2.5 sm:px-3 font-medium hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <LogOut className="size-3.5 mr-1" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </header>

        {/* Content area with bottom clearance for floating navbar */}
        <div className="flex-1 w-full max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 min-w-0 pb-28 sm:pb-32">
          {children}
        </div>

        {/* Floating bottom glass navigation bar */}
        <FloatingBottomBar />
      </main>
    </div>
  );
}
