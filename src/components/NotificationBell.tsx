import React, { useEffect, useState } from "react";
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  setupForegroundNotificationListener,
  requestAndRegisterPushToken,
  type InAppNotification,
} from "@/lib/fcm-client";
import {
  Bell,
  Check,
  Megaphone,
  UserCheck,
  BookOpen,
  Clock,
  Shield,
  ExternalLink,
  AlertTriangle,
  Calendar,
  X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

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
  settingsUrl = "/settings",
  className = "",
}: NotificationBellProps) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<InAppNotification | null>(null);

  const loadNotifications = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const list = await getUserNotifications(userId);
      setNotifications(Array.isArray(list) ? list : []);
    } catch (e) {
      console.warn("[NotificationBell] load error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      loadNotifications();
    }

    // Foreground push listener to refresh inbox in real-time
    const cleanup = setupForegroundNotificationListener(() => {
      loadNotifications();
    });

    return () => cleanup();
  }, [userId]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkAllRead = async () => {
    if (!userId) return;
    try {
      await markAllNotificationsAsRead(userId);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      toast.success("All notifications marked as read");
    } catch {
      toast.error("Failed to mark notifications as read");
    }
  };

  const handleClickItem = (notif: InAppNotification) => {
    // 1. Mark as read in state & backend
    if (!notif.isRead) {
      markNotificationAsRead(notif.id).catch(() => {});
      setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n)));
    }
    // 2. Safely close popdown menu
    setIsOpen(false);

    // 3. Open notification message dialog so user can read the complete message
    setSelectedNotif(notif);
  };

  const handleNavigateToRelated = (url?: string) => {
    if (!url) return;
    setSelectedNotif(null);
    try {
      if (url.startsWith("/")) {
        navigate({ to: url as any }).catch(() => {
          // Fallback if client-side route doesn't match
          window.location.href = url;
        });
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      console.warn("Navigation failed:", e);
    }
  };

  // Clicking the notification icon triggers the device browser permission prompt
  // if not yet requested, then opens the notifications popover
  const handleBellClick = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        try {
          const res = await requestAndRegisterPushToken({
            id: userId,
            role,
            authToken,
            indexNumber,
          });
          if (res.permission === "granted") {
            toast.success("Device notifications enabled!");
          }
        } catch (_) {
          // Continue opening popover if prompt declined or error
        }
      }
    }
    setIsOpen((prev) => !prev);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "ATTENDANCE":
        return <UserCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
      case "ANNOUNCEMENT":
        return <Megaphone className="h-4 w-4 text-sky-600 dark:text-sky-400" />;
      case "ASSIGNMENT":
        return <BookOpen className="h-4 w-4 text-blue-500 dark:text-blue-300" />;
      case "DEADLINE":
        return <Clock className="h-4 w-4 text-blue-700 dark:text-blue-300" />;
      default:
        return <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "ATTENDANCE":
        return "Attendance Update";
      case "ANNOUNCEMENT":
        return "Lecturer Announcement";
      case "ASSIGNMENT":
        return "Coursework & Assignment";
      case "DEADLINE":
        return "Urgent Deadline";
      default:
        return "System Notification";
    }
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch (_) {
      return "";
    }
  };

  const formatFullDate = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      return date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch (_) {
      return "";
    }
  };

  const isPermissionDenied =
    typeof window !== "undefined" &&
    "Notification" in window &&
    Notification.permission === "denied";

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            onClick={handleBellClick}
            className={`relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring ${className}`}
            title="Notifications"
            aria-label="View notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground shadow-xs ring-2 ring-background">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-80 sm:w-96 rounded-xl border border-border bg-popover p-0 text-popover-foreground shadow-xl overflow-hidden"
        >
          {/* Popover Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/40">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium cursor-pointer"
              >
                <Check className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* If notifications are blocked at the device browser level */}
          {isPermissionDenied && (
            <div className="flex items-start gap-2 bg-destructive/10 border-b border-destructive/20 px-3.5 py-2.5 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed">
                Push notifications are blocked in your browser settings. To receive lock screen
                alerts, enable notifications in your browser's site permissions.
              </p>
            </div>
          )}

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border">
            {loading && notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Loading notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center px-4">
                <Bell className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-xs font-semibold text-foreground">No notifications yet</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Attendance updates, announcements, and coursework alerts will appear here.
                </p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleClickItem(n)}
                  className={`flex cursor-pointer items-start gap-3 p-3.5 transition-colors hover:bg-muted/60 ${
                    !n.isRead ? "bg-primary/5 font-medium" : ""
                  }`}
                >
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground border border-border">
                    {getIcon(n.type)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p
                        className={`text-xs truncate ${
                          !n.isRead
                            ? "text-foreground font-semibold"
                            : "text-foreground/85 font-medium"
                        }`}
                      >
                        {n.title}
                      </p>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatTime(n.createdAt)}
                      </span>
                    </div>

                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                      {n.body}
                    </p>
                  </div>

                  {!n.isRead && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Popover Footer */}
          <div className="border-t border-border p-2.5 text-center bg-muted/20">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                if (settingsUrl.startsWith("/")) {
                  void navigate({ to: settingsUrl as any });
                } else if (settingsUrl.startsWith("#")) {
                  const elem = document.querySelector(settingsUrl);
                  if (elem) {
                    elem.scrollIntoView({ behavior: "smooth" });
                  }
                } else {
                  window.location.href = settingsUrl;
                }
              }}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors cursor-pointer"
            >
              Manage Notification Preferences
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Full Notification Message Dialog */}
      <Dialog open={!!selectedNotif} onOpenChange={(open) => !open && setSelectedNotif(null)}>
        <DialogContent className="sm:max-w-md w-[calc(100vw-2rem)] p-5 rounded-2xl">
          {selectedNotif && (
            <>
              <DialogHeader className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge
                    variant="outline"
                    className="flex items-center gap-1.5 text-xs font-semibold py-1"
                  >
                    {getIcon(selectedNotif.type)}
                    <span>{getTypeLabel(selectedNotif.type)}</span>
                  </Badge>
                  {selectedNotif.createdAt && (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="size-3" />
                      {formatFullDate(selectedNotif.createdAt)}
                    </span>
                  )}
                </div>
                <DialogTitle className="text-base sm:text-lg font-bold text-foreground text-left leading-snug pt-1">
                  {selectedNotif.title}
                </DialogTitle>
                <DialogDescription className="text-xs text-left sr-only">
                  Detailed notification contents
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-xl border bg-muted/30 p-4 text-xs sm:text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                {selectedNotif.body}
              </div>

              <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedNotif(null)}
                  className="w-full sm:w-auto"
                >
                  Close
                </Button>
                {selectedNotif.url && (
                  <Button
                    onClick={() => handleNavigateToRelated(selectedNotif.url)}
                    className="w-full sm:w-auto flex items-center gap-1.5"
                  >
                    <span>Open Related Link</span>
                    <ExternalLink className="size-3.5" />
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
