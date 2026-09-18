import { app } from "@/integrations/firebase/config";
import {
  getMessaging,
  getToken,
  deleteToken,
  onMessage,
  isSupported,
  type Messaging,
} from "firebase/messaging";

export type PushPermissionStatus =
  "default" | "granted" | "denied" | "unsupported" | "ios_pwa_required";

export interface NotificationPreferences {
  userId: string;
  masterEnabled: boolean;
  attendance: boolean;
  announcements: boolean;
  assignments: boolean;
  deadlines: boolean;
  system: boolean;
  updatedAt?: string;
}

export interface InAppNotification {
  id: string;
  userId: string;
  type: "ATTENDANCE" | "ANNOUNCEMENT" | "ASSIGNMENT" | "DEADLINE" | "SYSTEM" | "GENERAL";
  title: string;
  body: string;
  url: string;
  entityId?: string;
  entityType?: string;
  isRead: boolean;
  createdAt: string;
}

let messagingInstance: Messaging | null = null;

export function getDevicePlatformAndBrowser(): {
  platform: string;
  browser: string;
  userAgent: string;
} {
  if (typeof window === "undefined" || !navigator) {
    return { platform: "server", browser: "server", userAgent: "" };
  }

  const ua = navigator.userAgent;
  let platform = "desktop";
  if (/Android/i.test(ua)) platform = "android";
  else if (/iPhone|iPad|iPod/i.test(ua)) platform = "ios";
  else if (/Macintosh/i.test(ua)) platform = "macos";
  else if (/Windows/i.test(ua)) platform = "windows";
  else if (/Linux/i.test(ua)) platform = "linux";

  let browser = "other";
  if (/Chrome|Chromium|CriOS/i.test(ua) && !/Edg/i.test(ua)) browser = "chrome";
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "safari";
  else if (/Firefox|FxiOS/i.test(ua)) browser = "firefox";
  else if (/Edg/i.test(ua)) browser = "edge";

  return { platform, browser, userAgent: ua };
}

export function isIOSDevice(): boolean {
  if (typeof window === "undefined" || !navigator) return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isStandalonePWA(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

/**
 * Check if the current browser and OS environment supports Web Push and FCM.
 */
export async function checkPushSupport(): Promise<{
  supported: boolean;
  permission: PushPermissionStatus;
  reason?: string;
  isIos: boolean;
  isStandalone: boolean;
}> {
  if (typeof window === "undefined") {
    return {
      supported: false,
      permission: "unsupported",
      reason: "Server-side environment",
      isIos: false,
      isStandalone: false,
    };
  }

  const isIos = isIOSDevice();
  const isStandalone = isStandalonePWA();

  // On iOS, Web Push is only supported if the app has been added to Home Screen and opened in standalone mode
  if (isIos && !isStandalone) {
    return {
      supported: false,
      permission: "ios_pwa_required",
      reason: "On iOS, push notifications require adding QRoll to your Home Screen first.",
      isIos,
      isStandalone,
    };
  }

  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return {
      supported: false,
      permission: "unsupported",
      reason: "This browser does not support Web Push notifications.",
      isIos,
      isStandalone,
    };
  }

  try {
    const supported = await isSupported();
    if (!supported) {
      return {
        supported: false,
        permission: "unsupported",
        reason: "Firebase Messaging is not supported in this browser context.",
        isIos,
        isStandalone,
      };
    }
  } catch (err: any) {
    return {
      supported: false,
      permission: "unsupported",
      reason: err?.message || "Firebase Messaging capability check failed.",
      isIos,
      isStandalone,
    };
  }

  const currentPermission = Notification.permission as PushPermissionStatus;
  return {
    supported: true,
    permission: currentPermission,
    isIos,
    isStandalone,
  };
}

/**
 * Register or get the active Service Worker with scope '/'.
 */
export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Worker is not supported in this browser.");
  }

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
    scope: "/",
  });

  await navigator.serviceWorker.ready;
  return registration;
}

