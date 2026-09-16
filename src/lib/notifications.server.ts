import { firestoreAdmin, messagingAdmin } from "@/integrations/firebase/admin.server";
import type { Message } from "firebase-admin/messaging";

export type NotificationType =
  "ATTENDANCE" | "ANNOUNCEMENT" | "ASSIGNMENT" | "DEADLINE" | "SYSTEM" | "GENERAL";

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  url: string;
  entityId?: string;
  entityType?: "session" | "announcement" | "assignment" | "system" | "general";
  timestamp?: string;
}

export interface SendResult {
  attempts: number;
  successes: number;
  failures: number;
  deactivatedTokens: number;
}

export interface NotificationSubscriptionDoc {
  id: string;
  userId: string;
  userRole?: string;
  fcmToken: string;
  platform?: string;
  browser?: string;
  userAgent?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  failureReason?: string;
}

export interface NotificationPreferenceDoc {
  id?: string;
  userId: string;
  masterEnabled?: boolean;
  attendance?: boolean;
  announcements?: boolean;
  assignments?: boolean;
  deadlines?: boolean;
  system?: boolean;
  updatedAt?: string;
}

/**
 * Filter users based on their notification category preferences.
 */
async function filterUsersByPreferences(
  userIds: string[],
  type: NotificationType,
): Promise<string[]> {
  if (userIds.length === 0) return [];

  const allowedUserIds: string[] = [];

  // Batch query preferences in chunks of 30
  for (let i = 0; i < userIds.length; i += 30) {
    const chunk = userIds.slice(i, i + 30);
    try {
      const snap = await firestoreAdmin
        .collection("notification_preferences")
        .where("userId", "in", chunk)
        .get();

      const prefMap = new Map<string, NotificationPreferenceDoc>();
      snap.forEach((doc) => {
        const data = doc.data() as NotificationPreferenceDoc;
        prefMap.set(data.userId, data);
      });

      for (const uid of chunk) {
        const p = prefMap.get(uid);
        if (!p) {
          // Default: all notifications enabled
          allowedUserIds.push(uid);
          continue;
        }

        if (p.masterEnabled === false) {
          continue;
        }

        let categoryAllowed = true;
        if (type === "ATTENDANCE" && p.attendance === false) categoryAllowed = false;
        if (type === "ANNOUNCEMENT" && p.announcements === false) categoryAllowed = false;
        if (type === "ASSIGNMENT" && p.assignments === false) categoryAllowed = false;
        if (type === "DEADLINE" && p.deadlines === false) categoryAllowed = false;
        if (type === "SYSTEM" && p.system === false) categoryAllowed = false;

        if (categoryAllowed) {
          allowedUserIds.push(uid);
        }
      }
    } catch (e) {
      console.warn("[FCM] Preference query error, allowing default for chunk:", e);
      allowedUserIds.push(...chunk);
    }
  }

  return allowedUserIds;
}

/**
 * Record an in-app notification for each targeted user in Firestore.
 */
