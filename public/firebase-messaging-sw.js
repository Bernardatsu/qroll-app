/**
 * QRoll Firebase Cloud Messaging Service Worker
 * Scope: / (Serves all routes across QRoll)
 */

importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

// Initialize Firebase compat inside the service worker
const firebaseConfig = {
  apiKey: "AIzaSyDhpGHOQXczqG1xt8HSsyU7BpyVYMH6G4o",
  authDomain: "gen-lang-client-0882252089.firebaseapp.com",
  projectId: "gen-lang-client-0882252089",
  storageBucket: "gen-lang-client-0882252089.firebasestorage.app",
  messagingSenderId: "977505071788",
  appId: "1:977505071788:web:5840e4d7f2de84e4416509",
};

try {
  firebase.initializeApp(firebaseConfig);
} catch (e) {
  console.warn("[SW] Firebase already initialized or error:", e);
}

let messaging = null;
try {
  messaging = firebase.messaging();
} catch (e) {
  console.warn("[SW] Firebase messaging compat init error:", e);
}

// Service worker lifecycle
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Helper to build notification options from data-only payload
function buildNotificationOptions(data) {
  const safeData = data || {};
  const notificationType = (safeData.type || "GENERAL").toUpperCase();

  let tag = safeData.entityId
    ? `qroll-${notificationType.toLowerCase()}-${safeData.entityId}`
    : `qroll-${Date.now()}`;

  // Actions based on type
  const actions = [{ action: "open", title: "View in QRoll" }];

  return {
    body: safeData.body || "New update available on QRoll.",
    icon: "/favicon.png",
    badge: "/favicon.png",
    tag: tag,
    renotify: true,
    requireInteraction: notificationType === "ATTENDANCE" || notificationType === "DEADLINE",
    vibrate: [200, 100, 200],
    data: {
      url: safeData.url || "/",
      type: notificationType,
      entityId: safeData.entityId || "",
      entityType: safeData.entityType || "general",
      timestamp: safeData.timestamp || new Date().toISOString(),
    },
    actions: actions,
  };
}

// Background FCM Data-only handler
if (messaging) {
  messaging.onBackgroundMessage((payload) => {
    try {
      const data = payload.data || {};
      const title = data.title || "QRoll Update";
      const options = buildNotificationOptions(data);

      return self.registration.showNotification(title, options);
    } catch (err) {
      console.error("[SW] Error in onBackgroundMessage:", err);
      return self.registration.showNotification("QRoll Notification", {
        body: "You have a new update in QRoll.",
        icon: "/favicon.png",
        data: { url: "/" },
      });
    }
  });
}

// Fallback native push event listener (ensures notifications show even if raw push frame arrives)
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const raw = event.data.json();
    // Only handle if it has data and was not already processed as an FCM notification frame
    if (raw && raw.data && !raw.notification) {
      const data = raw.data;
      const title = data.title || "QRoll";
      const options = buildNotificationOptions(data);

      event.waitUntil(self.registration.showNotification(title, options));
    }
  } catch (e) {
    // Malformed JSON fallback
    try {
      const text = event.data.text();
      if (text) {
        event.waitUntil(
          self.registration.showNotification("QRoll Notification", {
            body: text,
            icon: "/favicon.png",
            data: { url: "/" },
          }),
        );
      }
    } catch (_) {
      // Ignore silent errors
    }
  }
});

// Notification Click Handler: Focus existing tab or open destination URL
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const targetUrl = data.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Resolve full target URL with origin
        const resolvedUrl = new URL(targetUrl, self.location.origin).href;

        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          const clientUrl = new URL(client.url, self.location.origin);

          // If client is on the same origin, focus it
          if (clientUrl.origin === self.location.origin && "focus" in client) {
            // Post message to the app client so TanStack Router can handle internal transition if preferred
            try {
              client.postMessage({
                type: "QROLL_NOTIFICATION_CLICK",
                url: targetUrl,
                data: data,
              });
            } catch (err) {
              console.warn("[SW] postMessage to client failed:", err);
            }

            return client.focus().then((focusedClient) => {
              if (focusedClient && "navigate" in focusedClient) {
                // Navigate client if currently on a different path
                if (client.url !== resolvedUrl) {
                  return focusedClient.navigate(resolvedUrl);
                }
              }
              return focusedClient;
            });
          }
        }

        // If no matching window is open, open a new browser window/tab
        if (self.clients.openWindow) {
          return self.clients.openWindow(resolvedUrl);
        }
      })
      .catch((err) => {
        console.error("[SW] notificationclick navigation error:", err);
      }),
  );
});
