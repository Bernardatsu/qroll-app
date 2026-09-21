import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BellRing,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Link as LinkIcon,
  Lock,
  LogOut,
  Megaphone,
  QrCode,
  RefreshCw,
  ShieldCheck,
  User,
  UserPlus,
  AlertCircle,
  ExternalLink,
  Filter,
  FileText,
  Mail,
  School,
  BookCheck,
  Printer,
  Smartphone,
  Check,
  Sparkles,
} from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { PublicFooter } from "@/components/PublicFooter";
import { calculateAttendanceGrade } from "@/lib/grading";
import { NotificationBell } from "@/components/NotificationBell";
import { NotificationSettingsSection } from "@/components/NotificationSettingsSection";
import {
  requestAndRegisterPushToken,
  setupForegroundNotificationListener,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "@/lib/fcm-client";
import qrollLogo from "@/assets/qroll-logo.png";
import studentsBanner from "@/assets/students-banner-fast.webp";

export const Route = createFileRoute("/student")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Student Portal — QRoll" },
      {
        name: "description",
        content:
          "Access your student attendance records, download your QR pass, view enrolled courses, announcements, and assignments.",
      },
      { property: "og:title", content: "Student Portal — QRoll" },
      {
        property: "og:description",
        content: "Track your attendance percentage, QR code, enrolled courses, and announcements.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudentPortalPage,
});

const STORE = "qroll.student.session.v2";
const BRAND_QR_COLOR = "#0f172a";

interface StudentMe {
  id: string;
  full_name: string;
  index_number: string;
  level: string;
  program?: string;
  email?: string;
  qr_uuid?: string;
  lecturers_count?: number;
}

interface CourseAttendanceRow {
  course_id: string;
  code: string;
  title: string;
  level?: string;
  department?: string;
  credit_hours: number;
  semester: string;
  lecturer_name?: string;
  lecturer_email?: string | null;
  sessions_total: number;
  attended: number;
  missed: number;
  late: number;
  percentage: number;
  risk_level: "safe" | "warning" | "critical";
  risk_message: string;
}

interface HistoryItem {
  id: string;
  session_id: string;
  session_title: string;
  course_id?: string;
  course_code: string;
  course_title: string;
  lecturer_name?: string;
  session_date: string;
  check_in_at: string;
  status: string;
}

interface NoticeItem {
  id: string;
  title: string;
  body: string;
  course_id?: string;
  course_code: string | null;
  course_title?: string | null;
  lecturer_name?: string;
  starts_on: string;
  created_at: string;
}

interface AssignmentItem {
  id: string;
  title: string;
  details: string;
  course_id: string;
  course_code: string | null;
  course_title?: string | null;
  lecturer_name?: string;
  due_at: string | null;
  submission_url: string | null;
  created_at: string;
}

interface PortalNotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  url?: string;
  isRead?: boolean;
  is_read?: boolean;
  createdAt?: string;
  created_at?: string;
}

type AuthStep = "login" | "register" | "reset" | "index" | "create";

function getInitialStoredSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORE);
    if (raw) return JSON.parse(raw);
  } catch {
    // Ignore invalid JSON
  }
  return null;
}

function persistStudentSession(data: any) {
  if (typeof window === "undefined") return;
  try {
    const serialized = JSON.stringify(data);
    sessionStorage.setItem(STORE, serialized);
  } catch (e) {
    console.warn("Session persist warning:", e);
  }
}

function clearStudentSession() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORE);
    localStorage.removeItem(STORE);
  } catch (e) {
    console.warn("Session clear warning:", e);
  }
}

