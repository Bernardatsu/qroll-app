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

function normalizeLevel(val: any): string {
  if (!val) return "";
  const str = String(val).trim().toUpperCase();
  const digits = str.replace(/^(LEVEL|LVL|L)\s*/i, "").trim();
  return digits || str;
}

function levelMatches(courseLevel: any, studentLevel: any): boolean {
  if (!courseLevel || !studentLevel) return false;
  const cNorm = normalizeLevel(courseLevel);
  const sNorm = normalizeLevel(studentLevel);
  if (cNorm === sNorm) return true;
  const cDigits = cNorm.replace(/\D/g, "");
  const sDigits = sNorm.replace(/\D/g, "");
  if (cDigits && cDigits === sDigits) return true;
  return false;
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

          // 1. Fetch all student records matching this index number across all lecturers
          let matchingStudents = await queryCollectionRest("students", {
            where: [{ field: "index_number", op: "EQUAL", value: cleanIndex }],
          });

          // Fallback case-insensitive / uppercase search
          if (matchingStudents.length === 0 && cleanIndex !== cleanIndex.toUpperCase()) {
            matchingStudents = await queryCollectionRest("students", {
              where: [{ field: "index_number", op: "EQUAL", value: cleanIndex.toUpperCase() }],
            });
          }

          if (matchingStudents.length === 0) {
            return Response.json(
              {
                error:
                  "This index number is not registered by any lecturer or department yet. Please check your index number or contact your course lecturer.",
              },
              { status: 404 },
            );
          }

          // Collect all student doc IDs across different lecturers
          const allStudentIds = Array.from(new Set(matchingStudents.map((s: any) => s.id)));

          // Merge profile details so student has a unified identity
          const primaryStudent = matchingStudents[0];
          const studentId = primaryStudent.id;
          const fullName =
            matchingStudents.find((s: any) => s.full_name?.trim())?.full_name ||
            primaryStudent.full_name ||
            "Student";
          const level =
            matchingStudents.find((s: any) => s.level)?.level || primaryStudent.level || "100";
          const program =
            matchingStudents.find((s: any) => s.program?.trim())?.program ||
            primaryStudent.program ||
            "Undergraduate Degree";
          const studentEmail =
            matchingStudents.find((s: any) => s.email?.trim())?.email || primaryStudent.email || "";
          const qrUuid =
            matchingStudents.find((s: any) => s.qr_uuid?.trim())?.qr_uuid ||
            primaryStudent.qr_uuid ||
            cleanIndex;

          // 2. Fetch student account record (passwords & auth state)
          let account = null;
          for (const sid of allStudentIds) {
            account = await getDocRest("student_accounts", sid);
            if (account && account.password_hash) break;
          }
          if (!account || !account.password_hash) {
            account = await getDocRest("student_accounts", sanitizeDocId(cleanIndex));
          }

          // ACTION: Check Auth Status & Match Email
          if (action === "status" || action === "verify") {
            const hasPassword = Boolean(account && account.password_hash);
            const hasEmail = Boolean(studentEmail);
            const storedEmail = studentEmail.trim().toLowerCase();
            const inputEmail = (email || "").trim().toLowerCase();

            // Validate email if provided
            if (inputEmail) {
              if (storedEmail && inputEmail !== storedEmail) {
                return Response.json(
                  {
                    error: `The email "${email}" does not match the registered email for index number ${cleanIndex}. Please enter your registered email address or contact your course lecturer.`,
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
                id: studentId,
                full_name: fullName,
                index_number: cleanIndex,
                level: String(level),
                program,
                email: studentEmail || inputEmail,
                qr_uuid: qrUuid,
                lecturers_count: allStudentIds.length,
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
            const storedEmail = studentEmail.trim().toLowerCase();
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

            // Store under primary student ID and index number key for resilience
            const accountPayload = {
              student_id: studentId,
              index_number: cleanIndex,
              email: cleanEmail || storedEmail,
              password_salt: salt,
              password_hash: hash,
              updated_at: new Date().toISOString(),
            };

            await setDocRest("student_accounts", studentId, accountPayload);
            await setDocRest("student_accounts", sanitizeDocId(cleanIndex), accountPayload);

            if (cleanEmail && !studentEmail) {
              for (const sid of allStudentIds) {
                await setDocRest("students", sid, { email: cleanEmail }, true);
              }
            }

            return Response.json({
              ok: true,
              message: "Password created successfully",
              student: {
                id: studentId,
                full_name: fullName,
                index_number: cleanIndex,
                level: String(level),
                program,
                email: cleanEmail || studentEmail,
                qr_uuid: qrUuid,
              },
            });
          }

          // ACTION: Login
          if (action === "login") {
            if (!account || !account.password_hash) {
              return Response.json(
                {
                  ok: false,
                  needs_password_setup: true,
                  message: "No password has been set yet for this index number.",
                },
                { status: 200 },
              );
            }

            const { password_salt, password_hash } = account;
            if (!verifyPassword(password, password_salt, password_hash)) {
              return Response.json(
                { ok: false, error: "Invalid password for this index number." },
                { status: 401 },
              );
            }

            return Response.json({
              ok: true,
              student: {
                id: studentId,
                full_name: fullName,
                index_number: cleanIndex,
                level: String(level),
                program,
                email: studentEmail || account.email,
                qr_uuid: qrUuid,
                lecturers_count: allStudentIds.length,
              },
            });
          }

          // ACTION: Reset Password
          if (action === "reset_password") {
            const cleanEmail = (email || "").trim().toLowerCase();
            const allPossibleEmails = [
              studentEmail,
              account?.email,
              ...matchingStudents.map((s: any) => s.email),
            ]
              .filter(Boolean)
              .map((em: string) => String(em).trim().toLowerCase());

            if (!cleanEmail) {
              return Response.json(
                { error: "Registered email address is required to reset password" },
                { status: 400 },
              );
            }

            if (allPossibleEmails.length > 0 && !allPossibleEmails.includes(cleanEmail)) {
              return Response.json(
                {
                  error: `The email "${email}" does not match the registered email for index ${cleanIndex}. Please verify your registered email address.`,
                },
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

            const resetPayload = {
              student_id: studentId,
              index_number: cleanIndex,
              email: cleanEmail,
              password_salt: salt,
              password_hash: hash,
              updated_at: new Date().toISOString(),
            };

            await setDocRest("student_accounts", studentId, resetPayload);
            await setDocRest("student_accounts", sanitizeDocId(cleanIndex), resetPayload);

            for (const sid of allStudentIds) {
              await setDocRest("students", sid, { email: cleanEmail }, true);
            }

            return Response.json({
              ok: true,
              message: "Password reset successfully! You can now log in.",
              student: {
                id: studentId,
                full_name: fullName,
                index_number: cleanIndex,
                level: String(level),
                program,
                email: cleanEmail,
                qr_uuid: qrUuid,
                lecturers_count: allStudentIds.length,
              },
            });
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

            const updatedPayload = {
              student_id: studentId,
              index_number: cleanIndex,
              password_salt: salt,
              password_hash: hash,
              updated_at: new Date().toISOString(),
            };

            await setDocRest("student_accounts", studentId, updatedPayload);
            await setDocRest("student_accounts", sanitizeDocId(cleanIndex), updatedPayload);

            return Response.json({ ok: true, message: "Password changed successfully" });
          }

          // ACTION: Load Student Portal Data (Multi-Lecturer aggregation)
          if (action === "data") {
            if (!account || !account.password_hash) {
              return Response.json({ error: "Unauthorized" }, { status: 401 });
            }
            const { password_salt, password_hash } = account;
            if (!verifyPassword(password, password_salt, password_hash)) {
              return Response.json({ error: "Unauthorized" }, { status: 401 });
            }

            // 1. Query course registrations across ALL student doc IDs belonging to this student
            const allRegistrations = await queryCollectionRest("course_registrations");
            const myRegistrations = allRegistrations.filter((r: any) => {
              if (allStudentIds.includes(r.student_id)) return true;
              if (r.index_number && r.index_number.toUpperCase() === cleanIndex.toUpperCase())
                return true;
              return false;
            });

            const enrolledCourseIds = Array.from(
              new Set(myRegistrations.map((r: any) => r.course_id).filter(Boolean)),
            );

            // 2. Fetch all courses
            const allCourses = await queryCollectionRest("courses");
            const coursesMap = new Map<string, any>();
            allCourses.forEach((c) => coursesMap.set(c.id, c));

            // Fetch departments for department name resolution
            const allDepts = await queryCollectionRest("departments").catch(() => []);
            const deptsMap = new Map<string, any>();
            allDepts.forEach((d: any) => deptsMap.set(d.id, d));

            // Include courses created by the student's lecturer(s) that match the student's level
            // e.g. PETROLEUM ENGINEERING THERMODYNAMICS II (L200) -> visible to all Level 200 students under that lecturer
            for (const s of matchingStudents) {
              const lecturerId = s.owner_id;
              if (!lecturerId) continue;
              const sLevel = s.level || level || "100";
              for (const c of allCourses) {
                if (c.owner_id === lecturerId && !c.archived) {
                  if (levelMatches(c.level, sLevel)) {
                    if (!enrolledCourseIds.includes(c.id)) {
                      enrolledCourseIds.push(c.id);
                    }
                  }
                }
              }
            }

            // Also if student has attendance records in courses where registration wasn't explicitly populated,
            // we should still capture those courses!
            const allSessions = await queryCollectionRest("attendance_sessions");
            const sessionMap = new Map<string, any>();
            allSessions.forEach((s) => sessionMap.set(s.id, s));

            // 3. Fetch attendance records across ALL student IDs for this student
            const allRecords = await queryCollectionRest("attendance_records");
            const myRecords = allRecords.filter((r: any) => {
              if (allStudentIds.includes(r.student_id)) return true;
              if (r.index_number && r.index_number.toUpperCase() === cleanIndex.toUpperCase())
                return true;
              return false;
            });

            // Include courses from attendance sessions as well
            for (const r of myRecords) {
              const sess = sessionMap.get(r.session_id);
              if (sess?.course_id && !enrolledCourseIds.includes(sess.course_id)) {
                enrolledCourseIds.push(sess.course_id);
              }
            }

            // 4. Fetch users (lecturers) to associate course lecturer names
            const allUsers = await queryCollectionRest("users").catch(() => []);
            const usersMap = new Map<string, any>();
            allUsers.forEach((u: any) => usersMap.set(u.id, u));

            // 5. Enrich course attendance rows with Lecturer Name, Level, Department & Metrics
            const enrichedCourses = enrolledCourseIds.map((cId) => {
              const course = coursesMap.get(cId) || {
                id: cId,
                code: "Course",
                title: "Enrolled Course",
              };

              // Identify course lecturer
              const lecturerObj = course.owner_id ? usersMap.get(course.owner_id) : null;
              const lecturerName =
                course.lecturer_name ||
                course.instructor_name ||
                lecturerObj?.full_name ||
                lecturerObj?.name ||
                (lecturerObj?.email ? lecturerObj.email.split("@")[0] : "Course Lecturer");
              const lecturerEmail = lecturerObj?.email || null;

              const courseDept = course.department_id ? deptsMap.get(course.department_id) : null;
              const deptName =
                course.department_name ||
                courseDept?.name ||
                course.program ||
                primaryStudent.program ||
                "";

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

              const courseLevelDisplay = course.level
                ? String(course.level).toUpperCase().startsWith("L")
                  ? String(course.level).toUpperCase()
                  : `L${course.level}`
                : `L${level}`;

              return {
                course_id: cId,
                code: course.code || "Course",
                title: course.title || "Untitled Course",
                level: courseLevelDisplay,
                department: deptName,
                credit_hours: course.credit_hours || 2,
                semester: course.semester || "Semester",
                lecturer_name: lecturerName,
                lecturer_email: lecturerEmail,
                sessions_total: sessionsTotal,
                attended: attendedCount,
                missed: missedCount,
                late: lateCount,
                percentage,
                risk_level: riskLevel,
                risk_message: riskMessage,
              };
            });

            // Sort courses alphabetically by code
            enrichedCourses.sort((a, b) => a.code.localeCompare(b.code));

            // Format history records
            const history = myRecords
              .map((r: any) => {
                const sess = sessionMap.get(r.session_id);
                const crs = sess ? coursesMap.get(sess.course_id) : null;
                const lecturerObj = crs?.owner_id ? usersMap.get(crs.owner_id) : null;
                const lecturerName =
                  crs?.lecturer_name ||
                  crs?.instructor_name ||
                  lecturerObj?.full_name ||
                  lecturerObj?.email?.split("@")[0] ||
                  "Lecturer";

                return {
                  id: r.id,
                  session_id: r.session_id,
                  session_title: sess?.title || "Class Session",
                  course_id: sess?.course_id || "",
                  course_code: crs?.code || "",
                  course_title: crs?.title || "",
                  lecturer_name: lecturerName,
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

            // Fetch announcements across all lecturers
            // Include announcements if:
            // 1. They belong to an enrolled course
            // 2. OR they target student's level (or no level specified = all levels)
            const allNotices = await queryCollectionRest("announcements");
            const notices = allNotices
              .filter((n: any) => {
                if (n.course_id && enrolledCourseIds.includes(n.course_id)) return true;
                if (!n.course_id) {
                  if (!n.levels || n.levels.length === 0) return true;
                  if (n.levels.includes(String(level))) return true;
                }
                return false;
              })
              .map((n: any) => {
                const crs = n.course_id ? coursesMap.get(n.course_id) : null;
                const lecturerObj = n.owner_id ? usersMap.get(n.owner_id) : null;
                const lecturerName =
                  crs?.lecturer_name ||
                  lecturerObj?.full_name ||
                  lecturerObj?.email?.split("@")[0] ||
                  "Lecturer";

                return {
                  id: n.id,
                  title: n.title,
                  body: n.body,
                  course_id: n.course_id,
                  course_code: crs?.code || null,
                  course_title: crs?.title || null,
                  lecturer_name: lecturerName,
                  starts_on: n.starts_on || n.created_at || "",
                  created_at: n.created_at || "",
                };
              })
              .sort(
                (a: any, b: any) =>
                  new Date(b.created_at || b.starts_on || 0).getTime() -
                  new Date(a.created_at || a.starts_on || 0).getTime(),
              );

            // Fetch assignments across all lecturers for enrolled courses
            const allAssignments = await queryCollectionRest("assignments");
            const assignments = allAssignments
              .filter((a: any) => {
                if (a.course_id && enrolledCourseIds.includes(a.course_id)) return true;
                if (!a.course_id) {
                  if (!a.levels || a.levels.length === 0) return true;
                  if (a.levels.includes(String(level))) return true;
                }
                return false;
              })
              .map((a: any) => {
                const crs = a.course_id ? coursesMap.get(a.course_id) : null;
                const lecturerObj = a.owner_id ? usersMap.get(a.owner_id) : null;
                const lecturerName =
                  crs?.lecturer_name ||
                  lecturerObj?.full_name ||
                  lecturerObj?.email?.split("@")[0] ||
                  "Lecturer";

                return {
                  id: a.id,
                  title: a.title,
                  details: a.details,
                  course_id: a.course_id,
                  course_code: crs?.code || null,
                  course_title: crs?.title || null,
                  lecturer_name: lecturerName,
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

                if (!overdueA && overdueB) return -1;
                if (overdueA && !overdueB) return 1;
                return dueA - dueB;
              });

            return Response.json({
              student: {
                id: studentId,
                full_name: fullName,
                index_number: cleanIndex,
                level: String(level),
                program,
                email: studentEmail,
                qr_uuid: qrUuid,
                lecturers_count: allStudentIds.length,
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