/**
 * Request notification permission, obtain FCM token using VAPID key,
 * and securely register token with QRoll backend.
 */
export async function requestAndRegisterPushToken(user: {
  id: string;
  role: string;
  email?: string;
  authToken?: string; // Firebase ID token or student token
  indexNumber?: string;
}): Promise<{
  success: boolean;
  token?: string;
  permission: PushPermissionStatus;
  error?: string;
}> {
  const support = await checkPushSupport();
  if (!support.supported) {
    return {
      success: false,
      permission: support.permission,
      error: support.reason || "Web Push is not supported on this device.",
    };
  }

  // 1. Request OS/Browser Permission
  const permission = (await Notification.requestPermission()) as PushPermissionStatus;
  if (permission !== "granted") {
    return {
      success: false,
      permission,
      error:
        permission === "denied"
          ? "Notifications are blocked. Please enable them in your browser or device settings."
          : "Notification permission was not granted.",
    };
  }

  try {
    // 2. Initialize Messaging and Register Service Worker
    if (!messagingInstance) {
      messagingInstance = getMessaging(app);
    }

    const swReg = await registerPushServiceWorker();

    // 3. Obtain FCM Token
    const configuredVapidKey = (import.meta.env.VITE_FIREBASE_VAPID_KEY as string)?.trim();

    let token = "";
    try {
      if (configuredVapidKey) {
        token = await getToken(messagingInstance, {
          vapidKey: configuredVapidKey,
          serviceWorkerRegistration: swReg,
        });
      } else {
        token = await getToken(messagingInstance, {
          serviceWorkerRegistration: swReg,
        });
      }
    } catch (err: any) {
      console.warn(
        "[FCM Client] Primary getToken attempt failed, trying default registration:",
        err,
      );
      try {
        token = await getToken(messagingInstance, {
          serviceWorkerRegistration: swReg,
        });
      } catch (fallbackErr: any) {
        console.error("[FCM Client] Both getToken attempts failed:", fallbackErr);
        return {
          success: false,
          permission: "granted",
          error:
            "Could not obtain FCM Web Push token. Please ensure push notifications are allowed: " +
            (fallbackErr?.message || err?.message || ""),
        };
      }
    }

    if (!token) {
      return {
        success: false,
        permission: "granted",
        error: "Received an empty token from Firebase Cloud Messaging.",
      };
    }

    // 4. Register Token with Authenticated QRoll Backend
    const { platform, browser, userAgent } = getDevicePlatformAndBrowser();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (user.authToken) {
      headers["Authorization"] = `Bearer ${user.authToken}`;
    }
    if (user.indexNumber) {
      headers["x-student-id"] = user.id;
      headers["x-student-index"] = user.indexNumber;
    }

    const res = await fetch("/api/public/notifications?action=register", {
      method: "POST",
      headers,
      body: JSON.stringify({
        userId: user.id,
        userRole: user.role,
        studentId: user.id,
        studentIndex: user.indexNumber,
        fcmToken: token,
        platform,
        browser,
        userAgent,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Backend failed to register device token.");
    }

    // Save token to localStorage for tracking
    try {
      localStorage.setItem("qroll.fcm.token", token);
      localStorage.setItem("qroll.fcm.registered_at", new Date().toISOString());
    } catch (_) {
      // LocalStorage might not be accessible
    }

    return {
      success: true,
      token,
      permission: "granted",
    };
  } catch (err: any) {
    console.error("[FCM Client] Registration flow failure:", err);
    return {
      success: false,
      permission: Notification.permission as PushPermissionStatus,
      error: err?.message || "Failed to register notifications with server.",
    };
  }
}

/**
 * Unregister device token on logout or user toggle off.
 */
export async function unregisterPushToken(userId: string): Promise<boolean> {
  try {
    const savedToken = localStorage.getItem("qroll.fcm.token");
    if (savedToken) {
      if (!messagingInstance && (await isSupported())) {
        messagingInstance = getMessaging(app);
      }
      if (messagingInstance) {
        await deleteToken(messagingInstance).catch(() => {});
      }

      await fetch("/api/public/notifications?action=deactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fcmToken: savedToken, userId }),
      }).catch(() => {});

      localStorage.removeItem("qroll.fcm.token");
      localStorage.removeItem("qroll.fcm.registered_at");
    }
    return true;
  } catch (e) {
    console.warn("[FCM Client] unregister error:", e);
    return false;
  }
}

/**
 * Listen for foreground notifications when QRoll tab is actively open.
 */
export function setupForegroundNotificationListener(callback: (payload: any) => void): () => void {
  if (typeof window === "undefined") return () => {};

  let unsubFCM: (() => void) | null = null;
  isSupported().then((supported) => {
    if (supported) {
      try {
        if (!messagingInstance) {
          messagingInstance = getMessaging(app);
        }
        unsubFCM = onMessage(messagingInstance, (payload) => {
          callback(payload);
        });
      } catch (err) {
        console.warn("[FCM] Foreground listener init error:", err);
      }
    }
  });

  // Also listen for service worker click events posted to the window
  const handleSwMessage = (event: MessageEvent) => {
    if (event.data && event.data.type === "QROLL_NOTIFICATION_CLICK") {
      callback({ isClick: true, ...event.data });
    }
  };

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", handleSwMessage);
  }

  return () => {
    if (unsubFCM) unsubFCM();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.removeEventListener("message", handleSwMessage);
    }
  };
}