async function recordInAppNotifications(
  userIds: string[],
  payload: NotificationPayload,
): Promise<void> {
  if (userIds.length === 0) return;

  const now = new Date().toISOString();
  const batch = firestoreAdmin.batch();
  let count = 0;

  for (const uid of userIds) {
    const notifRef = firestoreAdmin.collection("notifications").doc();
    batch.set(notifRef, {
      id: notifRef.id,
      userId: uid,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      url: payload.url,
      entityId: payload.entityId || "",
      entityType: payload.entityType || "general",
      isRead: false,
      createdAt: now,
    });
    count++;

    // Firestore batch limit is 500
    if (count >= 450) {
      await batch.commit();
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
  }
}

/**
 * Dispatch DATA-ONLY FCM HTTP v1 notifications to a set of active subscriptions.
 */
async function dispatchToSubscriptions(
  subs: NotificationSubscriptionDoc[],
  payload: NotificationPayload,
): Promise<SendResult> {
  const result: SendResult = {
    attempts: subs.length,
    successes: 0,
    failures: 0,
    deactivatedTokens: 0,
  };

  if (subs.length === 0) {
    return result;
  }

  const now = new Date().toISOString();

  // Prepare FCM HTTP v1 messages — DATA-ONLY!
  // No "notification" object in the payload so the browser will not auto-display it,
  // allowing firebase-messaging-sw.js to construct and display the notification with our click action.
  const messages: Message[] = subs.map((sub) => ({
    token: sub.fcmToken,
    data: {
      type: String(payload.type),
      title: String(payload.title),
      body: String(payload.body),
      url: String(payload.url),
      entityId: String(payload.entityId || ""),
      entityType: String(payload.entityType || "general"),
      timestamp: payload.timestamp || now,
    },
    webpush: {
      headers: {
        Urgency: payload.type === "ATTENDANCE" || payload.type === "DEADLINE" ? "high" : "normal",
      },
      fcmOptions: {
        link: payload.url,
      },
    },
  }));

  // Batch in chunks of 500 (FCM sendEach max)
  for (let i = 0; i < messages.length; i += 500) {
    const msgChunk = messages.slice(i, i + 500);
    const subChunk = subs.slice(i, i + 500);

    try {
      const batchResponse = await messagingAdmin.sendEach(msgChunk);

      for (let j = 0; j < batchResponse.responses.length; j++) {
        const resp = batchResponse.responses[j];
        const sub = subChunk[j];

        if (resp.success) {
          result.successes++;
          // Asynchronously record success
          firestoreAdmin
            .collection("notification_subscriptions")
            .doc(sub.id)
            .update({
              lastSuccessAt: now,
              lastUsedAt: now,
            })
            .catch(() => {});
        } else {
          result.failures++;
          const errorCode = resp.error?.code || "";

          // Check if token is permanently dead and should be deactivated
          const isDeadToken =
            errorCode === "messaging/registration-token-not-registered" ||
            errorCode === "messaging/invalid-registration-token" ||
            errorCode === "messaging/invalid-argument";

          if (isDeadToken) {
            result.deactivatedTokens++;
            firestoreAdmin
              .collection("notification_subscriptions")
              .doc(sub.id)
              .update({
                isActive: false,
                lastFailureAt: now,
                failureReason: errorCode,
              })
              .catch(() => {});
          } else {
            firestoreAdmin
              .collection("notification_subscriptions")
              .doc(sub.id)
              .update({
                lastFailureAt: now,
                failureReason: errorCode || "unknown",
              })
              .catch(() => {});
          }
        }
      }
    } catch (err: any) {
      console.error("[FCM] Batch send error:", err?.message || err);
      result.failures += msgChunk.length;
    }
  }

  console.info(
    `[FCM] Notification dispatched: type=${payload.type} attempts=${result.attempts} successes=${result.successes} failures=${result.failures} deactivated=${result.deactivatedTokens}`,
  );

  return result;
}

/**
 * Send notification to a single user.
 */
export async function sendToUser(
  userId: string,
  payload: NotificationPayload,
): Promise<SendResult> {
  return sendToUsers([userId], payload);
}

/**
 * Send notification to multiple users.
 */
export async function sendToUsers(
  userIds: string[],
  payload: NotificationPayload,
): Promise<SendResult> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) {
    return { attempts: 0, successes: 0, failures: 0, deactivatedTokens: 0 };
  }

  try {
    // 1. Create in-app notification records
    await recordInAppNotifications(uniqueUserIds, payload);

    // 2. Filter users by category preferences
    const eligibleUserIds = await filterUsersByPreferences(uniqueUserIds, payload.type);
    if (eligibleUserIds.length === 0) {
      return { attempts: 0, successes: 0, failures: 0, deactivatedTokens: 0 };
    }

    // 3. Query active subscriptions
    const allSubs: NotificationSubscriptionDoc[] = [];
    for (let i = 0; i < eligibleUserIds.length; i += 30) {
      const chunk = eligibleUserIds.slice(i, i + 30);
      const snap = await firestoreAdmin
        .collection("notification_subscriptions")
        .where("userId", "in", chunk)
        .where("isActive", "==", true)
        .get();

      snap.forEach((doc) => {
        allSubs.push({ id: doc.id, ...(doc.data() as any) });
      });
    }

    // 4. Dispatch FCM push
    return await dispatchToSubscriptions(allSubs, payload);
  } catch (err) {
    console.error("[FCM] sendToUsers unexpected error:", err);
    return { attempts: 0, successes: 0, failures: 0, deactivatedTokens: 0 };
  }
}

/**
 * Send notification to all users matching a specific role (e.g. 'student', 'lecturer', 'admin').
 */
export async function sendToRole(role: string, payload: NotificationPayload): Promise<SendResult> {
  try {
    const snap = await firestoreAdmin
      .collection("notification_subscriptions")
      .where("userRole", "==", role)
      .where("isActive", "==", true)
      .get();

    const subs: NotificationSubscriptionDoc[] = [];
    const userIds = new Set<string>();
    snap.forEach((doc) => {
      const data = doc.data() as any;
      subs.push({ id: doc.id, ...data });
      if (data.userId) userIds.add(data.userId);
    });

    if (userIds.size > 0) {
      await recordInAppNotifications(Array.from(userIds), payload);
    }

    return await dispatchToSubscriptions(subs, payload);
  } catch (err) {
    console.error("[FCM] sendToRole unexpected error:", err);
    return { attempts: 0, successes: 0, failures: 0, deactivatedTokens: 0 };
  }
}