function StudentPortalPage() {
  const [initialSession] = useState(getInitialStoredSession);
  const [step, setStep] = useState<AuthStep>(() => (initialSession?.student ? "login" : "login"));
  const [index, setIndex] = useState(() => initialSession?.i || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(() => initialSession?.p || "");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasEmail, setHasEmail] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // New Student Registration Dedicated State
  const [regFullName, setRegFullName] = useState("");
  const [regIndex, setRegIndex] = useState("");
  const [regLevel, setRegLevel] = useState("100");
  const [regProgram, setRegProgram] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Authenticated State (preserved until webapp is closed)
  const [me, setMe] = useState<StudentMe | null>(() => initialSession?.student || null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [courses, setCourses] = useState<CourseAttendanceRow[]>(
    () => initialSession?.courses || [],
  );
  const [history, setHistory] = useState<HistoryItem[]>(() => initialSession?.history || []);
  const [announcements, setAnnouncements] = useState<NoticeItem[]>(
    () => initialSession?.announcements || [],
  );
  const [assignments, setAssignments] = useState<AssignmentItem[]>(
    () => initialSession?.assignments || [],
  );
  const [notifications, setNotifications] = useState<PortalNotificationItem[]>(
    () => initialSession?.notifications || [],
  );
  const [activeTab, setActiveTab] = useState<string>("attendance");
  const [notifCategoryFilter, setNotifCategoryFilter] = useState<string>("ALL");
  const [pushPermission, setPushPermission] = useState<string>(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default",
  );
  const [enablingPush, setEnablingPush] = useState(false);

  // Account Settings state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // QR Code generator matching QRoll brand green
  useEffect(() => {
    if (me) {
      const qrPayload = me.qr_uuid || me.index_number;
      QRCode.toDataURL(qrPayload, {
        width: 380,
        margin: 2,
        color: {
          dark: BRAND_QR_COLOR,
          light: "#ffffff",
        },
      })
        .then(setQrUrl)
        .catch((err) => {
          console.error("Could not generate student QR code:", err);
          toast.error("Could not render QR code");
        });
    } else {
      setQrUrl(null);
    }
  }, [me]);

  const printPass = () => {
    if (!me || !qrUrl) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(
      `<html><head><title>${me.index_number} - Universal QR Pass</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;text-align:center;padding:40px;color:#0f172a}.badge{display:inline-block;border:2px solid #0f172a;border-radius:16px;padding:24px 32px;max-width:340px}.logo-img{width:48px;height:48px;margin-bottom:6px;object-fit:contain}img.qr{width:240px;height:240px}h2{margin:0 0 8px;color:#064e3b}h3{margin:12px 0 4px;font-size:20px}p{margin:4px 0;color:#475569;font-size:13px}.tag{display:inline-block;background:#d1fae5;color:#065f46;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:600;margin-bottom:12px}</style></head><body><div class="badge"><img src="${qrollLogo}" class="logo-img" alt="QRoll" /><div class="tag">UNIVERSAL STUDENT ATTENDANCE PASS</div><h2>QRoll Pass</h2><img class="qr" src="${qrUrl}" /><h3>${me.full_name}</h3><p><strong>${me.index_number}</strong> · Level ${me.level || "100"}</p><p>${me.program || "Undergraduate Degree"}</p><p style="font-size:11px;color:#64748b;margin-top:12px">One unique QR code valid for all courses & lecturers · Powered by QRoll</p></div></body></html>`,
    );
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  const downloadBrandedBadge = async () => {
    if (!me || !qrUrl) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 760;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 600, 760);

      // Top brand header
      ctx.fillStyle = "#064e3b";
      ctx.fillRect(0, 0, 600, 90);

      // Draw QRoll logo
      const logoImg = new Image();
      logoImg.crossOrigin = "anonymous";
      await new Promise((resolve) => {
        logoImg.onload = () => {
          try {
            ctx.drawImage(logoImg, 30, 20, 50, 50);
          } catch {
            // ignore
          }
          resolve(true);
        };
        logoImg.onerror = () => resolve(true);
        logoImg.src = qrollLogo;
      });

      // Header text
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText("QRoll Student QR Pass", 95, 46);
      ctx.font = "14px sans-serif";
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.fillText("Official Attendance Identification", 95, 68);

      // Student info
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 26px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(me.full_name, 300, 140);

      ctx.fillStyle = "#064e3b";
      ctx.font = "bold 18px monospace";
      ctx.fillText(`INDEX: ${me.index_number}`, 300, 175);

      ctx.fillStyle = "#64748b";
      ctx.font = "14px sans-serif";
      ctx.fillText(`Level ${me.level} · ${me.program || "Undergraduate"}`, 300, 202);

      // Draw QR Code
      const qrImg = new Image();
      await new Promise((resolve) => {
        qrImg.onload = () => {
          ctx.drawImage(qrImg, 110, 230, 380, 380);
          resolve(true);
        };
        qrImg.onerror = () => resolve(true);
        qrImg.src = qrUrl;
      });

      // Footer
      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px sans-serif";
      ctx.fillText("Show this QR to lecturer or scan projector QR to check in", 300, 670);
      ctx.fillText("Powered by QRoll · Verified University System", 300, 695);

      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `QRoll-${me.index_number}-Pass.png`;
      a.click();
    } catch {
      const a = document.createElement("a");
      a.href = qrUrl;
      a.download = `QRoll-${me.index_number}.png`;
      a.click();
    }
  };

  // Auto-register device push token whenever user has granted permission
  useEffect(() => {
    if (me && typeof window !== "undefined" && "Notification" in window) {
      setPushPermission(Notification.permission);
      if (Notification.permission === "granted") {
        requestAndRegisterPushToken({
          id: me.id,
          role: "student",
          indexNumber: me.index_number,
          email: me.email,
        }).catch((err) => {
          console.warn("[StudentPortal] Auto push token update:", err);
        });
      }
    }
  }, [me]);

  // Session auto-restore on page load with instant offline hydration
  useEffect(() => {
    const raw =
      typeof window !== "undefined"
        ? sessionStorage.getItem(STORE) || localStorage.getItem(STORE)
        : null;
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      // Immediately hydrate cached state so QR pass & records are viewable offline
      if (parsed.student) {
        setMe(parsed.student);
        if (Array.isArray(parsed.courses)) setCourses(parsed.courses);
        if (Array.isArray(parsed.history)) setHistory(parsed.history);
        if (Array.isArray(parsed.announcements)) setAnnouncements(parsed.announcements);
        if (Array.isArray(parsed.assignments)) setAssignments(parsed.assignments);
        if (Array.isArray(parsed.notifications)) setNotifications(parsed.notifications);
      }
      if (parsed.i && parsed.p) {
        setIndex(parsed.i);
        setPassword(parsed.p);
        void executeSignIn(parsed.i, parsed.p, true);
      }
    } catch {
      clearStudentSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const callApi = async (payload: any) => {
    const res = await fetch("/api/public/student-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Authentication request failed");
    }
    return data;
  };

  const fetchStudentData = async (indexNum: string, pass: string) => {
    try {
      const data = await callApi({ action: "data", index: indexNum, password: pass });
      if (data.student) setMe(data.student);
      setCourses(data.courses || []);
      setHistory(data.history || []);
      setAnnouncements(data.announcements || []);
      setAssignments(data.assignments || []);
      if (Array.isArray(data.notifications)) {
        setNotifications(data.notifications);
      }

      // Persist full snapshot so student stays logged in across reloads
      persistStudentSession({
        i: indexNum,
        p: pass,
        student: data.student,
        courses: data.courses || [],
        history: data.history || [],
        announcements: data.announcements || [],
        assignments: data.assignments || [],
        notifications: data.notifications || [],
      });
    } catch (err: any) {
      const msg = err?.message || "";
      if (
        msg.toLowerCase().includes("quota") ||
        msg.includes("429") ||
        msg.includes("RESOURCE_EXHAUSTED")
      ) {
        console.warn("Firestore daily quota reached; preserving offline student state:", err);
      } else {
        console.error("Failed to load student data:", err);
      }
    }
  };

  const executeSignIn = async (indexNum: string, pass: string, silent = false) => {
    try {
      if (!silent) setBusy(true);
      const data = await callApi({ action: "login", index: indexNum, password: pass });
      if (!data.ok || !data.student) {
        if (data.needs_password_setup) {
          toast.info(
            "No password has been set for this index number yet. Please set your password first.",
          );
          setStep("create");
        } else if (!silent) {
          toast.error("Invalid index number or password");
        }
        setBusy(false);
        return false;
      }

      persistStudentSession({
        i: indexNum,
        p: pass,
        student: data.student,
      });
      setIndex(indexNum);
      setPassword(pass);
      setMe(data.student);
      await fetchStudentData(indexNum, pass);
      setBusy(false);
      return true;
    } catch (err: any) {
      setBusy(false);
      const msg = err?.message || "";
      if (msg.includes("No password") || msg.includes("not set yet")) {
        toast.info("No password set yet. Please set your password first.");
        setStep("create");
      } else if (
        msg.toLowerCase().includes("quota") ||
        msg.includes("429") ||
        msg.includes("RESOURCE_EXHAUSTED")
      ) {
        if (me) {
          toast.info(
            "Offline Pass Mode: Database quota reached. Your saved universal pass is active for scanning.",
          );
          return true;
        }
        toast.error(
          "Firestore free daily read quota reached. Resets at 00:00 UTC or upon project plan upgrade.",
        );
      } else if (!silent) {
        toast.error(msg || "Invalid index number or password");
      }
      return false;
    }
  };

  // Real-time listener for incoming push notifications and periodic background refresh (5 mins, active tab only)
  useEffect(() => {
    if (!me || !index || !password) return;

    // Refresh inbox on incoming foreground push
    const cleanup = setupForegroundNotificationListener(() => {
      void fetchStudentData(index, password);
    });

    // Background interval to keep data fresh without consuming excessive quota (5 minutes, active tab only)
    const interval = setInterval(
      () => {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
        void fetchStudentData(index, password);
      },
      5 * 60 * 1000,
    );

    return () => {
      cleanup();
      clearInterval(interval);
    };
  }, [me, index, password]);

  // Handle service worker notification click communication
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "QROLL_NOTIFICATION_CLICK") {
        const notifData = event.data.data || {};
        if (notifData.type === "ANNOUNCEMENT") {
          setActiveTab("announcements");
        } else if (notifData.type === "ASSIGNMENT") {
          setActiveTab("assignments");
        } else if (notifData.type === "ATTENDANCE") {
          setActiveTab("attendance");
        } else {
          setActiveTab("notifications");
        }
        if (index && password) {
          void fetchStudentData(index, password);
        }
      }
    };
    navigator.serviceWorker.addEventListener("message", handleSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleSwMessage);
    };
  }, [index, password]);

  // Request & register browser push notification permission
  const handleEnablePush = async () => {
    if (!me) return;
    setEnablingPush(true);
    try {
      const res = await requestAndRegisterPushToken({
        id: me.id,
        role: "student",
        indexNumber: me.index_number,
        email: me.email,
      });
      if (typeof window !== "undefined" && "Notification" in window) {
        setPushPermission(Notification.permission);
      }
      if (res.permission === "granted") {
        toast.success(
          "Phone notifications enabled! You'll now receive alerts directly on your device.",
        );
      } else if (res.permission === "denied") {
        toast.error(
          "Notifications are blocked in your browser settings. Please allow notifications for QRoll.",
        );
      } else {
        toast.info("Notification prompt dismissed. You can enable them anytime.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to enable notifications");
    } finally {
      setEnablingPush(false);
    }
  };

  const unreadNotifCount = useMemo(() => {
    return notifications.filter((n) => !n.isRead && !n.is_read).length;
  }, [notifications]);

  const handleMarkNotifRead = async (notifId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, isRead: true, is_read: true } : n)),
    );
    try {
      await markNotificationAsRead(notifId);
    } catch {
      // ignore
    }
  };

  const handleMarkAllNotifsRead = async () => {
    if (!me) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true, is_read: true })));
    try {
      await markAllNotificationsAsRead(me.id);
      toast.success("All notifications marked as read");
    } catch {
      toast.error("Could not mark all as read");
    }
  };

  const filteredNotifications = useMemo(() => {
    if (notifCategoryFilter === "ALL") return notifications;
    return notifications.filter(
      (n) => (n.type || "GENERAL").toUpperCase() === notifCategoryFilter.toUpperCase(),
    );
  }, [notifications, notifCategoryFilter]);

  const handleNewStudentRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = regFullName.trim();
    const cleanIndex = regIndex.trim().toUpperCase();
    const cleanEmail = regEmail.trim();

    if (!cleanName) {
      toast.error("Please enter your full legal name");
      return;
    }
    if (!cleanIndex) {
      toast.error("Please enter your student index number");
      return;
    }
    if (!cleanEmail) {
      toast.error("Please enter your email address");
      return;
    }
    if (!regPassword || regPassword.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }
    if (regPassword !== regConfirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setBusy(true);
    try {
      const res = await callApi({
        action: "register",
        full_name: cleanName,
        index: cleanIndex,
        email: cleanEmail,
        level: regLevel || "100",
        program: regProgram.trim() || "General",
        password: regPassword,
      });

      if (!res.ok) {
        throw new Error(res.error || "Registration failed");
      }

      toast.success(res.message || "Registration successful! Welcome to QRoll.");
      setIndex(cleanIndex);
      setPassword(regPassword);
      setMe(res.student);

      persistStudentSession({
        i: cleanIndex,
        p: regPassword,
        student: res.student,
      });

      await fetchStudentData(cleanIndex, regPassword);

      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        void requestAndRegisterPushToken({
          id: res.student.id,
          role: "student",
          indexNumber: cleanIndex,
          email: cleanEmail,
        });
      }
    } catch (err: any) {
      const msg = err?.message || "Registration failed";
      if (msg.includes("already exists") || msg.includes("already set")) {
        toast.info(msg);
        setIndex(cleanIndex);
        setStep("login");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDirectRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanIndex = index.trim();
    const cleanEmail = email.trim();
    if (!cleanIndex) {
      toast.error("Please enter your index number");
      return;
    }
    if (!cleanEmail) {
      toast.error("Please enter your registered email address");
      return;
    }
    if (!password || password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setBusy(true);
    try {
      // 1. Verify index and email match in system
      const statusData = await callApi({
        action: "status",
        index: cleanIndex,
        email: cleanEmail,
      });

      if (statusData.has_password) {
        setBusy(false);
        setStep("login");
        toast.info(
          "A password is already set for this account. Please enter your password to sign in.",
        );
        return;
      }

      // 2. Set initial password
      const regData = await callApi({
        action: "set_password",
        index: cleanIndex,
        email: cleanEmail,
        password,
      });

      if (!regData.ok) {
        setBusy(false);
        toast.error(regData.error || "Could not set password");
        return;
      }

      toast.success("Password created successfully! Opening your student portal...");
      await executeSignIn(cleanIndex, password);
    } catch (err: any) {
      setBusy(false);
      toast.error(err?.message || "Verification or password setup failed");
    }
  };

  const handleCheckIndex = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanIndex = index.trim();
    const cleanEmail = email.trim();

    if (!cleanIndex) {
      toast.error("Please enter your index number");
      return;
    }
    if (!cleanEmail) {
      toast.error("Please enter your registered email address");
      return;
    }

    setBusy(true);
    try {
      const data = await callApi({
        action: "status",
        index: cleanIndex,
        email: cleanEmail,
      });
      setBusy(false);
      setHasEmail(Boolean(data.has_email));

      if (data.student) {
        setMe(data.student);
        if (data.student.email) {
          setEmail(data.student.email);
        }
      }

      if (data.has_password) {
        setStep("login");
        toast.info("Credentials verified! Please enter your password to sign in.");
      } else {
        setStep("create");
        toast.success("Identity verified! Please create your portal password.");
      }
    } catch (err: any) {
      setBusy(false);
      toast.error(
        err.message ||
          "Could not verify your student records. Please confirm your index number and registered email address.",
      );
    }
  };

  const handleCreatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setBusy(true);
    try {
      const data = await callApi({
        action: "set_password",
        index: index.trim(),
        email: email.trim(),
        password,
      });

      if (!data.ok) {
        setBusy(false);
        toast.error(data.error || "Could not set password");
        return;
      }

      toast.success("Password created successfully! Opening your student portal...");
      await executeSignIn(index.trim(), password);
    } catch (err: any) {
      setBusy(false);
      toast.error(err.message || "Could not create password");
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanIdx = index.trim();
    const cleanMail = email.trim();
    if (!cleanIdx) {
      toast.error("Please enter your student index number");
      return;
    }
    if (!cleanMail) {
      toast.error("Please enter your registered email address");
      return;
    }
    if (!password || password.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setBusy(true);
    try {
      const data = await callApi({
        action: "reset_password",
        index: cleanIdx,
        email: cleanMail,
        password,
      });

      if (!data.ok) {
        setBusy(false);
        toast.error(data.error || "Password reset failed");
        return;
      }

      toast.success("Password reset successfully! Logging you in...");
      await executeSignIn(cleanIdx, password);
    } catch (err: any) {
      setBusy(false);
      toast.error(err.message || "Password reset failed");
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanIdx = index.trim();
    if (!cleanIdx) {
      toast.error("Please enter your student index number");
      return;
    }
    if (!password) {
      toast.error("Please enter your password");
      return;
    }
    await executeSignIn(cleanIdx, password);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      toast.error("Please enter your current password");
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error("New passwords do not match");
      return;
    }

    setChangingPassword(true);
    try {
      const data = await callApi({
        action: "change_password",
        index: index.trim(),
        password: currentPassword,
        new_password: newPassword,
      });

      setChangingPassword(false);
      if (!data.ok) {
        toast.error(data.error || "Password change failed");
        return;
      }

      toast.success("Password changed successfully!");
      // Update session storage with new password and preserve student data
      persistStudentSession({
        i: index.trim(),
        p: newPassword,
        student: me,
        courses,
        history,
        announcements,
        assignments,
        notifications,
      });
      setPassword(newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err: any) {
      setChangingPassword(false);
      toast.error(err.message || "Could not change password");
    }
  };

  const handleSignOut = () => {
    clearStudentSession();
    setMe(null);
    setPassword("");
    setConfirmPassword("");
    setStep("index");
    setCourses([]);
    setHistory([]);
    setAnnouncements([]);
    setAssignments([]);
    setNotifications([]);
    toast.info("Signed out from student portal");
  };

  // Multi-Lecturer Course Filter State
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>("all");

  const filteredCourses = useMemo(() => {
    if (selectedCourseFilter === "all") return courses;
    return courses.filter((c) => c.course_id === selectedCourseFilter);
  }, [courses, selectedCourseFilter]);

  const filteredAnnouncements = useMemo(() => {
    if (selectedCourseFilter === "all") return announcements;
    return announcements.filter((a) => !a.course_id || a.course_id === selectedCourseFilter);
  }, [announcements, selectedCourseFilter]);

  const filteredAssignments = useMemo(() => {
    if (selectedCourseFilter === "all") return assignments;
    return assignments.filter((a) => !a.course_id || a.course_id === selectedCourseFilter);
  }, [assignments, selectedCourseFilter]);

  const filteredHistory = useMemo(() => {
    if (selectedCourseFilter === "all") return history;
    return history.filter((h) => h.course_id === selectedCourseFilter);
  }, [history, selectedCourseFilter]);

  // Lecturer summary across courses
  const uniqueLecturers = useMemo(() => {
    const map = new Map<string, { name: string; email?: string | null; courses: string[] }>();
    courses.forEach((c) => {
      const name = c.lecturer_name || "Academic Department";
      if (!map.has(name)) {
        map.set(name, { name, email: c.lecturer_email, courses: [c.code] });
      } else {
        const entry = map.get(name)!;
        if (!entry.courses.includes(c.code)) {
          entry.courses.push(c.code);
        }
      }
    });
    return Array.from(map.values());
  }, [courses]);

  // Overall Running Attendance Calculation
  const totalAttendedSessions = courses.reduce((acc, c) => acc + c.attended, 0);
  const totalHeldSessions = courses.reduce((acc, c) => acc + c.sessions_total, 0);
  const overallPercentage =
    totalHeldSessions > 0 ? Math.round((totalAttendedSessions / totalHeldSessions) * 100) : 100;

  // Courses at risk (below 75% threshold)
  const atRiskCourses = courses.filter((c) => c.sessions_total > 0 && c.percentage < 75);
  const warningCourses = courses.filter(
    (c) => c.sessions_total > 0 && c.percentage >= 75 && c.missed >= 3,
  );

  return (
    <div className="min-h-screen bg-muted/25 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b bg-card/90 backdrop-blur-md sticky top-0 z-30 shadow-xs">
        <div className="w-full px-3 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2.5 hover:opacity-90 transition group">
              <div className="size-10 sm:size-11 rounded-xl bg-white p-1 shadow-sm ring-1 ring-border/50 flex items-center justify-center shrink-0 transition-transform group-hover:scale-105">
                <img src={qrollLogo} alt="QRoll logo" className="size-full object-contain" />
              </div>
              <div>
                <span className="font-bold text-base sm:text-lg tracking-tight text-foreground block leading-none">
                  QRoll
                </span>
                <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">
                  Attendance System
                </span>
              </div>
            </Link>
            <span className="text-muted-foreground/40 hidden sm:inline">/</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-1 rounded-md hidden sm:inline-block">
              Student Portal
            </span>
          </div>

          <div className="flex items-center gap-2">
            {me ? (
              <>
                <NotificationBell
                  userId={me.id}
                  role="student"
                  indexNumber={me.index_number}
                  settingsUrl="#settings"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSignOut}
                  className="text-xs gap-1.5 h-8 font-medium"
                >
                  <LogOut className="size-3.5" />
                  Sign Out
                </Button>
              </>
            ) : (
              <Link to="/">
                <Button variant="ghost" size="sm" className="text-xs gap-1 h-8">
                  <ArrowLeft className="size-3.5" />
                  Home
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full px-3 sm:px-6 lg:px-8 py-5 md:py-8">
        {!me ? (
          /* ========================================================================= */
          /* AUTHENTICATION SCREENS (INDEX CHECK, FIRST-TIME PASSWORD, LOGIN, RESET)   */
          /* ========================================================================= */
          <div className="max-w-md mx-auto py-4 sm:py-8">
            <Card className="shadow-lg border-primary/10 overflow-hidden">
              {/* Student Portal Header Banner Image */}
              <div className="relative w-full h-36 sm:h-40 overflow-hidden bg-gradient-to-r from-blue-900 via-blue-950 to-slate-900">
                <img
                  src={studentsBanner}
                  alt="Student Portal Banner"
                  className="w-full h-full object-cover opacity-75 mix-blend-overlay"
                  loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent flex flex-col justify-end p-4">
                  <div className="flex items-center gap-2">
                    <img
                      src={qrollLogo}
                      alt="QRoll"
                      className="h-6 w-auto object-contain brightness-200"
                    />
                    <span className="text-white font-bold text-base sm:text-lg tracking-tight drop-shadow-sm">
                      Student Access Portal
                    </span>
                  </div>
                  <p className="text-white/80 text-xs mt-0.5 font-medium">
                    Attendance records, personalized QR pass & course updates
                  </p>
                </div>
              </div>

              {/* Mode Selector Tabs */}
              <div className="p-1.5 bg-black/5 dark:bg-white/5 border-b border-border/60 grid grid-cols-3 gap-1 text-xs">
                <button
                  type="button"
                  id="tab-student-signin"
                  onClick={() => {
                    setStep("login");
                    setPassword("");
                    setConfirmPassword("");
                  }}
                  className={`py-2 px-2 rounded-lg font-semibold transition text-center flex items-center justify-center gap-1.5 ${
                    step === "login"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  <Lock className="size-3.5" />
                  <span>Sign In</span>
                </button>
                <button
                  type="button"
                  id="tab-new-student-registration"
                  onClick={() => {
                    setStep("register");
                    setPassword("");
                    setConfirmPassword("");
                  }}
                  className={`py-2 px-1.5 rounded-lg font-bold transition text-center flex items-center justify-center gap-1.5 ${
                    step === "register" || step === "index" || step === "create"
                      ? "bg-blue-600 text-white shadow-sm ring-2 ring-blue-500/50"
                      : "text-foreground font-semibold hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  <UserPlus className="size-3.5 text-blue-600 dark:text-blue-400" />
                  <span className="truncate">New Register</span>
                </button>
                <button
                  type="button"
                  id="tab-student-reset"
                  onClick={() => {
                    setStep("reset");
                    setPassword("");
                    setConfirmPassword("");
                  }}
                  className={`py-2 px-2 rounded-lg font-semibold transition text-center flex items-center justify-center gap-1.5 ${
                    step === "reset"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  <RefreshCw className="size-3.5" />
                  <span>Reset</span>
                </button>
              </div>

              {(step === "register" || step === "index") && (
                <>
                  <CardHeader className="text-center pb-3 pt-5">
                    <div className="mx-auto size-12 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 grid place-items-center mb-2 border border-blue-500/20">
                      <UserPlus className="size-6" />
                    </div>
                    <CardTitle className="text-xl font-bold text-foreground">
                      New Student Registration
                    </CardTitle>
                    <CardDescription className="text-xs max-w-sm mx-auto">
                      Fill in your student details to create your official attendance profile,
                      generate your unique QR pass, and access your portal.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <form onSubmit={handleNewStudentRegister} className="space-y-3.5">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="reg-fullname"
                          className="text-xs font-semibold text-foreground"
                        >
                          Full Legal Name
                        </Label>
                        <Input
                          id="reg-fullname"
                          placeholder="e.g. Kwame Mensah"
                          value={regFullName}
                          onChange={(e) => setRegFullName(e.target.value)}
                          required
                          className="h-10 text-sm"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label
                            htmlFor="reg-index"
                            className="text-xs font-semibold text-foreground"
                          >
                            Index / Student ID
                          </Label>
                          <Input
                            id="reg-index"
                            placeholder="e.g. 1029485"
                            value={regIndex}
                            onChange={(e) => setRegIndex(e.target.value)}
                            required
                            className="h-10 font-mono text-sm uppercase tracking-wide"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label
                            htmlFor="reg-level"
                            className="text-xs font-semibold text-foreground"
                          >
                            Academic Level
                          </Label>
                          <select
                            id="reg-level"
                            value={regLevel}
                            onChange={(e) => setRegLevel(e.target.value)}
                            className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-600"
                          >
                            <option value="100">Level 100 (First Year)</option>
                            <option value="200">Level 200 (Second Year)</option>
                            <option value="300">Level 300 (Third Year)</option>
                            <option value="400">Level 400 (Final Year)</option>
                            <option value="500">Level 500 (Fifth Year)</option>
                            <option value="Postgraduate">Postgraduate / Masters</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label
                          htmlFor="reg-program"
                          className="text-xs font-semibold text-foreground"
                        >
                          Program of Study / Department
                        </Label>
                        <Input
                          id="reg-program"
                          list="departments-list"
                          placeholder="e.g. B.Sc. Computer Science"
                          value={regProgram}
                          onChange={(e) => setRegProgram(e.target.value)}
                          className="h-10 text-sm"
                        />
                        <datalist id="departments-list">
                          <option value="Computer Science" />
                          <option value="Electrical & Electronic Engineering" />
                          <option value="Mechanical Engineering" />
                          <option value="Civil Engineering" />
                          <option value="Chemical Engineering" />
                          <option value="Petroleum Engineering" />
                          <option value="Mathematics & Statistics" />
                          <option value="Medicine & Surgery" />
                          <option value="Nursing" />
                          <option value="Pharmacy" />
                          <option value="Business Administration" />
                          <option value="Accounting & Finance" />
                          <option value="Faculty of Law" />
                          <option value="Architecture" />
                          <option value="Agricultural Engineering" />
                          <option value="Physics" />
                        </datalist>
                      </div>

                      <div className="space-y-1.5">
                        <Label
                          htmlFor="reg-email"
                          className="text-xs font-semibold text-foreground"
                        >
                          Student Email Address
                        </Label>
                        <Input
                          id="reg-email"
                          type="email"
                          placeholder="e.g. student@st.ug.edu.gh"
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          required
                          className="h-10 text-sm"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold text-foreground">
                              Password
                            </Label>
                            <button
                              type="button"
                              onClick={() => setShowRegPassword(!showRegPassword)}
                              className="text-[11px] text-muted-foreground hover:text-foreground"
                            >
                              {showRegPassword ? "Hide" : "Show"}
                            </button>
                          </div>
                          <Input
                            type={showRegPassword ? "text" : "password"}
                            placeholder="Min 6 characters"
                            value={regPassword}
                            onChange={(e) => setRegPassword(e.target.value)}
                            minLength={6}
                            required
                            className="h-10"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-foreground">Confirm</Label>
                          <Input
                            type={showRegPassword ? "text" : "password"}
                            placeholder="Re-enter"
                            value={regConfirmPassword}
                            onChange={(e) => setRegConfirmPassword(e.target.value)}
                            minLength={6}
                            required
                            className="h-10"
                          />
                        </div>
                      </div>

                      <Button
                        type="submit"
                        id="student-register-submit-btn"
                        className="w-full h-11 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm tracking-wide shadow-sm hover:shadow-md active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
                        disabled={busy}
                      >
                        {busy ? (
                          <span className="flex items-center gap-2">
                            <RefreshCw className="size-4 animate-spin" /> Registering & Generating
                            Pass...
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <UserPlus className="size-4" /> Register & Generate Official QR Pass
                          </span>
                        )}
                      </Button>
                    </form>

                    <div className="pt-2 text-center space-y-1.5">
                      <p className="text-xs text-muted-foreground">
                        Already have an account?{" "}
                        <button
                          type="button"
                          onClick={() => setStep("login")}
                          className="text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                        >
                          Sign In with Password
                        </button>
                      </p>
                    </div>
                  </CardContent>
                </>
              )}

              {step === "create" && (
                <>
                  <CardHeader className="text-center pb-3">
                    <div className="mx-auto size-12 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 grid place-items-center mb-2">
                      <KeyRound className="size-6" />
                    </div>
                    <CardTitle className="text-xl font-bold">Create Your Password</CardTitle>
                    <CardDescription className="text-xs">
                      First time accessing your portal! Create a secure password to protect your
                      account.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-3 bg-muted/50 rounded-lg border border-border/60 text-xs space-y-1.5">
                      {(me as any)?.full_name && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Student:</span>
                          <span className="font-semibold text-foreground">
                            {(me as any).full_name}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Index Number:</span>
                        <span className="font-mono font-semibold text-foreground">{index}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Verified Email:</span>
                        <span className="font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1">
                          <CheckCircle2 className="size-3.5" /> {email}
                        </span>
                      </div>
                    </div>

                    <form onSubmit={handleCreatePassword} className="space-y-3.5">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-semibold">Create Password</Label>
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                          >
                            {showPassword ? (
                              <EyeOff className="size-3" />
                            ) : (
                              <Eye className="size-3" />
                            )}
                            {showPassword ? "Hide" : "Show"}
                          </button>
                        </div>
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="At least 6 characters"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          minLength={6}
                          required
                          autoFocus
                          className="h-10"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Confirm Password</Label>
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Re-enter password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          minLength={6}
                          required
                          className="h-10"
                        />
                      </div>

                      <Button
                        type="submit"
                        className="w-full h-11 bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition shadow-sm"
                        disabled={busy}
                      >
                        {busy ? (
                          <span className="flex items-center gap-2">
                            <RefreshCw className="size-4 animate-spin" /> Saving Password...
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <Lock className="size-4" /> Save Password & Enter Portal
                          </span>
                        )}
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full text-xs"
                        onClick={() => {
                          setStep("index");
                          setPassword("");
                          setConfirmPassword("");
                        }}
                      >
                        Back to index verification
                      </Button>
                    </form>
                  </CardContent>
                </>
              )}

              {step === "login" && (
                <>
                  <CardHeader className="text-center pb-3">
                    <div className="mx-auto size-12 rounded-full bg-primary/10 text-primary grid place-items-center mb-2">
                      <ShieldCheck className="size-6" />
                    </div>
                    <CardTitle className="text-xl font-bold">Sign In to Student Portal</CardTitle>
                    <CardDescription className="text-xs">
                      Enter your university index number and password to access your dashboard.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <form onSubmit={handleLoginSubmit} className="space-y-3.5">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Student Index Number</Label>
                        <Input
                          placeholder="e.g. 1029485"
                          value={index}
                          onChange={(e) => setIndex(e.target.value)}
                          required
                          autoFocus={!index}
                          className="h-10 font-mono text-sm uppercase tracking-wide"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-semibold">Password</Label>
                          <button
                            type="button"
                            onClick={() => {
                              setPassword("");
                              setConfirmPassword("");
                              setStep("reset");
                            }}
                            className="text-xs text-primary hover:underline font-medium"
                          >
                            Forgot password?
                          </button>
                        </div>
                        <div className="relative">
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoFocus={!!index}
                            required
                            className="h-10 pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showPassword ? (
                              <EyeOff className="size-4" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      <Button
                        type="submit"
                        className="w-full h-11 bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition shadow-sm cursor-pointer"
                        disabled={busy}
                      >
                        {busy ? (
                          <span className="flex items-center gap-2">
                            <RefreshCw className="size-4 animate-spin" /> Signing In...
                          </span>
                        ) : (
                          "Sign In to Portal"
                        )}
                      </Button>

                      <div className="pt-1 text-center space-y-1">
                        <p className="text-xs text-muted-foreground">
                          First time logging in?{" "}
                          <button
                            type="button"
                            onClick={() => setStep("index")}
                            className="text-primary font-semibold hover:underline"
                          >
                            Set Password First
                          </button>
                        </p>
                      </div>
                    </form>
                  </CardContent>
                </>
              )}

              {step === "reset" && (
                <>
                  <CardHeader className="text-center pb-4">
                    <div className="mx-auto size-12 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-500/20 grid place-items-center mb-2">
                      <RefreshCw className="size-6" />
                    </div>
                    <CardTitle className="text-xl font-bold">Reset Student Password</CardTitle>
                    <CardDescription className="text-xs max-w-sm mx-auto">
                      Provide your registered student email and index number to set a new password.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <form onSubmit={handleResetPassword} className="space-y-3.5">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Student Index Number</Label>
                        <Input
                          placeholder="e.g. 1029485"
                          value={index}
                          onChange={(e) => setIndex(e.target.value)}
                          required
                          autoFocus={!index}
                          className="h-10 font-mono text-sm uppercase tracking-wide"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Registered Email Address</Label>
                        <Input
                          type="email"
                          placeholder="your.email@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          autoFocus={!!index}
                          className="h-10 text-sm"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Must match the registered email for this student index number.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-semibold">
                            New Password (min 6 chars)
                          </Label>
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                          >
                            {showPassword ? (
                              <EyeOff className="size-3" />
                            ) : (
                              <Eye className="size-3" />
                            )}
                            {showPassword ? "Hide" : "Show"}
                          </button>
                        </div>
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          minLength={6}
                          required
                          className="h-10"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Confirm New Password</Label>
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          minLength={6}
                          required
                          className="h-10"
                        />
                      </div>

                      <Button
                        type="submit"
                        className="w-full h-11 bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition cursor-pointer"
                        disabled={busy}
                      >
                        {busy ? "Verifying & Resetting..." : "Reset Password & Sign In"}
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full text-xs"
                        onClick={() => {
                          setStep("login");
                          setPassword("");
                          setConfirmPassword("");
                        }}
                      >
                        Back to sign in
                      </Button>
                    </form>
                  </CardContent>
                </>
              )}
            </Card>
          </div>
        ) : (
          /* ========================================================================= */
          /* AUTHENTICATED STUDENT PORTAL DASHBOARD                                     */
          /* ========================================================================= */
          <div className="space-y-6">
            {/* Student Header Card */}
            <Card className="border shadow-xs overflow-hidden">
              <div className="bg-gradient-to-r from-black via-blue-950 to-blue-900 p-4 sm:p-6 text-white">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-white/20 text-white hover:bg-white/30 border-none text-[11px] font-mono">
                        {me.index_number}
                      </Badge>
                      <Badge className="bg-blue-600 text-white border-none text-[11px]">
                        Verified Student
                      </Badge>
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                      {me.full_name}
                    </h1>
                    <p className="text-xs text-white/80">
                      {me.program || "Undergraduate Program"} · Level {me.level || "200"}
                      {me.email && ` · ${me.email}`}
                    </p>
                  </div>

                  {/* Attendance Grade Stat Box */}
                  <div className="bg-white/10 backdrop-blur-xs rounded-xl p-3 sm:p-4 border border-white/15 w-full sm:w-auto sm:min-w-[200px] text-left sm:text-right">
                    <div className="text-xs text-white/75 font-medium">Running Attendance</div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-white mt-0.5">
                      {overallPercentage}%
                    </div>
                    <div className="flex items-center sm:justify-end gap-1.5 mt-1 text-xs">
                      <span className="text-white/80">
                        {totalAttendedSessions} of {totalHeldSessions} sessions attended
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-white/15">
                  <div className="flex justify-between items-center text-xs text-white/80 mb-1.5">
                    <span>Overall Semester Standing</span>
                    <span className="font-semibold">
                      {calculateAttendanceGrade(overallPercentage).label} Grade
                    </span>
                  </div>
                  <Progress value={overallPercentage} className="h-2 bg-white/20" />
                </div>
              </div>
            </Card>

            {/* Attendance Risk Banner (If applicable) */}
            {atRiskCourses.length > 0 && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:p-5 flex items-start gap-3.5 text-destructive animate-in fade-in">
                <AlertTriangle className="size-5 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs sm:text-sm">
                  <div className="font-bold text-destructive flex items-center gap-2">
                    Attendance Risk Warning — Exam Eligibility at Risk
                  </div>
                  <p className="text-destructive/90 leading-relaxed">
                    You have fallen below the mandatory <b>75% attendance cutoff</b> in:{" "}
                    <b>
                      {atRiskCourses
                        .map((c) => `${c.code} (${c.percentage}% - Missed ${c.missed} sessions)`)
                        .join(", ")}
                    </b>
                    . University regulations require minimum 75% attendance to sit for final
                    examinations. Please ensure you attend all remaining sessions.
                  </p>
                </div>
              </div>
            )}

            {warningCourses.length > 0 && atRiskCourses.length === 0 && (
              <div className="rounded-xl border border-blue-300 bg-blue-50/80 dark:bg-blue-950/40 dark:border-blue-800 p-4 sm:p-5 flex items-start gap-3.5 text-blue-950 dark:text-blue-200 animate-in fade-in">
                <AlertCircle className="size-5 shrink-0 mt-0.5 text-blue-700 dark:text-blue-400" />
                <div className="space-y-1 text-xs sm:text-sm">
                  <div className="font-bold text-blue-950 dark:text-blue-100">
                    Attendance Caution
                  </div>
                  <p className="text-blue-900/90 dark:text-blue-200/90 leading-relaxed">
                    You have missed 3 or more sessions in:{" "}
                    <b>{warningCourses.map((c) => `${c.code} (${c.missed} missed)`).join(", ")}</b>.
                    Maintain regular attendance to keep your standing safe.
                  </p>
                </div>
              </div>
            )}

            {/* Multi-Lecturer Course & Faculty Filter Bar */}
            {courses.length > 0 && (
              <div className="rounded-xl border bg-card p-3 sm:p-3.5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Filter className="size-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-foreground block">
                      Multi-Lecturer & Course Scope
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {courses.length} enrolled courses across{" "}
                      <span className="font-semibold text-foreground">
                        {uniqueLecturers.length} lecturer{uniqueLecturers.length === 1 ? "" : "s"}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                  <select
                    id="student-course-lecturer-filter"
                    value={selectedCourseFilter}
                    onChange={(e) => setSelectedCourseFilter(e.target.value)}
                    className="text-xs bg-background border rounded-lg px-3 py-2 font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-full sm:w-auto"
                  >
                    <option value="all">All Courses & Lecturers ({courses.length})</option>
                    {courses.map((c) => (
                      <option key={c.course_id} value={c.course_id}>
                        {c.code} — {c.title}{" "}
                        {c.lecturer_name ? `(Lecturer: ${c.lecturer_name})` : ""}
                      </option>
                    ))}
                  </select>
                  {selectedCourseFilter !== "all" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedCourseFilter("all")}
                      className="text-xs h-8 px-2.5 text-muted-foreground hover:text-foreground w-full sm:w-auto"
                    >
                      Reset Filter
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Push Notification Screen Alert Prompt Banner */}
            {pushPermission !== "granted" && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm animate-in fade-in">
                <div className="flex items-start gap-3">
                  <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                    <BellRing className="size-4" />
                  </div>
                  <div>
                    <span className="font-bold text-foreground block">
                      Enable Phone Lockscreen Notifications
                    </span>
                    <span className="text-muted-foreground text-xs leading-relaxed">
                      Receive attendance check-in calls, lecturer announcements, and assignment
                      deadlines directly on your phone screen even when this webapp is closed.
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    onClick={handleEnablePush}
                    disabled={enablingPush}
                    className="text-xs h-8 gap-1.5 font-semibold bg-primary text-primary-foreground shadow-xs cursor-pointer"
                  >
                    <Smartphone className="size-3.5" />
                    {enablingPush ? "Enabling..." : "Turn On Alerts"}
                  </Button>
                </div>
              </div>
            )}

            {/* Navigation Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <div className="overflow-x-auto pb-1 -mx-3 px-3 sm:mx-0 sm:px-0 sm:overflow-visible">
                <TabsList className="inline-flex sm:grid sm:grid-cols-4 lg:grid-cols-8 h-auto p-1 bg-muted/60 rounded-xl gap-1 min-w-max sm:min-w-full">
                  <TabsTrigger
                    value="attendance"
                    className="text-xs py-2 data-[state=active]:bg-card data-[state=active]:shadow-xs gap-1.5 whitespace-nowrap"
                  >
                    <CalendarCheck className="size-3.5" />
                    Attendance
                  </TabsTrigger>
                  <TabsTrigger
                    value="records"
                    className="text-xs py-2 data-[state=active]:bg-card data-[state=active]:shadow-xs gap-1.5 whitespace-nowrap"
                  >
                    <FileText className="size-3.5" />
                    Personal Records
                  </TabsTrigger>
                  <TabsTrigger
                    value="courses"
                    className="text-xs py-2 data-[state=active]:bg-card data-[state=active]:shadow-xs gap-1.5 whitespace-nowrap"
                  >
                    <BookOpen className="size-3.5" />
                    Courses ({courses.length})
                  </TabsTrigger>
                  <TabsTrigger
                    value="announcements"
                    className="text-xs py-2 data-[state=active]:bg-card data-[state=active]:shadow-xs gap-1.5 whitespace-nowrap"
                  >
                    <Megaphone className="size-3.5" />
                    Announcements
                    {announcements.length > 0 && (
                      <span className="size-2 rounded-full bg-primary ml-0.5" />
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="assignments"
                    className="text-xs py-2 data-[state=active]:bg-card data-[state=active]:shadow-xs gap-1.5 whitespace-nowrap"
                  >
                    <ClipboardList className="size-3.5" />
                    Assignments
                    {assignments.length > 0 && (
                      <span className="size-2 rounded-full bg-primary ml-0.5" />
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="notifications"
                    className="text-xs py-2 data-[state=active]:bg-card data-[state=active]:shadow-xs gap-1.5 whitespace-nowrap relative"
                  >
                    <BellRing className="size-3.5" />
                    Notifications
                    {unreadNotifCount > 0 ? (
                      <Badge
                        variant="destructive"
                        className="h-4 px-1.5 text-[10px] ml-0.5 rounded-full font-bold"
                      >
                        {unreadNotifCount}
                      </Badge>
                    ) : (
                      notifications.length > 0 && (
                        <span className="text-[10px] text-muted-foreground ml-0.5">
                          ({notifications.length})
                        </span>
                      )
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="qr"
                    className="text-xs py-2 data-[state=active]:bg-card data-[state=active]:shadow-xs gap-1.5 whitespace-nowrap"
                  >
                    <QrCode className="size-3.5" />
                    My QR Pass
                  </TabsTrigger>
                  <TabsTrigger
                    value="settings"
                    className="text-xs py-2 data-[state=active]:bg-card data-[state=active]:shadow-xs gap-1.5 whitespace-nowrap"
                  >
                    <KeyRound className="size-3.5" />
                    Settings
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* TAB 1: ATTENDANCE RECORD (CORE PER-COURSE METRICS)             */}
              {/* ------------------------------------------------------------- */}
              <TabsContent value="attendance" className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  {filteredCourses.length === 0 ? (
                    <Card className="sm:col-span-2 p-8 text-center text-muted-foreground">
                      <GraduationCap className="size-8 mx-auto mb-2 opacity-40" />
                      <p className="font-semibold">
                        {selectedCourseFilter === "all"
                          ? "No registered courses found"
                          : "No matching course found for this filter"}
                      </p>
                      <p className="text-xs mt-1">
                        When your lecturers add you to course rosters, your attendance records will
                        appear here.
                      </p>
                    </Card>
                  ) : (
                    filteredCourses.map((course) => {
                      const isPassing = course.percentage >= 75;
                      return (
                        <Card
                          key={course.course_id}
                          className={`border transition shadow-xs ${
                            course.risk_level === "critical"
                              ? "border-destructive/40 bg-destructive/5"
                              : "border-border/80 hover:border-primary/40"
                          }`}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="outline" className="font-mono text-xs font-bold">
                                    {course.code}
                                  </Badge>
                                  {course.level && (
                                    <Badge
                                      variant="secondary"
                                      className="font-semibold text-[11px] bg-primary/10 text-primary"
                                    >
                                      {course.level.toUpperCase().startsWith("L")
                                        ? course.level
                                        : `L${course.level}`}
                                    </Badge>
                                  )}
                                  <span className="text-xs text-muted-foreground">
                                    {course.department ? `${course.department} · ` : ""}
                                    {course.semester || "Semester"} · {course.credit_hours} credits
                                  </span>
                                </div>
                                <CardTitle className="text-base font-bold text-foreground">
                                  {course.title}
                                </CardTitle>
                                {course.lecturer_name && (
                                  <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                                    <User className="size-3.5 shrink-0" />
                                    <span>Lecturer: {course.lecturer_name}</span>
                                    {course.lecturer_email && (
                                      <a
                                        href={`mailto:${course.lecturer_email}`}
                                        className="text-muted-foreground hover:text-primary transition"
                                        title={`Contact ${course.lecturer_email}`}
                                      >
                                        <Mail className="size-3 ml-0.5" />
                                      </a>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="text-right shrink-0">
                                <div
                                  className={`text-2xl font-black ${
                                    isPassing
                                      ? "text-blue-600 dark:text-blue-400"
                                      : "text-destructive"
                                  }`}
                                >
                                  {course.percentage}%
                                </div>
                                <Badge
                                  variant={isPassing ? "secondary" : "destructive"}
                                  className="text-[10px]"
                                >
                                  {isPassing ? "Eligible" : "At Risk (<75%)"}
                                </Badge>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3 pt-0">
                            {/* Running progress bar */}
                            <Progress
                              value={course.percentage}
                              className={`h-2 ${!isPassing ? "bg-destructive/20" : ""}`}
                            />

                            {/* Attended, Missed, Late metrics */}
                            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                              <div className="p-2 rounded-lg bg-blue-50 border border-blue-100 dark:bg-blue-950/40 dark:border-blue-900">
                                <div className="text-xs text-blue-800 dark:text-blue-300 font-medium">
                                  Attended
                                </div>
                                <div className="text-lg font-bold text-blue-700 dark:text-blue-400">
                                  {course.attended}
                                </div>
                              </div>
                              <div className="p-2 rounded-lg bg-black/5 border border-black/10 dark:bg-white/5 dark:border-white/10">
                                <div className="text-xs text-muted-foreground font-medium">
                                  Missed
                                </div>
                                <div className="text-lg font-bold text-foreground">
                                  {course.missed}
                                </div>
                              </div>
                              <div className="p-2 rounded-lg bg-blue-100/60 border border-blue-200 dark:bg-blue-950/60 dark:border-blue-800">
                                <div className="text-xs text-blue-900 dark:text-blue-200 font-medium">
                                  Late
                                </div>
                                <div className="text-lg font-bold text-blue-800 dark:text-blue-300">
                                  {course.late}
                                </div>
                              </div>
                            </div>

                            <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1">
                              <span>Total Sessions Held: {course.sessions_total}</span>
                              <span className="font-medium">{course.risk_message}</span>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>

                {/* Session-by-Session History Log */}
                <Card className="border shadow-xs">
                  <CardHeader className="pb-3 border-b">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Clock className="size-4 text-primary" />
                      Session Attendance History
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Timestamped log of sessions scanned and recorded.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {filteredHistory.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No individual attendance check-ins logged yet.
                      </div>
                    ) : (
                      <div className="divide-y">
                        {filteredHistory.map((record) => {
                          const isLate = record.status === "LATE";
                          const isPresent =
                            record.status === "PRESENT" || record.status === "ON_TIME";
                          return (
                            <div
                              key={record.id}
                              className="px-4 py-3 flex items-center justify-between gap-3 text-xs sm:text-sm hover:bg-muted/30 transition"
                            >
                              <div className="space-y-0.5 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold font-mono text-primary">
                                    {record.course_code || "CLASS"}
                                  </span>
                                  <span className="text-foreground font-medium truncate">
                                    {record.session_title || record.course_title}
                                  </span>
                                  {record.lecturer_name && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] text-muted-foreground"
                                    >
                                      Lecturer: {record.lecturer_name}
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                                  <span>{record.session_date}</span>
                                  {record.check_in_at && (
                                    <span>
                                      · {new Date(record.check_in_at).toLocaleTimeString()}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <Badge
                                variant={isPresent ? "default" : isLate ? "secondary" : "outline"}
                                className={`text-[11px] font-mono shrink-0 ${
                                  isPresent
                                    ? "bg-blue-600 text-white"
                                    : isLate
                                      ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                                      : ""
                                }`}
                              >
                                {record.status}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ------------------------------------------------------------- */}
              {/* TAB: PERSONAL & MULTI-LECTURER ACADEMIC RECORDS               */}
              {/* ------------------------------------------------------------- */}
              <TabsContent value="records" className="space-y-5">
                {/* Academic Identity & Stats */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Card className="p-4 border shadow-xs space-y-1">
                    <span className="text-xs text-muted-foreground font-medium">Student Index</span>
                    <div className="font-mono text-lg font-bold text-primary">
                      {me.index_number}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      Verified Student Record
                    </span>
                  </Card>
                  <Card className="p-4 border shadow-xs space-y-1">
                    <span className="text-xs text-muted-foreground font-medium">
                      Enrolled Courses
                    </span>
                    <div className="text-lg font-bold text-foreground">
                      {courses.length} Active Courses
                    </div>
                    <span className="text-[11px] text-muted-foreground">Across all semesters</span>
                  </Card>
                  <Card className="p-4 border shadow-xs space-y-1">
                    <span className="text-xs text-muted-foreground font-medium">
                      Assigned Lecturers
                    </span>
                    <div className="text-lg font-bold text-foreground">
                      {uniqueLecturers.length} Faculty Member
                      {uniqueLecturers.length === 1 ? "" : "s"}
                    </div>
                    <span className="text-[11px] text-muted-foreground">Instructors on record</span>
                  </Card>
                  <Card className="p-4 border shadow-xs space-y-1">
                    <span className="text-xs text-muted-foreground font-medium">
                      Overall Attendance
                    </span>
                    <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      {overallPercentage}% Average
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {calculateAttendanceGrade(overallPercentage).label} Eligibility Standing
                    </span>
                  </Card>
                </div>

                {/* Comprehensive Multi-Lecturer Course Breakdown Table */}
                <Card className="border shadow-xs overflow-hidden">
                  <CardHeader className="pb-3 border-b bg-muted/20">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-base font-bold flex items-center gap-2">
                          <BookCheck className="size-4 text-primary" />
                          Multi-Lecturer Academic Record & Course Standing
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Complete consolidated overview of all courses assigned to you by your
                          lecturers.
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className="w-fit text-xs font-mono">
                        {courses.length} Course{courses.length === 1 ? "" : "s"} Total
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {courses.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No course records found across any lecturers.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-muted/40 text-muted-foreground border-b uppercase text-[10px] font-semibold tracking-wider">
                            <tr>
                              <th className="px-4 py-3">Course</th>
                              <th className="px-4 py-3">Assigned Lecturer</th>
                              <th className="px-4 py-3">Credits & Term</th>
                              <th className="px-4 py-3 text-center">Sessions (Held/Attended)</th>
                              <th className="px-4 py-3 text-center">Attendance %</th>
                              <th className="px-4 py-3 text-right">Exam Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {courses.map((c) => {
                              const isPassing = c.percentage >= 75;
                              return (
                                <tr key={c.course_id} className="hover:bg-muted/25 transition">
                                  <td className="px-4 py-3 font-medium">
                                    <div className="font-mono font-bold text-primary">{c.code}</div>
                                    <div className="text-foreground text-xs">{c.title}</div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="font-semibold text-foreground">
                                      {c.lecturer_name || "Academic Department"}
                                    </div>
                                    {c.lecturer_email && (
                                      <a
                                        href={`mailto:${c.lecturer_email}`}
                                        className="text-[11px] text-muted-foreground hover:text-primary transition flex items-center gap-1"
                                      >
                                        <Mail className="size-2.5" />
                                        {c.lecturer_email}
                                      </a>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-muted-foreground">
                                    <div>{c.credit_hours} Credit Hours</div>
                                    <div className="text-[11px]">{c.semester}</div>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <span className="font-semibold text-foreground">
                                      {c.attended}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {" "}
                                      / {c.sessions_total}
                                    </span>
                                    <div className="text-[10px] text-muted-foreground">
                                      {c.missed} missed · {c.late} late
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <div
                                      className={`font-extrabold text-sm ${
                                        isPassing
                                          ? "text-blue-600 dark:text-blue-400"
                                          : "text-destructive"
                                      }`}
                                    >
                                      {c.percentage}%
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <Badge
                                      variant={isPassing ? "default" : "destructive"}
                                      className="text-[10px]"
                                    >
                                      {isPassing ? "Eligible" : "At Risk"}
                                    </Badge>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Assigned Faculty Summary Cards */}
                {uniqueLecturers.length > 0 && (
                  <Card className="border shadow-xs">
                    <CardHeader className="pb-3 border-b">
                      <CardTitle className="text-base font-bold flex items-center gap-2">
                        <School className="size-4 text-primary" />
                        My Assigned Lecturers & Instructors
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Direct instructors managing your registered courses.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {uniqueLecturers.map((lec, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-lg border bg-muted/30 space-y-1.5 hover:bg-muted/50 transition text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <div className="size-7 rounded-full bg-primary/10 text-primary grid place-items-center font-bold text-xs">
                                {lec.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-bold text-foreground truncate">{lec.name}</span>
                            </div>
                            {lec.email && (
                              <a
                                href={`mailto:${lec.email}`}
                                className="text-[11px] text-primary hover:underline flex items-center gap-1 truncate"
                              >
                                <Mail className="size-3" />
                                {lec.email}
                              </a>
                            )}
                            <div className="pt-1 flex items-center gap-1 flex-wrap">
                              <span className="text-[10px] text-muted-foreground">Courses:</span>
                              {lec.courses.map((code) => (
                                <Badge
                                  key={code}
                                  variant="secondary"
                                  className="text-[10px] font-mono py-0"
                                >
                                  {code}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* ------------------------------------------------------------- */}
              {/* TAB 2: MY DIGITAL ATTENDANCE QR CODE PASS                     */}
              {/* ------------------------------------------------------------- */}
              <TabsContent value="qr" className="space-y-4">
                <Card className="border-primary/20 shadow-sm">
                  <CardHeader className="text-center pb-2">
                    <CardTitle className="text-xl font-bold flex items-center justify-center gap-2 text-foreground">
                      <QrCode className="size-5 text-primary" />
                      Official Student Attendance QR Pass
                    </CardTitle>
                    <CardDescription className="text-xs max-w-md mx-auto">
                      Present this QR code to your lecturer or camera scanner during attendance.
                      Styled with official QRoll branding.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 flex flex-col items-center justify-center space-y-6">
                    {/* QR Code Container styled with brand blue */}
                    <div className="p-4 bg-white rounded-2xl shadow-md border-2 border-blue-900/20 grid place-items-center">
                      {qrUrl ? (
                        <img
                          src={qrUrl}
                          alt={`Attendance QR code for ${me.full_name}`}
                          className="size-56 sm:size-64 object-contain"
                        />
                      ) : (
                        <div className="size-56 sm:size-64 bg-muted animate-pulse rounded-xl" />
                      )}
                    </div>

                    <div className="text-center space-y-1 max-w-sm">
                      <h3 className="text-lg font-bold text-foreground">{me.full_name}</h3>
                      <div className="inline-flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-sm px-3 py-1 font-bold">
                          {me.index_number}
                        </Badge>
                        <Badge className="bg-primary text-primary-foreground text-xs">
                          Level {me.level}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground pt-1">
                        High-contrast optical QR code optimized for projection screens & smartphone
                        cameras.
                      </p>
                    </div>

                    <div className="flex flex-col gap-2.5 items-center justify-center w-full max-w-xs">
                      {qrUrl && (
                        <Button
                          onClick={downloadBrandedBadge}
                          className="w-full h-10 gap-2 font-semibold"
                        >
                          <Download className="size-4" /> Download Official QR Badge
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ------------------------------------------------------------- */}
              {/* TAB 3: ENROLLED COURSES                                       */}
              {/* ------------------------------------------------------------- */}
              <TabsContent value="courses" className="space-y-4">
                <Card className="border shadow-xs">
                  <CardHeader className="pb-3 border-b">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <BookOpen className="size-4 text-primary" />
                      My Enrolled Courses ({filteredCourses.length})
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Official courses you are registered for across your lecturers.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {filteredCourses.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        {selectedCourseFilter === "all"
                          ? "No enrolled courses found for this student record."
                          : "No matching course found for this filter."}
                      </div>
                    ) : (
                      <div className="divide-y">
                        {filteredCourses.map((c) => (
                          <div
                            key={c.course_id}
                            className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/25 transition"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="font-mono text-xs font-bold">
                                  {c.code}
                                </Badge>
                                {c.level && (
                                  <Badge
                                    variant="secondary"
                                    className="font-semibold text-[11px] bg-primary/10 text-primary"
                                  >
                                    {c.level.toUpperCase().startsWith("L")
                                      ? c.level
                                      : `L${c.level}`}
                                  </Badge>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {c.department ? `${c.department} · ` : ""}
                                  {c.semester || "Semester"} · {c.credit_hours} credits
                                </span>
                              </div>
                              <h4 className="font-bold text-sm text-foreground">{c.title}</h4>
                              {c.lecturer_name && (
                                <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                                  <User className="size-3.5 shrink-0" />
                                  <span>Lecturer: {c.lecturer_name}</span>
                                  {c.lecturer_email && (
                                    <a
                                      href={`mailto:${c.lecturer_email}`}
                                      className="text-muted-foreground hover:text-primary transition"
                                      title={`Contact ${c.lecturer_email}`}
                                    >
                                      <Mail className="size-3 ml-0.5" />
                                    </a>
                                  )}
                                </div>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {c.sessions_total} total session(s) conducted to date.
                              </p>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <div className="text-right">
                                <div className="text-sm font-bold">{c.percentage}% Attendance</div>
                                <div className="text-xs text-muted-foreground">
                                  {c.attended} Attended · {c.missed} Missed
                                </div>
                              </div>
                              <Badge
                                variant={c.percentage >= 75 ? "default" : "destructive"}
                                className="text-xs"
                              >
                                {c.percentage >= 75 ? "Good Standing" : "Risk"}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ------------------------------------------------------------- */}
              {/* TAB 4: ANNOUNCEMENTS (FILTERED TO ENROLLED COURSES)          */}
              {/* ------------------------------------------------------------- */}
              <TabsContent value="announcements" className="space-y-4">
                <Card className="border shadow-xs">
                  <CardHeader className="pb-3 border-b">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Megaphone className="size-4 text-primary" />
                      Announcements ({filteredAnnouncements.length})
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Notices from your lecturers for your enrolled courses, sorted most recent
                      first.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6 space-y-4">
                    {filteredAnnouncements.length === 0 ? (
                      <div className="text-center py-8 text-xs text-muted-foreground">
                        {selectedCourseFilter === "all"
                          ? "No announcements posted for your enrolled courses yet."
                          : "No announcements found matching this course/lecturer filter."}
                      </div>
                    ) : (
                      filteredAnnouncements.map((notice) => (
                        <div
                          key={notice.id}
                          className="rounded-xl border border-border p-4 space-y-2 bg-card hover:border-primary/30 transition shadow-xs"
                        >
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <h4 className="font-bold text-sm text-foreground">{notice.title}</h4>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {notice.course_code ? (
                                <Badge variant="secondary" className="font-mono text-[10px]">
                                  {notice.course_code}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px]">
                                  General
                                </Badge>
                              )}
                              {notice.lecturer_name && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] text-primary border-primary/20"
                                >
                                  By: {notice.lecturer_name}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <p className="text-xs sm:text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                            {notice.body}
                          </p>
                          <div className="text-[11px] text-muted-foreground/80 pt-1 flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <Clock className="size-3" />
                              {notice.starts_on
                                ? new Date(notice.starts_on).toLocaleDateString(undefined, {
                                    dateStyle: "medium",
                                  })
                                : "Recent"}
                            </div>
                            {notice.lecturer_name && (
                              <span className="text-[10px] text-muted-foreground">
                                Instructor: {notice.lecturer_name}
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ------------------------------------------------------------- */}
              {/* TAB 5: ASSIGNMENTS (SORTED BY UPCOMING DUE DATES)             */}
              {/* ------------------------------------------------------------- */}
              <TabsContent value="assignments" className="space-y-4">
                <Card className="border shadow-xs">
                  <CardHeader className="pb-3 border-b">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <ClipboardList className="size-4 text-primary" />
                      Course Assignments & Deadlines ({filteredAssignments.length})
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Tasks from your instructors for your enrolled courses, sorted with upcoming
                      due dates first.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6 space-y-4">
                    {filteredAssignments.length === 0 ? (
                      <div className="text-center py-8 text-xs text-muted-foreground">
                        {selectedCourseFilter === "all"
                          ? "No assignments listed for your enrolled courses right now."
                          : "No assignments found matching this course/lecturer filter."}
                      </div>
                    ) : (
                      filteredAssignments.map((assign) => {
                        const due = assign.due_at ? new Date(assign.due_at) : null;
                        const isOverdue = due ? due.getTime() < Date.now() : false;
                        return (
                          <div
                            key={assign.id}
                            className={`rounded-xl border p-4 space-y-3 transition shadow-xs ${
                              isOverdue
                                ? "border-muted bg-muted/10 opacity-75"
                                : "border-border bg-card hover:border-primary/40"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  {assign.course_code && (
                                    <Badge
                                      variant="outline"
                                      className="font-mono text-xs font-semibold"
                                    >
                                      {assign.course_code}
                                    </Badge>
                                  )}
                                  {assign.lecturer_name && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] text-primary border-primary/20"
                                    >
                                      Lecturer: {assign.lecturer_name}
                                    </Badge>
                                  )}
                                  <Badge
                                    variant={isOverdue ? "destructive" : "default"}
                                    className="text-[10px]"
                                  >
                                    {due
                                      ? isOverdue
                                        ? "Closed"
                                        : `Due: ${due.toLocaleDateString()} ${due.toLocaleTimeString(
                                            [],
                                            { hour: "2-digit", minute: "2-digit" },
                                          )}`
                                      : "No deadline specified"}
                                  </Badge>
                                </div>
                                <h4 className="font-bold text-sm sm:text-base text-foreground">
                                  {assign.title}
                                </h4>
                              </div>
                            </div>

                            {assign.details && (
                              <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                                {assign.details}
                              </p>
                            )}

                            {assign.submission_url && (
                              <div className="pt-1">
                                <a
                                  href={assign.submission_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline bg-primary/10 px-3 py-1.5 rounded-md"
                                >
                                  <ExternalLink className="size-3.5" /> Submit Assignment Online
                                </a>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ------------------------------------------------------------- */}
              {/* TAB 6: UNIVERSAL QR PASS (ONE CODE FOR ALL COURSES)           */}
              {/* ------------------------------------------------------------- */}
              <TabsContent value="qr" className="space-y-4">
                <Card className="border shadow-xs overflow-hidden max-w-xl mx-auto">
                  <CardHeader className="pb-3 border-b text-center bg-muted/20">
                    <div className="flex items-center justify-center gap-2 mb-1 flex-wrap">
                      <Badge className="bg-primary/10 text-primary border-primary/20 text-xs font-semibold">
                        Universal Student Pass
                      </Badge>
                      <Badge className="bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 text-xs font-semibold">
                        One Code for All Courses
                      </Badge>
                    </div>
                    <CardTitle className="text-xl font-bold flex items-center justify-center gap-2">
                      <QrCode className="size-5 text-primary" />
                      My Universal QR Pass
                    </CardTitle>
                    <CardDescription className="text-xs max-w-md mx-auto">
                      Each student has one unique QR code for all courses. Present this single code
                      to any lecturer to record your attendance.
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="p-6 text-center space-y-4">
                    {qrUrl ? (
                      <div className="p-4 bg-white rounded-2xl shadow-sm border inline-block mx-auto">
                        <img
                          src={qrUrl}
                          alt={`Universal QR Pass for ${me.full_name}`}
                          className="mx-auto size-56 sm:size-64 object-contain"
                        />
                      </div>
                    ) : (
                      <div className="size-56 sm:size-64 bg-muted animate-pulse rounded-2xl mx-auto" />
                    )}

                    <div className="space-y-1">
                      <h3 className="text-lg font-bold text-foreground">{me.full_name}</h3>
                      <div className="font-mono text-sm font-bold bg-primary/10 text-primary px-3 py-1 rounded inline-block">
                        {me.index_number}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Level {me.level || "100"} · {me.program || "Undergraduate Degree"}
                      </p>
                    </div>

                    <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground max-w-md mx-auto text-left space-y-1.5 border">
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        <ShieldCheck className="size-4 text-blue-600 dark:text-blue-400 shrink-0" />
                        Universal QR Code Guarantee
                      </div>
                      <p>
                        You do not need separate QR codes for each course or lecturer. This single
                        code is uniquely tied to your student index number and identifies you across
                        all registered courses, classes, and lecturers.
                      </p>
                    </div>

                    <div className="flex flex-col gap-2.5 pt-2 w-full max-w-xs mx-auto">
                      {qrUrl && (
                        <Button
                          onClick={downloadBrandedBadge}
                          variant="secondary"
                          className="w-full text-xs h-10 gap-2 font-medium"
                        >
                          <Download className="size-3.5" />
                          Save Official Badge (PNG)
                        </Button>
                      )}
                      <Button onClick={printPass} className="w-full text-xs h-10 gap-2 font-medium">
                        <Printer className="size-3.5" />
                        Print Official Pass
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ------------------------------------------------------------- */}
              {/* TAB 7: NOTIFICATION HISTORY & MOBILE SCREEN ALERTS            */}
              {/* ------------------------------------------------------------- */}
              <TabsContent value="notifications" className="space-y-4">
                <Card className="border shadow-xs">
                  <CardHeader className="pb-3 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-bold flex items-center gap-2">
                          <BellRing className="size-4 text-primary" />
                          Student Notifications & Mobile Alerts
                        </CardTitle>
                        {unreadNotifCount > 0 && (
                          <Badge variant="destructive" className="h-5 px-2 text-xs font-semibold">
                            {unreadNotifCount} unread
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs mt-0.5">
                        Official notices, attendance session calls, assignments and urgent class
                        alerts.
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (index && password) void fetchStudentData(index, password);
                        }}
                        className="text-xs h-8 gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="size-3.5" />
                        Refresh
                      </Button>
                      {unreadNotifCount > 0 && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleMarkAllNotifsRead}
                          className="text-xs h-8 gap-1.5 font-medium cursor-pointer"
                        >
                          <Check className="size-3.5" />
                          Mark All Read
                        </Button>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 sm:p-6 space-y-4">
                    {/* Device Push Notification Screen Card */}
                    <div className="p-4 rounded-xl border bg-muted/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div
                          className={`size-9 rounded-lg flex items-center justify-center shrink-0 ${
                            pushPermission === "granted"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400"
                              : "bg-black/10 text-foreground dark:bg-white/10 dark:text-white"
                          }`}
                        >
                          <Smartphone className="size-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-foreground">
                              Mobile Lockscreen & Screen Notifications
                            </span>
                            <Badge
                              variant={pushPermission === "granted" ? "default" : "outline"}
                              className="text-[10px] h-4.5 px-2"
                            >
                              {pushPermission === "granted" ? "Active on Phone" : "Not Enabled"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 max-w-xl leading-relaxed">
                            {pushPermission === "granted"
                              ? "Your device is registered. You will receive notifications directly on your phone screen even when QRoll is closed, provided you have an internet connection."
                              : "Turn on notifications to receive class attendance calls, announcements, and assignment updates directly on your phone screen when the webapp is closed."}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {pushPermission !== "granted" ? (
                          <Button
                            size="sm"
                            onClick={handleEnablePush}
                            disabled={enablingPush}
                            className="text-xs h-8 gap-1.5 font-semibold bg-primary text-primary-foreground cursor-pointer"
                          >
                            <BellRing className="size-3.5" />
                            {enablingPush ? "Enabling..." : "Enable Phone Alerts"}
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleEnablePush}
                            disabled={enablingPush}
                            className="text-xs h-8 gap-1.5 cursor-pointer"
                          >
                            <RefreshCw className="size-3.5" />
                            Sync Device Token
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Filter category tabs */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-2">
                      <span className="text-xs text-muted-foreground mr-1">Filter:</span>
                      {[
                        { id: "ALL", label: `All (${notifications.length})` },
                        {
                          id: "ANNOUNCEMENT",
                          label: `Announcements (${notifications.filter((n) => (n.type || "").toUpperCase() === "ANNOUNCEMENT").length})`,
                        },
                        {
                          id: "ASSIGNMENT",
                          label: `Assignments (${notifications.filter((n) => (n.type || "").toUpperCase() === "ASSIGNMENT").length})`,
                        },
                        {
                          id: "ATTENDANCE",
                          label: `Attendance (${notifications.filter((n) => (n.type || "").toUpperCase() === "ATTENDANCE").length})`,
                        },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setNotifCategoryFilter(tab.id)}
                          className={`text-xs px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                            notifCategoryFilter === tab.id
                              ? "bg-primary text-primary-foreground shadow-xs"
                              : "bg-muted hover:bg-muted/80 text-muted-foreground"
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Notifications List */}
                    {filteredNotifications.length === 0 ? (
                      <div className="py-12 text-center text-muted-foreground">
                        <BellRing className="size-8 mx-auto mb-2 opacity-30" />
                        <p className="font-semibold text-sm">No notifications found</p>
                        <p className="text-xs mt-1 max-w-sm mx-auto">
                          {notifCategoryFilter === "ALL"
                            ? "You're all caught up! New announcements, assignments, and attendance calls will show up here."
                            : "No notifications match this category filter."}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {filteredNotifications.map((notif) => {
                          const isUnread = !notif.isRead && !notif.is_read;
                          const nType = (notif.type || "GENERAL").toUpperCase();
                          return (
                            <div
                              key={notif.id}
                              className={`p-3.5 rounded-xl border transition flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${
                                isUnread
                                  ? "bg-primary/[0.03] border-primary/30"
                                  : "bg-card border-border/80"
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div
                                  className={`size-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                    nType === "ATTENDANCE"
                                      ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                                      : nType === "ANNOUNCEMENT"
                                        ? "bg-blue-200/70 text-blue-900 dark:bg-blue-900/60 dark:text-blue-200"
                                        : nType === "ASSIGNMENT"
                                          ? "bg-blue-50 text-blue-800 border border-blue-300 dark:bg-blue-950/40 dark:text-blue-300"
                                          : "bg-black/5 text-foreground dark:bg-white/10 dark:text-white"
                                  }`}
                                >
                                  {nType === "ATTENDANCE" ? (
                                    <CheckCircle2 className="size-4" />
                                  ) : nType === "ANNOUNCEMENT" ? (
                                    <Megaphone className="size-4" />
                                  ) : nType === "ASSIGNMENT" ? (
                                    <ClipboardList className="size-4" />
                                  ) : (
                                    <BellRing className="size-4" />
                                  )}
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-sm text-foreground">
                                      {notif.title}
                                    </span>
                                    {isUnread && (
                                      <span className="size-2 rounded-full bg-primary inline-block" />
                                    )}
                                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                                      {nType}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground leading-relaxed">
                                    {notif.body}
                                  </p>
                                  <div className="text-[11px] text-muted-foreground/70 flex items-center gap-1.5 pt-0.5">
                                    <Clock className="size-3" />
                                    {notif.createdAt || notif.created_at
                                      ? new Date(
                                          notif.createdAt || notif.created_at!,
                                        ).toLocaleString()
                                      : "Recent"}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                                {isUnread && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleMarkNotifRead(notif.id)}
                                    className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground cursor-pointer"
                                  >
                                    Mark Read
                                  </Button>
                                )}
                                {notif.url && (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                      handleMarkNotifRead(notif.id);
                                      if (notif.url?.includes("tab=announcements")) {
                                        setActiveTab("announcements");
                                      } else if (notif.url?.includes("tab=assignments")) {
                                        setActiveTab("assignments");
                                      } else if (
                                        notif.url?.includes("attendance") ||
                                        notif.url?.includes("check-in")
                                      ) {
                                        if (notif.url.startsWith("/")) {
                                          window.location.href = notif.url;
                                        } else {
                                          setActiveTab("attendance");
                                        }
                                      } else {
                                        window.location.href = notif.url || "/student";
                                      }
                                    }}
                                    className="text-xs h-7 px-2.5 gap-1 font-medium cursor-pointer"
                                  >
                                    <ExternalLink className="size-3" />
                                    View
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ------------------------------------------------------------- */}
              {/* TAB 8: PASSWORD & ACCOUNT SETTINGS                            */}
              {/* ------------------------------------------------------------- */}
              <TabsContent value="settings" className="space-y-4">
                <div className="grid gap-6 sm:grid-cols-2">
                  {/* Change Password Form */}
                  <Card className="border shadow-xs">
                    <CardHeader className="pb-3 border-b">
                      <CardTitle className="text-base font-bold flex items-center gap-2">
                        <KeyRound className="size-4 text-primary" />
                        Change Password
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Update your portal password anytime.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6">
                      <form onSubmit={handleChangePassword} className="space-y-3.5">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">Current Password</Label>
                          <Input
                            type="password"
                            placeholder="Current password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            required
                            className="h-10 text-sm"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">
                            New Password (min 6 chars)
                          </Label>
                          <Input
                            type="password"
                            placeholder="New password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            minLength={6}
                            required
                            className="h-10 text-sm"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">Confirm New Password</Label>
                          <Input
                            type="password"
                            placeholder="Confirm new password"
                            value={confirmNewPassword}
                            onChange={(e) => setConfirmNewPassword(e.target.value)}
                            minLength={6}
                            required
                            className="h-10 text-sm"
                          />
                        </div>

                        <Button
                          type="submit"
                          className="w-full bg-primary text-primary-foreground font-semibold hover:bg-primary/90"
                          disabled={changingPassword}
                        >
                          {changingPassword ? "Updating Password..." : "Update Password"}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>

                  {/* Student Account Summary Card */}
                  <Card className="border shadow-xs">
                    <CardHeader className="pb-3 border-b">
                      <CardTitle className="text-base font-bold flex items-center gap-2">
                        <User className="size-4 text-primary" />
                        Student Account Profile
                      </CardTitle>
                      <CardDescription className="text-xs">
                        University record credentials on file.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6 space-y-4 text-xs sm:text-sm">
                      <div className="space-y-2.5">
                        <div>
                          <div className="text-xs text-muted-foreground">Full Name</div>
                          <div className="font-semibold text-foreground">{me.full_name}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Index Number</div>
                          <div className="font-mono font-bold text-primary">{me.index_number}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Registered Email</div>
                          <div className="font-medium text-foreground">
                            {me.email || "No email on record"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Academic Level</div>
                          <div className="font-medium text-foreground">Level {me.level}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Degree Program</div>
                          <div className="font-medium text-foreground">
                            {me.program || "Not specified"}
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t text-xs text-muted-foreground flex items-center gap-2">
                        <ShieldCheck className="size-4 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span>
                          Protected by student-only authenticated access and PBKDF2 encryption.
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Web Push Notification Settings & Preferences */}
                <div className="mt-6">
                  <NotificationSettingsSection
                    user={{
                      id: me.id,
                      role: "student",
                      indexNumber: me.index_number,
                      email: me.email,
                    }}
                    isAdmin={false}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}