/**
 * Fetch user notification preferences.
 */
export async function getUserNotificationPreferences(
  userId: string,
): Promise<NotificationPreferences> {
  try {
    const res = await fetch(
      `/api/public/notifications?action=preferences&userId=${encodeURIComponent(userId)}`,
    );
    const data = await res.json();
    if (res.ok && data.preferences) {
      return data.preferences;
    }
  } catch (err) {
    console.warn("[FCM] Failed to load preferences:", err);
  }

  return {
    userId,
    masterEnabled: true,
    attendance: true,
    announcements: true,
    assignments: true,
    deadlines: true,
    system: true,
  };
}

/**
 * Save user notification preferences.
 */
export async function saveUserNotificationPreferences(
  userId: string,
  prefs: Partial<NotificationPreferences>,
  authToken?: string,
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    const res = await fetch("/api/public/notifications?action=preferences", {
      method: "POST",
      headers,
      body: JSON.stringify({ userId, ...prefs }),
    });
    const data = await res.json();
    return res.ok && data.ok;
  } catch (err) {
    console.error("[FCM] Failed to save preferences:", err);
    return false;
  }
}

/**
 * Fetch in-app inbox notifications.
 */
export async function getUserNotifications(userId: string): Promise<InAppNotification[]> {
  try {
    const res = await fetch(
      `/api/public/notifications?action=inbox&userId=${encodeURIComponent(userId)}`,
    );
    const data = await res.json();
    if (res.ok && Array.isArray(data.notifications)) {
      return data.notifications;
    }
  } catch (err) {
    console.warn("[FCM] Failed to load inbox:", err);
  }
  return [];
}

/**
 * Mark a single in-app notification as read.
 */
export async function markNotificationAsRead(id: string): Promise<boolean> {
  try {
    const res = await fetch("/api/public/notifications?action=mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    return res.ok && data.ok;
  } catch (_) {
    return false;
  }
}

/**
 * Mark all in-app notifications as read for a user.
 */
export async function markAllNotificationsAsRead(userId: string): Promise<boolean> {
  try {
    const res = await fetch("/api/public/notifications?action=mark-all-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    return res.ok && data.ok;
  } catch (_) {
    return false;
  }
}

/**
 * Send an admin test notification to the logged-in admin's device.
 */
export async function triggerAdminTestNotification(
  authToken: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch("/api/public/notifications?action=test-admin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      return { ok: true, message: data.message || "Test push sent successfully!" };
    }
    return { ok: false, message: data.error || "Failed to trigger test push." };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Network error while triggering test push." };
  }
}
