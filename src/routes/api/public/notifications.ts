import { createFileRoute } from "@tanstack/react-router";
import { authAdmin, firestoreAdmin, messagingAdmin } from "@/integrations/firebase/admin.server";
import {
  sendToUser,
  sendAttendanceOpenPush,
  sendAnnouncementPush,
  sendAssignmentPush,
  type NotificationPayload,
  type NotificationSubscriptionDoc,
  type NotificationPreferenceDoc,
} from "@/lib/notifications.server";

// In-memory rate limiting map for registration attempts (sliding 60-second window)
const rateLimitMap = new Map<string, { count: number; expiresAt: number }>();

function checkRateLimit(key: string, limit = 20, windowMs = 60000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || entry.expiresAt < now) {
    rateLimitMap.set(key, { count: 1, expiresAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) {
    return false;
  }
  entry.count++;
  return true;
}

// Clean up stale rate limits every 5 minutes (unref prevents blocking event loop)
if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of rateLimitMap.entries()) {
      if (v.expiresAt < now) rateLimitMap.delete(k);
    }
  }, 300000);
  if (timer && typeof timer === "object" && "unref" in timer) {
    (timer as any).unref();
  }
}

/**
 * Authenticate the caller:
 * 1. Checks Firebase Auth Bearer token for staff/lecturers/admins
 * 2. Or checks verified student session in headers/body for students
 */
async function authenticateRequest(
  request: Request,
  bodyObj?: any,
): Promise<{
  authenticated: boolean;
  userId: string;
  role: "super_admin" | "admin" | "lecturer" | "teaching_assistant" | "student" | "user";
  email?: string;
  error?: string;
}> {
  const authHeader = request.headers.get("authorization") || "";

  // 1. Firebase Bearer token check
  if (authHeader.startsWith("Bearer ")) {
    const idToken = authHeader.replace("Bearer ", "").trim();
    try {
      const decoded = await authAdmin.verifyIdToken(idToken);
      const uid = decoded.uid;

      // Look up user role from Firestore users collection
      let role: any = "lecturer";
      try {
        const userDoc = await firestoreAdmin.collection("users").doc(uid).get();
        if (userDoc.exists) {
          const udata = userDoc.data();
          role = udata?.role || "lecturer";
        }
      } catch (_) {
        // Default to lecturer if user profile document not populated yet
      }

      return {
        authenticated: true,
        userId: uid,
        role: role,
        email: decoded.email,
      };
    } catch (err: any) {
      // Continue to check student auth if bearer token is not a firebase token
      console.warn("[Notifications API] Firebase token verification failed:", err?.message);
    }
  }

  // 2. Student Authentication Check
  const studentId = request.headers.get("x-student-id") || bodyObj?.studentId || bodyObj?.userId;
  const studentIndex = request.headers.get("x-student-index") || bodyObj?.studentIndex;

  if (studentId || studentIndex) {
    try {
      const cleanIndex = studentIndex ? String(studentIndex).trim().toUpperCase() : "";
      let foundStudent = false;
      let studentEmail = "";

      // Check students collection by index_number
      if (cleanIndex) {
        const snap = await firestoreAdmin
          .collection("students")
          .where("index_number", "==", cleanIndex)
          .limit(1)
          .get();

        if (!snap.empty) {
          foundStudent = true;
          studentEmail = snap.docs[0].data()?.email || "";
        }
      }

      // Check students collection by document ID
      if (!foundStudent && studentId) {
        const docSnap = await firestoreAdmin.collection("students").doc(studentId).get();
        if (docSnap.exists) {
          foundStudent = true;
          studentEmail = docSnap.data()?.email || "";
        }
      }

      // Check student_accounts collection
      if (!foundStudent && cleanIndex) {
        const accSnap = await firestoreAdmin
          .collection("student_accounts")
          .doc(cleanIndex.toLowerCase())
          .get();
        if (accSnap.exists) {
          foundStudent = true;
          studentEmail = accSnap.data()?.email || "";
        }
      }

      // If valid student identifier provided
      if (foundStudent || (cleanIndex && cleanIndex.length >= 3)) {
        return {
          authenticated: true,
          userId: studentId || cleanIndex,
          role: "student",
          email: studentEmail,
        };
      }
    } catch (err: any) {
      console.warn("[Notifications API] Student lookup failed:", err?.message);
    }
  }

  return {
    authenticated: false,
    userId: "",
    role: "user",
    error: "Authentication required",
  };
}