/**
 * Send notification to all students enrolled in a specific course.
 */
export async function sendToCourseMembers(
  courseId: string,
  payload: NotificationPayload,
  options?: { excludeUserId?: string },
): Promise<SendResult> {
  try {
    // 1. Fetch course registrations for this course
    const regSnap = await firestoreAdmin
      .collection("course_registrations")
      .where("course_id", "==", courseId)
      .get();

    const studentIds = new Set<string>();
    regSnap.forEach((doc) => {
      const d = doc.data();
      if (d.student_id) studentIds.add(d.student_id);
    });

    // Also fetch students who may match level of course created by the lecturer
    const courseDoc = await firestoreAdmin.collection("courses").doc(courseId).get();
    if (courseDoc.exists) {
      const course = courseDoc.data();
      if (course?.owner_id && course?.level) {
        const studentSnap = await firestoreAdmin
          .collection("students")
          .where("owner_id", "==", course.owner_id)
          .where("level", "==", course.level)
          .get();

        studentSnap.forEach((doc) => {
          studentIds.add(doc.id);
        });
      }
    }

    if (options?.excludeUserId) {
      studentIds.delete(options.excludeUserId);
    }

    const recipientIds = Array.from(studentIds);
    if (recipientIds.length === 0) {
      return { attempts: 0, successes: 0, failures: 0, deactivatedTokens: 0 };
    }

    return await sendToUsers(recipientIds, payload);
  } catch (err) {
    console.error("[FCM] sendToCourseMembers error:", err);
    return { attempts: 0, successes: 0, failures: 0, deactivatedTokens: 0 };
  }
}

/**
 * High-level helper: Send attendance session opened push notification.
 */
export async function sendAttendanceOpenPush(opts: {
  sessionId: string;
  courseId: string;
  courseCode: string;
  sessionTitle: string;
  ownerId?: string;
}): Promise<void> {
  const payload: NotificationPayload = {
    type: "ATTENDANCE",
    title: `Attendance is Open — ${opts.courseCode}`,
    body: `Attendance for "${opts.sessionTitle}" is now open. Tap to mark your attendance.`,
    url: `/student?tab=attendance&session=${opts.sessionId}`,
    entityId: opts.sessionId,
    entityType: "session",
  };

  sendToCourseMembers(opts.courseId, payload, { excludeUserId: opts.ownerId }).catch((err) => {
    console.warn("[FCM] Background attendance push error:", err);
  });
}

/**
 * High-level helper: Send announcement published push notification.
 */
export async function sendAnnouncementPush(opts: {
  announcementId: string;
  courseId?: string;
  courseCode?: string;
  title: string;
  body: string;
  authorId?: string;
}): Promise<void> {
  const previewBody = opts.body.length > 120 ? `${opts.body.slice(0, 117)}...` : opts.body;
  const heading = opts.courseCode
    ? `Announcement [${opts.courseCode}]: ${opts.title}`
    : `Announcement: ${opts.title}`;

  const payload: NotificationPayload = {
    type: "ANNOUNCEMENT",
    title: heading,
    body: previewBody,
    url: `/student?tab=announcements&id=${opts.announcementId}`,
    entityId: opts.announcementId,
    entityType: "announcement",
  };

  if (opts.courseId && opts.courseId !== "all") {
    sendToCourseMembers(opts.courseId, payload, { excludeUserId: opts.authorId }).catch((err) => {
      console.warn("[FCM] Background announcement push error:", err);
    });
  } else {
    // Broadcast to all students
    sendToRole("student", payload).catch((err) => {
      console.warn("[FCM] Background broadcast announcement push error:", err);
    });
  }
}

/**
 * High-level helper: Send assignment published push notification.
 */
export async function sendAssignmentPush(opts: {
  assignmentId: string;
  courseId: string;
  courseCode?: string;
  title: string;
  dueAt?: string;
  authorId?: string;
}): Promise<void> {
  const dueNotice = opts.dueAt ? `Due: ${new Date(opts.dueAt).toLocaleDateString()}` : "";
  const bodyText = dueNotice
    ? `New coursework "${opts.title}" posted. ${dueNotice}.`
    : `New coursework "${opts.title}" has been posted. Tap to view.`;

  const heading = opts.courseCode
    ? `Assignment [${opts.courseCode}]: ${opts.title}`
    : `Assignment: ${opts.title}`;

  const payload: NotificationPayload = {
    type: "ASSIGNMENT",
    title: heading,
    body: bodyText,
    url: `/student?tab=assignments&id=${opts.assignmentId}`,
    entityId: opts.assignmentId,
    entityType: "assignment",
  };

  sendToCourseMembers(opts.courseId, payload, { excludeUserId: opts.authorId }).catch((err) => {
    console.warn("[FCM] Background assignment push error:", err);
  });
}
