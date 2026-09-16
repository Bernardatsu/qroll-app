import React, { useEffect, useState } from "react";
import {
  checkPushSupport,
  requestAndRegisterPushToken,
  unregisterPushToken,
  getUserNotificationPreferences,
  saveUserNotificationPreferences,
  triggerAdminTestNotification,
  getDevicePlatformAndBrowser,
  type PushPermissionStatus,
  type NotificationPreferences,
} from "@/lib/fcm-client";
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  Send,
  Loader2,
  ShieldCheck,
  Info,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

interface NotificationSettingsSectionProps {
  user: {
    id: string;
    role: string;
    email?: string;
    authToken?: string;
    indexNumber?: string;
  };
  isAdmin?: boolean;
}

export function NotificationSettingsSection({
  user,
  isAdmin = false,
}: NotificationSettingsSectionProps) {
  const [permissionStatus, setPermissionStatus] = useState<PushPermissionStatus>("default");
  const [supportReason, setSupportReason] = useState<string | null>(null);
  const [isIosPwa, setIsIosPwa] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [deviceInfo, setDeviceInfo] = useState({ platform: "web", browser: "browser" });

  const [preferences, setPreferences] = useState<NotificationPreferences>({
    userId: user.id,
    masterEnabled: true,
    attendance: true,
    announcements: true,
    assignments: true,
    deadlines: true,
    system: true,
  });

  const isTokenActive =
    typeof window !== "undefined" && Boolean(localStorage.getItem("qroll.fcm.token"));

  const loadStatusAndPreferences = async () => {
    setDeviceInfo(getDevicePlatformAndBrowser());

    const sup = await checkPushSupport();
    setPermissionStatus(sup.permission);
    if (sup.reason) setSupportReason(sup.reason);
    if (sup.isIos && !sup.isStandalone) {
      setIsIosPwa(true);
    }

    if (user.id) {
      const p = await getUserNotificationPreferences(user.id);
      setPreferences(p);
    }
  };

  useEffect(() => {
    loadStatusAndPreferences();
  }, [user.id]);

  const handleTogglePreference = async (key: keyof NotificationPreferences, value: boolean) => {
    const updated = { ...preferences, [key]: value };
    setPreferences(updated);
    setSaving(true);
    try {
      await saveUserNotificationPreferences(user.id, updated, user.authToken);
      toast.success("Notification preferences saved");
    } catch (_) {
      toast.error("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  const handleEnableDevicePush = async () => {
    setLoading(true);
    setSupportReason(null);
    const result = await requestAndRegisterPushToken(user);
    setLoading(false);
    setPermissionStatus(result.permission);
    if (result.error) {
      setSupportReason(result.error);
      toast.error(result.error);
    } else {
      setSupportReason("Device successfully registered for background push notifications!");
      toast.success("Device notifications enabled!");
    }
  };

  const handleDeactivateDevicePush = async () => {
    setLoading(true);
    await unregisterPushToken(user.id);
    setLoading(false);
    setSupportReason("Push notifications deactivated on this browser.");
    toast.info("Push notifications disabled on this device");
  };

  const handleSendAdminTest = async () => {
    if (!user.authToken) {
      setTestResult("Authentication token required for admin test push.");
      return;
    }
    setTestLoading(true);
    setTestResult(null);
    const res = await triggerAdminTestNotification(user.authToken);
    setTestLoading(false);
    setTestResult(res.message);
  };

  return (
    <div className="space-y-6 text-foreground">
      {/* Device Push Status Card */}
      <Card className="border border-border bg-card shadow-sm">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/25">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <CardTitle className="text-base sm:text-lg font-bold text-foreground">
                    Device Push Notifications
                  </CardTitle>
                  {isTokenActive && permissionStatus === "granted" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Active
                    </span>
                  ) : permissionStatus === "denied" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-bold text-destructive border border-destructive/30">
                      <AlertTriangle className="h-3.5 w-3.5" /> Blocked in Browser
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-secondary-foreground border border-border">
                      Not Configured
                    </span>
                  )}
                </div>
                <CardDescription className="text-xs sm:text-sm text-foreground/80 font-normal mt-1 max-w-xl">
                  Receive instant alerts for attendance roll calls, announcements, and deadlines on
                  your device screen even when QRoll is closed.
                </CardDescription>
              </div>
            </div>

            <div className="shrink-0">
              {isTokenActive ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeactivateDevicePush}
                  disabled={loading}
                  className="text-xs font-semibold text-destructive hover:bg-destructive/10 border-destructive/30"
                >
                  {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  Disable on This Device
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleEnableDevicePush}
                  disabled={loading || permissionStatus === "denied"}
                  className="text-xs font-bold"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Enabling...
                    </>
                  ) : (
                    "Enable Push Notifications"
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Device diagnostic status box with high-contrast text */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl bg-muted/40 p-3.5 border border-border">
            <div className="space-y-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
                Operating System
              </span>
              <p className="text-sm font-bold text-foreground capitalize">{deviceInfo.platform}</p>
            </div>
            <div className="space-y-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
                Browser
              </span>
              <p className="text-sm font-bold text-foreground capitalize">{deviceInfo.browser}</p>
            </div>
            <div className="space-y-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
                Permission State
              </span>
              <p className="text-sm font-bold text-foreground capitalize">
                {permissionStatus === "granted"
                  ? "Allowed (Granted)"
                  : permissionStatus === "denied"
                    ? "Blocked (Denied)"
                    : "Default (Prompt on click)"}
              </p>
            </div>
          </div>

          {isTokenActive && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-xs font-medium text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>
                Device is registered with Firebase Cloud Messaging. Background push notifications
                are operational.
              </span>
            </div>
          )}

          {supportReason && (
            <div className="flex items-start gap-2.5 rounded-lg bg-card p-3.5 text-xs text-foreground font-medium border border-border shadow-2xs">
              <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span className="leading-relaxed">{supportReason}</span>
            </div>
          )}

          {isIosPwa && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-foreground">
              <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300 mb-1.5 text-sm">
                <Smartphone className="h-4 w-4" />
                iOS Safari Setup Required
              </div>
              <p className="text-foreground/90 leading-relaxed">
                Apple requires adding QRoll to your Home Screen to deliver background push
                notifications: Tap <strong>Share</strong> → <strong>Add to Home Screen</strong>,
                then launch QRoll from your Home Screen.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category Preferences Card */}
      <Card className="border border-border bg-card shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base sm:text-lg font-bold text-foreground">
                Notification Categories
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm text-foreground/80 font-normal mt-0.5">
                Customize which alerts you want to receive on this device.
              </CardDescription>
            </div>
            {saving && (
              <span className="flex items-center gap-1.5 text-xs text-primary font-bold">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4 divide-y divide-border">
          {/* Master Toggle */}
          <div className="flex items-center justify-between pt-0 pb-3.5">
            <div className="space-y-0.5 pr-4">
              <p className="text-sm font-bold text-foreground">Master Notification Switch</p>
              <p className="text-xs text-foreground/75">
                Enable or temporarily pause all notifications across all categories
              </p>
            </div>
            <Switch
              checked={preferences.masterEnabled}
              onCheckedChange={(val) => handleTogglePreference("masterEnabled", val)}
              aria-label="Toggle master notifications"
            />
          </div>

          {/* Attendance */}
          <div className="flex items-center justify-between py-3.5">
            <div className="space-y-0.5 pr-4">
              <p className="text-sm font-bold text-foreground">Attendance Sessions</p>
              <p className="text-xs text-foreground/75">
                Instant alerts when a lecturer opens an attendance session for your course
              </p>
            </div>
            <Switch
              disabled={!preferences.masterEnabled}
              checked={preferences.attendance}
              onCheckedChange={(val) => handleTogglePreference("attendance", val)}
              aria-label="Toggle attendance notifications"
            />
          </div>

          {/* Announcements */}
          <div className="flex items-center justify-between py-3.5">
            <div className="space-y-0.5 pr-4">
              <p className="text-sm font-bold text-foreground">Announcements & Broadcasts</p>
              <p className="text-xs text-foreground/75">
                Departmental and course-wide announcements from lecturers
              </p>
            </div>
            <Switch
              disabled={!preferences.masterEnabled}
              checked={preferences.announcements}
              onCheckedChange={(val) => handleTogglePreference("announcements", val)}
              aria-label="Toggle announcement notifications"
            />
          </div>

          {/* Assignments */}
          <div className="flex items-center justify-between py-3.5">
            <div className="space-y-0.5 pr-4">
              <p className="text-sm font-bold text-foreground">Coursework & Assignments</p>
              <p className="text-xs text-foreground/75">
                Notifications when new assignments or lab tasks are published
              </p>
            </div>
            <Switch
              disabled={!preferences.masterEnabled}
              checked={preferences.assignments}
              onCheckedChange={(val) => handleTogglePreference("assignments", val)}
              aria-label="Toggle coursework notifications"
            />
          </div>

          {/* Deadlines */}
          <div className="flex items-center justify-between py-3.5">
            <div className="space-y-0.5 pr-4">
              <p className="text-sm font-bold text-foreground">Deadlines & Due Dates</p>
              <p className="text-xs text-foreground/75">
                Reminder alerts before coursework submissions close
              </p>
            </div>
            <Switch
              disabled={!preferences.masterEnabled}
              checked={preferences.deadlines}
              onCheckedChange={(val) => handleTogglePreference("deadlines", val)}
              aria-label="Toggle deadline notifications"
            />
          </div>

          {/* System */}
          <div className="flex items-center justify-between pt-3.5">
            <div className="space-y-0.5 pr-4">
              <p className="text-sm font-bold text-foreground">System & Security Updates</p>
              <p className="text-xs text-foreground/75">
                Platform maintenance and critical account security notices
              </p>
            </div>
            <Switch
              disabled={!preferences.masterEnabled}
              checked={preferences.system}
              onCheckedChange={(val) => handleTogglePreference("system", val)}
              aria-label="Toggle system notifications"
            />
          </div>
        </CardContent>
      </Card>

      {/* Admin Test Notification Tool */}
      {isAdmin && (
        <Card className="border border-primary/30 bg-card shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <CardTitle className="text-base sm:text-lg font-bold text-foreground">
                Admin Push Diagnostic Tool
              </CardTitle>
            </div>
            <CardDescription className="text-xs sm:text-sm text-foreground/80 mt-1">
              Test real-time FCM HTTP v1 push delivery. This sends an immediate test notification
              specifically to your active device tokens. If your browser or tab is closed, the
              notification will appear in your device's notification center.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Button
                onClick={handleSendAdminTest}
                disabled={testLoading || !isTokenActive}
                className="font-bold text-xs py-2 px-4"
              >
                {testLoading ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Sending Test Push...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-3.5 w-3.5" />
                    Send Test Notification (Admin Only)
                  </>
                )}
              </Button>

              {!isTokenActive && (
                <span className="text-xs text-amber-700 dark:text-amber-400 font-semibold">
                  ⚠️ Enable push notifications on this device above first to test.
                </span>
              )}
            </div>

            {testResult && (
              <div className="mt-3 rounded-lg bg-background p-3.5 text-xs text-foreground border border-border font-mono leading-relaxed">
                {testResult}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
