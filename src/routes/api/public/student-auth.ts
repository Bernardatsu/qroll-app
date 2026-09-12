import { createFileRoute } from "@tanstack/react-router";
import {
  getDocRest,
  setDocRest,
  queryCollectionRest,
} from "@/integrations/firebase/firestore-rest";
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";

function sanitizeDocId(str: string): string {
  return str.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function hashPassword(password: string, salt: string): string {
  return pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
}

function verifyPassword(password: string, salt: string, hash: string): boolean {
  try {
    const calculated = pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
    const a = Buffer.from(calculated, "hex");
    const b = Buffer.from(hash, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// In-memory rate limiter with fallback to prevent lockouts
const memoryRateLimits = new Map<string, { count: number; resetAt: number }>();

async function checkRateLimit(
  ip: string,
  index: string,
): Promise<{ allowed: boolean; retryAfterMinutes?: number }> {
  const key = sanitizeDocId(`${ip}_${index}`);
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;

  try {
    const entry = memoryRateLimits.get(key);
    if (!entry || now > entry.resetAt) {
      memoryRateLimits.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true };
    }

    if (entry.count >= 8) {
      const retryAfterMinutes = Math.max(1, Math.ceil((entry.resetAt - now) / 60000));
      return { allowed: false, retryAfterMinutes };
    }

    entry.count += 1;
    return { allowed: true };
  } catch (err) {
    console.error("Rate limit error:", err);
    return { allowed: true };
  }
}

export const Route = createFileRoute("/api/public/student-auth")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { action, index, email, password, new_password } = body;
          const cleanIndex = (index || "").trim();

          if (!cleanIndex) {
            return Response.json({ error: "Index number is required" }, { status: 400 });
          }

          // Rate limit checks for password modification attempts
          if (
            action === "set_password" ||
            action === "reset_password" ||
            action === "change_password"
          ) {
            const clientIp =
              request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
              request.headers.get("cf-connecting-ip") ||
              "client";

            const rateCheck = await checkRateLimit(clientIp, cleanIndex);
            if (!rateCheck.allowed) {
              return Response.json(
                {
                  error: `Too many password attempts. Please wait ${rateCheck.retryAfterMinutes} minute(s) before trying again.`,
                },
                { status: 429 },
              );
            }
          }

          // 1. Fetch Student record from students collection
          let students = await queryCollectionRest("students", {
            where: [{ field: "index_number", op: "EQUAL", value: cleanIndex }],
            limit: 1,
          });

          // Fallback case-insensitive / uppercase search
          if (students.length === 0 && cleanIndex !== cleanIndex.toUpperCase()) {
            students = await queryCollectionRest("students", {
              where: [{ field: "index_number", op: "EQUAL", value: cleanIndex.toUpperCase() }],
              limit: 1,
            });
          }

          if (students.length === 0) {
            return Response.json(
              {
                error:
                  "This index number is not registered by any tutor yet. Please verify your index number.",
              },
              { status: 404 },
            );
          }

          const studentData = students[0];
          const studentId = studentData.id;

          // 2. Fetch student account record (passwords & auth state)
          let account = await getDocRest("student_accounts", studentId);
          // Also check by cleanIndex if not found by studentId
          if (!account) {
            account = await getDocRest("student_accounts", sanitizeDocId(cleanIndex));
          }

          // ACTION: Check Auth Status & Match Email
          if (action === "status" || action === "verify") {
            const hasPassword = Boolean(account && account.password_hash);
            const hasEmail = Boolean(studentData.email);
            const storedEmail = (studentData.email || "").trim().toLowerCase();
            const inputEmail = (email || "").trim().toLowerCase();

            // Validate email if provided
            if (inputEmail) {
              if (storedEmail && inputEmail !== storedEmail) {
                return Response.json(
                  {
                    error: `The email "${email}" does not match the email registered for index number ${cleanIndex}. Please enter your registered email address or contact your course lecturer.`,
                  },
                  { status: 400 },
                );
              }
            }

            return Response.json({
              exists: true,
              has_password: hasPassword,
              has_email: hasEmail,
              email_verified: Boolean(inputEmail && (!storedEmail || inputEmail === storedEmail)),
              student: {
                id: studentData.id,
                full_name: studentData.full_name,
                index_number: studentData.index_number,
                level: studentData.level,
                program: studentData.program,
                email: studentData.email || inputEmail,
                qr_uuid: studentData.qr_uuid || studentData.index_number,
              },
            });
          }

          // ACTION: Set Initial Password
          if (action === "set_password") {
            if (!password || password.length < 6) {
              return Response.json(
                { error: "Password must be at least 6 characters" },
                { status: 400 },
              );
            }
            if (account && account.password_hash) {
              return Response.json(
                {
                  error:
                    "Password already set. Please sign in with your password or use reset password.",
                },
                { status: 400 },
              );
            }

            const cleanEmail = (email || "").trim().toLowerCase();
            const storedEmail = (studentData.email || "").trim().toLowerCase();
            if (storedEmail && cleanEmail && storedEmail !== cleanEmail) {
              return Response.json(
                {
                  error: `The email "${email}" does not match the registered email for this index number.`,
                },
                { status: 400 },
              );
            }

            const salt = randomBytes(16).toString("hex");
            const hash = hashPassword(password, salt);

            await setDocRest("student_accounts", studentId, {
              student_id: studentId,
              index_number: cleanIndex,
              email: cleanEmail || storedEmail,
              password_salt: salt,
              password_hash: hash,
              updated_at: new Date().toISOString(),
            });

            if (cleanEmail && !studentData.email) {
              await setDocRest("students", studentId, { email: cleanEmail }, true);
            }

            return Response.json({
              ok: true,
              message: "Password created successfully",
              student: {
                id: studentData.id,
                full_name: studentData.full_name,
                index_number: studentData.index_number,
                level: studentData.level,
                program: studentData.program,
                email: studentData.email || cleanEmail,
                qr_uuid: studentData.qr_uuid || studentData.index_number,
              },
            });
          }

          // ACTION: Login
          if (action === "login") {
            if (!account || !account.password_hash) {
              return Response.json(
                {
                  error:
                    "No password has been set for this account yet. Please create your password first.",
                  needs_password_setup: true,
                },
                { status: 401 },
              );
            }

            const { password_salt, password_hash } = account;
            if (!verifyPassword(password, password_salt, password_hash)) {
              return Response.json({ error: "Wrong index number or password" }, { status: 401 });
            }

            return Response.json({
              ok: true,
              student: {
                id: studentData.id,
                full_name: studentData.full_name,
                index_number: studentData.index_number,
                level: studentData.level,
                program: studentData.program,
                email: studentData.email || account.email,
                qr_uuid: studentData.qr_uuid || studentData.index_number,
              },
            });
          }

          // ACTION: Reset Password
          if (action === "reset_password") {
            const cleanEmail = (email || "").trim().toLowerCase();
            const storedEmail = (studentData.email || account?.email || "").trim().toLowerCase();

            if (!cleanEmail) {
              return Response.json(
                { error: "Registered email address is required to reset password" },
                { status: 400 },
              );
            }

            if (storedEmail && cleanEmail !== storedEmail) {
              return Response.json(
                { error: "Email does not match our records for this index number" },
                { status: 400 },
              );
            }
            if (!password || password.length < 6) {
              return Response.json(
                { error: "Password must be at least 6 characters" },
                { status: 400 },
              );
            }

            const salt = randomBytes(16).toString("hex");
            const hash = hashPassword(password, salt);

            await setDocRest("student_accounts", studentId, {
              student_id: studentId,
              index_number: cleanIndex,
              email: cleanEmail || storedEmail,
              password_salt: salt,
              password_hash: hash,
              updated_at: new Date().toISOString(),
            });

            if (cleanEmail && !studentData.email) {
              await setDocRest("students", studentId, { email: cleanEmail }, true);
            }

            return Response.json({ ok: true, message: "Password reset successfully" });
          }

          // ACTION: Change Password (Account Settings)
          if (action === "change_password") {
            if (!account || !account.password_hash) {
              return Response.json({ error: "Account password not set yet" }, { status: 400 });
            }
            const { password_salt, password_hash } = account;
            if (!verifyPassword(password, password_salt, password_hash)) {
              return Response.json({ error: "Current password is incorrect" }, { status: 401 });
            }
            if (!new_password || new_password.length < 6) {
              return Response.json(
                { error: "New password must be at least 6 characters" },
                { status: 400 },
              );
            }

            const salt = randomBytes(16).toString("hex");
            const hash = hashPassword(new_password, salt);

            await setDocRest("student_accounts", studentId, {
              student_id: studentId,
              index_number: cleanIndex,
              password_salt: salt,
              password_hash: hash,
              updated_at: new Date().toISOString(),
            });

            return Response.json({ ok: true, message: "Password changed successfully" });
          }

          // ACTION: Load Student Portal Data
          if (action === "data") {
            if (!account || !account.password_hash) {
              return Response.json({ error: "Unauthorized" }, { status: 401 });
            }
            const { password_salt, password_hash } = account;
            if (!verifyPassword(password, password_salt, password_hash)) {
              return Response.json({ error: "Unauthorized" }, { status: 401 });
            }

            // 1. Get student course registrations
            const registrations = await queryCollectionRest("course_registrations", {
              where: [{ field: "student_id", op: "EQUAL", value: studentId }],
            });

            const enrolledCourseIds = Array.from(
              new Set(registrations.map((r: any) => r.course_id).filter(Boolean)),
            );

            // 2. Fetch all courses
            const allCourses = await queryCollectionRest("courses");
            const coursesMap = new Map<string, any>();
            allCourses.forEach((c) => coursesMap.set(c.id, c));

            // 3. Fetch all attendance sessions
            const allSessions = await queryCollectionRest("attendance_sessions");
            const sessionMap = new Map<string, any>();
            allSessions.forEach((s) => sessionMap.set(s.id, s));

            // 4. Fetch attendance records for this student
            const myRecords = await queryCollectionRest("attendance_records", {
              where: [{ field: "student_id", op: "EQUAL", value: studentId }],
            });

            // Calculate attendance stats per enrolled course
            const enrichedCourses = enrolledCourseIds.map((cId) => {
              const course = coursesMap.get(cId) || {
                id: cId,
                code: "N/A",
                title: "Enrolled Course",
              };

              // Sessions conducted for this course
              const courseSessions = allSessions.filter((s: any) => s.course_id === cId);
              const courseSessionIds = new Set(courseSessions.map((s: any) => s.id));

              // Records for this course's sessions
              const recordsForCourse = myRecords.filter((r: any) =>
                courseSessionIds.has(r.session_id),
              );

              let attendedCount = 0;
              let lateCount = 0;

              for (const r of recordsForCourse) {
                const st = (r.status || "").toUpperCase();
                if (st === "PRESENT" || st === "ON_TIME" || st === "EXCUSED") {
                  attendedCount++;
                } else if (st === "LATE") {
                  attendedCount++;
                  lateCount++;
                }
              }

              const sessionsTotal = courseSessions.length;
              const missedCount = Math.max(0, sessionsTotal - attendedCount);
              const percentage =
                sessionsTotal > 0 ? Math.round((attendedCount / sessionsTotal) * 100) : 100;

              // Risk flag calculation: 75% threshold
              let riskLevel: "safe" | "warning" | "critical" = "safe";
              let riskMessage = "Good attendance standing (Eligible for exams)";
              if (sessionsTotal > 0 && percentage < 75) {
                riskLevel = "critical";
                riskMessage = `Below 75% threshold: Missed ${missedCount} of ${sessionsTotal} sessions. Exam eligibility at risk!`;
              } else if (sessionsTotal > 0 && missedCount >= 3) {
                riskLevel = "warning";
                riskMessage = `Caution: Missed ${missedCount} sessions. Approaching risk threshold.`;
              }

              return {
                course_id: cId,
                code: course.code || "Course",
                title: course.title || "Untitled Course",
                credit_hours: course.credit_hours || 3,
                semester: course.semester || "First",
                sessions_total: sessionsTotal,
                attended: attendedCount,
                missed: missedCount,
                late: lateCount,
                percentage,
                risk_level: riskLevel,
                risk_message: riskMessage,
              };
            });

            // Sort courses by code
            enrichedCourses.sort((a, b) => a.code.localeCompare(b.code));

            // Format history records
            const history = myRecords
              .map((r: any) => {
                const sess = sessionMap.get(r.session_id);
                const crs = sess ? coursesMap.get(sess.course_id) : null;
                return {
                  id: r.id,
                  session_id: r.session_id,
                  session_title: sess?.title || "Class Session",
                  course_code: crs?.code || "",
                  course_title: crs?.title || "",
                  session_date: r.session_date || r.check_in_at?.slice(0, 10) || "Unknown",
                  check_in_at: r.check_in_at || r.created_at || "",
                  status: (r.status || "PRESENT").toUpperCase(),
                };
              })
              .sort(
                (a: any, b: any) =>
                  new Date(b.check_in_at || b.session_date).getTime() -
                  new Date(a.check_in_at || a.session_date).getTime(),
              );

            // Fetch announcements (filtered to student's courses or general, most recent first)
            const allNotices = await queryCollectionRest("announcements");
            const notices = allNotices
              .filter((n: any) => !n.course_id || enrolledCourseIds.includes(n.course_id))
              .map((n: any) => {
                const crs = n.course_id ? coursesMap.get(n.course_id) : null;
                return {
                  id: n.id,
                  title: n.title,
                  body: n.body,
                  course_id: n.course_id,
                  course_code: crs?.code || null,
                  starts_on: n.starts_on || n.created_at || "",
                  created_at: n.created_at || "",
                };
              })
              .sort(
                (a: any, b: any) =>
                  new Date(b.created_at || b.starts_on || 0).getTime() -
                  new Date(a.created_at || a.starts_on || 0).getTime(),
              );

            // Fetch assignments (filtered to student's courses, sorted with upcoming deadlines first)
            const allAssignments = await queryCollectionRest("assignments");
            const assignments = allAssignments
              .filter((a: any) => enrolledCourseIds.includes(a.course_id))
              .map((a: any) => {
                const crs = a.course_id ? coursesMap.get(a.course_id) : null;
                return {
                  id: a.id,
                  title: a.title,
                  details: a.details,
                  course_id: a.course_id,
                  course_code: crs?.code || null,
                  due_at: a.due_at || null,
                  submission_url: a.submission_url || null,
                  created_at: a.created_at || "",
                };
              })
              .sort((a: any, b: any) => {
                const now = Date.now();
                const dueA = a.due_at ? new Date(a.due_at).getTime() : Infinity;
                const dueB = b.due_at ? new Date(b.due_at).getTime() : Infinity;
                const overdueA = dueA < now;
                const overdueB = dueB < now;

                // Upcoming first, then closed/past
                if (!overdueA && overdueB) return -1;
                if (overdueA && !overdueB) return 1;
                return dueA - dueB;
              });

            return Response.json({
              student: {
                id: studentData.id,
                full_name: studentData.full_name,
                index_number: studentData.index_number,
                level: studentData.level,
                program: studentData.program,
                email: studentData.email,
                qr_uuid: studentData.qr_uuid || studentData.index_number,
              },
              courses: enrichedCourses,
              announcements: notices,
              assignments,
              history,
            });
          }

          return Response.json({ error: "Invalid action" }, { status: 400 });
        } catch (err: any) {
          console.error("Student auth error:", err);
          return Response.json({ error: err?.message || "Internal server error" }, { status: 500 });
        }
      },
    },
  },
});