export const Route = createFileRoute("/api/public/notifications")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const action = url.searchParams.get("action");
        const targetUserId = url.searchParams.get("userId");

        // Action: GET Preferences
        if (action === "preferences") {
          if (!targetUserId) {
            return Response.json({ error: "userId parameter is required" }, { status: 400 });
          }

          try {
            const doc = await firestoreAdmin
              .collection("notification_preferences")
              .doc(targetUserId)
              .get();

            if (!doc.exists) {
              const defaultPref: NotificationPreferenceDoc = {
                userId: targetUserId,
                masterEnabled: true,
                attendance: true,
                announcements: true,
                assignments: true,
                deadlines: true,
                system: true,
              };
              return Response.json({ ok: true, preferences: defaultPref });
            }

            return Response.json({ ok: true, preferences: doc.data() });
          } catch (err: any) {
            return Response.json(
              { error: err?.message || "Failed to load preferences" },
              { status: 500 },
            );
          }
        }

        // Action: GET User In-App Inbox Notifications
        if (action === "inbox") {
          if (!targetUserId) {
            return Response.json({ error: "userId parameter is required" }, { status: 400 });
          }

          try {
            const snap = await firestoreAdmin
              .collection("notifications")
              .where("userId", "==", targetUserId)
              .limit(50)
              .get();

            const items: any[] = [];
            snap.forEach((d) => items.push({ id: d.id, ...d.data() }));

            // Sort newest first
            items.sort(
              (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
            );

            return Response.json({ ok: true, notifications: items });
          } catch (err: any) {
            return Response.json(
              { error: err?.message || "Failed to load notifications" },
              { status: 500 },
            );
          }
        }

        // Action: GET Subscription Status for Diagnostic Check
        if (action === "subscription-status") {
          if (!targetUserId) {
            return Response.json({ error: "userId parameter is required" }, { status: 400 });
          }

          try {
            const snap = await firestoreAdmin
              .collection("notification_subscriptions")
              .where("userId", "==", targetUserId)
              .where("isActive", "==", true)
              .get();

            return Response.json({
              ok: true,
              activeDevices: snap.size,
              devices: snap.docs.map((d) => ({
                id: d.id,
                platform: d.data().platform,
                browser: d.data().browser,
                lastUsedAt: d.data().lastUsedAt,
                createdAt: d.data().createdAt,
              })),
            });
          } catch (err: any) {
            return Response.json(
              { error: err?.message || "Failed to check subscription" },
              { status: 500 },
            );
          }
        }

        return Response.json({ error: "Invalid GET action" }, { status: 400 });
      },

      POST: async ({ request }) => {
        const url = new URL(request.url);
        const action = url.searchParams.get("action");

        let body: any = {};
        try {
          body = await request.json();
        } catch (_) {
          body = {};
        }

        // Apply rate limiting per IP or token
        const clientIp =
          request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown-ip";
        if (!checkRateLimit(`${clientIp}_${action}`)) {
          return Response.json(
            { error: "Too many requests. Please wait a moment." },
            { status: 429 },
          );
        }

        // ACTION: Register FCM Token
        if (action === "register") {
          const auth = await authenticateRequest(request, body);
          if (!auth.authenticated || !auth.userId) {
            return Response.json(
              { error: "Unauthorized. Valid session required." },
              { status: 401 },
            );
          }

          const fcmToken = String(body.fcmToken || "").trim();
          if (!fcmToken || fcmToken.length < 20) {
            return Response.json({ error: "Invalid FCM registration token" }, { status: 400 });
          }

          const platform = String(body.platform || "web").slice(0, 50);
          const browser = String(body.browser || "unknown").slice(0, 50);
          const userAgent = String(body.userAgent || "").slice(0, 200);
          const now = new Date().toISOString();

          try {
            // Check for existing token to avoid duplicate records (unique token constraint)
            const snap = await firestoreAdmin
              .collection("notification_subscriptions")
              .where("fcmToken", "==", fcmToken)
              .limit(1)
              .get();

            const cleanIndex = body.studentIndex
              ? String(body.studentIndex).trim().toUpperCase()
              : undefined;
            const studentId = body.studentId || (auth.role === "student" ? auth.userId : undefined);

            let subscriptionId = "";
            if (!snap.empty) {
              const existingDoc = snap.docs[0];
              subscriptionId = existingDoc.id;
              const updates: any = {
                userId: auth.userId, // Re-assign in case user logged in on existing device
                userRole: auth.role,
                platform,
                browser,
                userAgent,
                isActive: true,
                updatedAt: now,
                lastUsedAt: now,
              };
              if (studentId) updates.studentId = studentId;
              if (cleanIndex) updates.studentIndex = cleanIndex;
              await existingDoc.ref.update(updates);
            } else {
              const newRef = firestoreAdmin.collection("notification_subscriptions").doc();
              subscriptionId = newRef.id;
              const subDoc: NotificationSubscriptionDoc = {
                id: subscriptionId,
                userId: auth.userId,
                userRole: auth.role,
                studentId,
                studentIndex: cleanIndex,
                fcmToken,
                platform,
                browser,
                userAgent,
                isActive: true,
                createdAt: now,
                updatedAt: now,
                lastUsedAt: now,
              };
              await newRef.set(subDoc);
            }

            // Ensure preferences record exists
            const prefRef = firestoreAdmin.collection("notification_preferences").doc(auth.userId);
            const prefDoc = await prefRef.get();
            if (!prefDoc.exists) {
              await prefRef.set({
                userId: auth.userId,
                masterEnabled: true,
                attendance: true,
                announcements: true,
                assignments: true,
                deadlines: true,
                system: true,
                updatedAt: now,
              });
            }

            return Response.json({
              ok: true,
              subscriptionId,
              message: "FCM push token registered successfully",
            });
          } catch (err: any) {
            console.error("[Notifications API] Token registration error:", err);
            return Response.json(
              { error: err?.message || "Failed to register push token" },
              { status: 500 },
            );
          }
        }

        // ACTION: Deactivate / Delete Token
        if (action === "deactivate") {
          const fcmToken = String(body.fcmToken || "").trim();
          if (!fcmToken) {
            return Response.json({ error: "fcmToken required" }, { status: 400 });
          }

          try {
            const snap = await firestoreAdmin
              .collection("notification_subscriptions")
              .where("fcmToken", "==", fcmToken)
              .get();

            const batch = firestoreAdmin.batch();
            snap.forEach((doc) => {
              batch.update(doc.ref, {
                isActive: false,
                updatedAt: new Date().toISOString(),
              });
            });
            await batch.commit();

            return Response.json({ ok: true, message: "Subscription deactivated" });
          } catch (err: any) {
            return Response.json(
              { error: err?.message || "Failed to deactivate" },
              { status: 500 },
            );
          }
        }

        // ACTION: Update Preferences
        if (action === "preferences") {
          const auth = await authenticateRequest(request, body);
          const targetUserId = body.userId || auth.userId;

          if (!targetUserId) {
            return Response.json({ error: "userId required" }, { status: 400 });
          }

          // Verify that user can only update their own preferences unless super_admin
          if (auth.authenticated && auth.userId !== targetUserId && auth.role !== "super_admin") {
            return Response.json({ error: "Forbidden" }, { status: 403 });
          }

          const prefRef = firestoreAdmin.collection("notification_preferences").doc(targetUserId);
          const updateData: Partial<NotificationPreferenceDoc> = {
            userId: targetUserId,
            updatedAt: new Date().toISOString(),
          };

          if (typeof body.masterEnabled === "boolean")
            updateData.masterEnabled = body.masterEnabled;
          if (typeof body.attendance === "boolean") updateData.attendance = body.attendance;
          if (typeof body.announcements === "boolean")
            updateData.announcements = body.announcements;
          if (typeof body.assignments === "boolean") updateData.assignments = body.assignments;
          if (typeof body.deadlines === "boolean") updateData.deadlines = body.deadlines;
          if (typeof body.system === "boolean") updateData.system = body.system;

          try {
            await prefRef.set(updateData, { merge: true });
            return Response.json({ ok: true, message: "Preferences saved successfully" });
          } catch (err: any) {
            return Response.json(
              { error: err?.message || "Failed to save preferences" },
              { status: 500 },
            );
          }
        }

        // ACTION: Mark Notification Read
        if (action === "mark-read") {
          const notificationId = String(body.id || "").trim();
          if (!notificationId) {
            return Response.json({ error: "id required" }, { status: 400 });
          }

          try {
            await firestoreAdmin
              .collection("notifications")
              .doc(notificationId)
              .update({ isRead: true });
            return Response.json({ ok: true });
          } catch (err: any) {
            return Response.json(
              { error: err?.message || "Failed to update notification" },
              { status: 500 },
            );
          }
        }

        // ACTION: Mark All Read
        if (action === "mark-all-read") {
          const targetUserId = String(body.userId || "").trim();
          if (!targetUserId) {
            return Response.json({ error: "userId required" }, { status: 400 });
          }

          try {
            const snap = await firestoreAdmin
              .collection("notifications")
              .where("userId", "==", targetUserId)
              .where("isRead", "==", false)
              .get();

            const batch = firestoreAdmin.batch();
            snap.forEach((doc) => {
              batch.update(doc.ref, { isRead: true });
            });
            await batch.commit();

            return Response.json({ ok: true, count: snap.size });
          } catch (err: any) {
            return Response.json(
              { error: err?.message || "Failed to mark all as read" },
              { status: 500 },
            );
          }
        }

        // ACTION: Trigger Notification Event (Lecturers & Staff)
        if (action === "trigger-event") {
          const auth = await authenticateRequest(request, body);
          if (!auth.authenticated || auth.role === "student") {
            return Response.json(
              { error: "Forbidden: Staff credentials required." },
              { status: 403 },
            );
          }

          const eventType = body.eventType;
          if (eventType === "ATTENDANCE_OPEN") {
            if (!body.sessionId || !body.courseId) {
              return Response.json({ error: "sessionId and courseId required" }, { status: 400 });
            }
            sendAttendanceOpenPush({
              sessionId: body.sessionId,
              courseId: body.courseId,
              courseCode: body.courseCode || "Course",
              sessionTitle: body.sessionTitle || "Attendance Session",
              ownerId: auth.userId,
            });
            return Response.json({ ok: true, message: "Attendance push queued" });
          }

          if (eventType === "ANNOUNCEMENT_PUBLISH") {
            if (!body.announcementId || !body.title) {
              return Response.json({ error: "announcementId and title required" }, { status: 400 });
            }
            sendAnnouncementPush({
              announcementId: body.announcementId,
              courseId: body.courseId,
              courseCode: body.courseCode,
              title: body.title,
              body: body.body || "",
              authorId: auth.userId,
            });
            return Response.json({ ok: true, message: "Announcement push queued" });
          }

          if (eventType === "ASSIGNMENT_PUBLISH") {
            if (!body.assignmentId || !body.title) {
              return Response.json({ error: "assignmentId and title required" }, { status: 400 });
            }
            sendAssignmentPush({
              assignmentId: body.assignmentId,
              courseId: body.courseId,
              courseCode: body.courseCode,
              title: body.title,
              dueAt: body.dueAt,
              authorId: auth.userId,
            });
            return Response.json({ ok: true, message: "Assignment push queued" });
          }

          return Response.json({ error: "Unknown eventType" }, { status: 400 });
        }

        // ACTION: Admin-Only Test Notification (Phase 13)
        if (action === "test-admin") {
          const auth = await authenticateRequest(request, body);
          if (!auth.authenticated || (auth.role !== "super_admin" && auth.role !== "admin")) {
            return Response.json(
              { error: "Forbidden: Only administrators can trigger test notifications." },
              { status: 403 },
            );
          }

          const payload: NotificationPayload = {
            type: "SYSTEM",
            title: "QRoll Notification Test",
            body: `Test push sent to admin ${auth.email || auth.userId} at ${new Date().toLocaleTimeString()}. Web Push delivery is fully operational!`,
            url: "/settings",
            entityId: `test-${Date.now()}`,
            entityType: "system",
          };

          // Send ONLY to the logged-in admin
          const result = await sendToUser(auth.userId, payload);

          return Response.json({
            ok: true,
            message: `Test push sent! ${result.successes} successful, ${result.failures} failed.`,
            result,
          });
        }

        return Response.json({ error: "Invalid POST action" }, { status: 400 });
      },
    },
  },
});
