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
    <div id="notification-preferences" className="space-y-6 scroll-mt-6">
      {/* Device Push Status Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base font-bold text-foreground">
                    Device Push Notifications
                  </CardTitle>
                  {isTokenActive && permissionStatus === "granted" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400 border border-blue-500/20">
                      <CheckCircle2 className="h-3 w-3" /> Active
                    </span>
                  ) : permissionStatus === "denied" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive border border-destructive/20">
                      <AlertTriangle className="h-3 w-3" /> Blocked
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground border border-border">
                      Inactive
                    </span>
                  )}
                </div>
                <CardDescription className="text-xs text-muted-foreground mt-1">
                  Receive instant lock screen alerts for active attendance sessions, course
                  broadcasts, and deadlines even when your browser is closed.
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
                  className="text-xs font-medium"
                >
                  {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  Disable on This Device
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleEnableDevicePush}
                  disabled={loading || permissionStatus === "denied"}
                  className="text-xs font-semibold"
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

        <CardContent className="space-y-3">
          {/* Diagnostics banner */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg bg-muted/50 px-3.5 py-2.5 text-xs text-muted-foreground border border-border">
            <div>
              <span className="text-muted-foreground/70">Platform:</span>{" "}
              <span className="font-semibold text-foreground capitalize">
                {deviceInfo.platform}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground/70">Browser:</span>{" "}
              <span className="font-semibold text-foreground capitalize">{deviceInfo.browser}</span>
            </div>
            <div>
              <span className="text-muted-foreground/70">Permission:</span>{" "}
              <span className="font-semibold text-foreground">{permissionStatus}</span>
            </div>
            {isTokenActive && (
              <div className="text-blue-600 dark:text-blue-400 font-medium">
                ✓ FCM Token registered on server
              </div>
            )}
          </div>

          {supportReason && (
            <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs text-foreground border border-border">
              <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span>{supportReason}</span>
            </div>
          )}

          {isIosPwa && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-foreground">
              <div className="flex items-center gap-2 font-semibold text-blue-600 dark:text-blue-400 mb-1">
                <Smartphone className="h-4 w-4" />
                iPhone / iPad Setup Required
              </div>
              Apple Safari requires adding QRoll to your Home Screen before it can deliver lock
              screen push notifications: Tap <strong>Share</strong> →{" "}
              <strong>Add to Home Screen</strong>, then open QRoll from your Home Screen.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category Preferences Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-foreground">
                Notification Categories
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Choose which categories of alerts you want to receive.
              </CardDescription>
            </div>
            {saving && (
              <span className="flex items-center gap-1.5 text-xs text-primary font-medium">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4 divide-y divide-border">
          {/* Master Toggle */}
          <div className="flex items-center justify-between pt-0 pb-3">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-foreground">Master Notification Switch</p>
              <p className="text-[11px] text-muted-foreground">
                Temporarily pause all notifications across all categories
              </p>
            </div>
            <Switch
              checked={preferences.masterEnabled}
              onCheckedChange={(val) => handleTogglePreference("masterEnabled", val)}
            />
          </div>

          {/* Attendance */}
          <div className="flex items-center justify-between py-3">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-foreground">Attendance Sessions</p>
              <p className="text-[11px] text-muted-foreground">
                Instant alerts when a lecturer opens an attendance session for your course
              </p>
            </div>
            <Switch
              disabled={!preferences.masterEnabled}
              checked={preferences.attendance}
              onCheckedChange={(val) => handleTogglePreference("attendance", val)}
            />
          </div>

          {/* Announcements */}
          <div className="flex items-center justify-between py-3">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-foreground">Announcements & Broadcasts</p>
              <p className="text-[11px] text-muted-foreground">
                Departmental and course-wide announcements from lecturers
              </p>
            </div>
            <Switch
              disabled={!preferences.masterEnabled}
              checked={preferences.announcements}
              onCheckedChange={(val) => handleTogglePreference("announcements", val)}
            />
          </div>

          {/* Assignments */}
          <div className="flex items-center justify-between py-3">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-foreground">Coursework & Assignments</p>
              <p className="text-[11px] text-muted-foreground">
                Notifications when new assignments or lab tasks are published
              </p>
            </div>
            <Switch
              disabled={!preferences.masterEnabled}
              checked={preferences.assignments}
              onCheckedChange={(val) => handleTogglePreference("assignments", val)}
            />
          </div>

          {/* Deadlines */}
          <div className="flex items-center justify-between py-3">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-foreground">Deadlines & Due Dates</p>
              <p className="text-[11px] text-muted-foreground">
                Reminder alerts before coursework submissions close
              </p>
            </div>
            <Switch
              disabled={!preferences.masterEnabled}
              checked={preferences.deadlines}
              onCheckedChange={(val) => handleTogglePreference("deadlines", val)}
            />
          </div>

          {/* System */}
          <div className="flex items-center justify-between pt-3">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-foreground">System & Security Updates</p>
              <p className="text-[11px] text-muted-foreground">
                Platform maintenance and security notifications
              </p>
            </div>
            <Switch
              disabled={!preferences.masterEnabled}
              checked={preferences.system}
              onCheckedChange={(val) => handleTogglePreference("system", val)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Admin Test Notification Tool */}
      {isAdmin && (
        <Card className="border-primary/30">
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-bold text-foreground">
                Admin Push Diagnostic Tool
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-1">
              Test real-time FCM HTTP v1 push delivery. This sends an immediate test notification
              specifically to your active device tokens. If your browser or tab is closed, the
              notification will appear in your operating system's notification center.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Button
                onClick={handleSendAdminTest}
                disabled={testLoading || !isTokenActive}
                className="font-semibold text-xs py-2 px-4"
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
                <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                  Notice: Enable push on this device above first to register a token for testing.
                </span>
              )}
            </div>

            {testResult && (
              <div className="mt-3 rounded-lg bg-muted/60 p-3 text-xs text-foreground border border-border font-mono">
                {testResult}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
