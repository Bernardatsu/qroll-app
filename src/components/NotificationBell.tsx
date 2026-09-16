import React, { useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { requestAndRegisterPushToken, type PushPermissionStatus } from "@/lib/fcm-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface NotificationBellProps {
  userId: string;
  role?: string;
  authToken?: string;
  indexNumber?: string;
  settingsUrl?: string;
  className?: string;
}

export function NotificationBell({
  userId,
  role = "user",
  authToken,
  indexNumber,
  className = "",
}: NotificationBellProps) {
  const [permissionStatus, setPermissionStatus] = useState<PushPermissionStatus>("default");
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermissionStatus(Notification.permission as PushPermissionStatus);
    }
  }, []);

  const handleClick = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.error("Push notifications are not supported on this browser or device.");
      return;
    }

    if (Notification.permission === "granted") {
      toast.success("Push notifications are already active and enabled on this device.");
      return;
    }

    if (Notification.permission === "denied") {
      toast.error(
        "Notifications are blocked in your browser settings. Please allow notifications in your browser's site settings.",
      );
      setPermissionStatus("denied");
      return;
    }

    // Default permission: trigger the native device prompt
    setRequesting(true);
    try {
      const result = await requestAndRegisterPushToken({
        id: userId,
        role,
        authToken,
        indexNumber,
      });

      setPermissionStatus(result.permission);
      if (result.permission === "granted") {
        toast.success("Device push notifications enabled successfully!");
      } else if (result.permission === "denied") {
        toast.error("Notification permission was denied.");
      } else if (result.error) {
        toast.error(result.error);
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to enable notifications");
    } finally {
      setRequesting(false);
    }
  };

  const isGranted = permissionStatus === "granted";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={requesting}
      className={cn(
        "relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring cursor-pointer",
        className,
      )}
      title={
        isGranted ? "Device notifications enabled" : "Click to allow device push notifications"
      }
      aria-label={
        isGranted ? "Device notifications enabled" : "Click to allow device push notifications"
      }
    >
      {requesting ? (
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      ) : (
        <Bell className={cn("h-4 w-4", isGranted ? "text-primary font-bold" : "text-foreground")} />
      )}

      {/* Subtle indicator dot if notifications are active on this device */}
      {isGranted && (
        <span
          className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-card"
          title="Notifications Active"
        />
      )}
    </button>
  );
}
