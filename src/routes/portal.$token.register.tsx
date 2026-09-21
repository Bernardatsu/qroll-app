import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { firestoreDb } from "@/integrations/firebase/config";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
} from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Download,
  UserPlus,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { PublicFooter } from "@/components/PublicFooter";
import qrollLogo from "@/assets/qroll-logo.png";

export const Route = createFileRoute("/portal/$token/register")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Student Registration — QRoll" },
      {
        name: "description",
        content:
          "New students register themselves and instantly receive their personal QRoll attendance QR code.",
      },
      { property: "og:title", content: "Student Registration — QRoll" },
      {
        property: "og:description",
        content: "Register once and get your personal attendance QR code.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RegisterPage,
});

type Created = {
  full_name: string;
  index_number: string;
  level: string;
  department: string;
  qr_uuid: string;
  pin: string;
  existed: boolean;
};

function RegisterPage() {
  const { token } = Route.useParams();
  const [levels, setLevels] = useState<string[]>(["100", "200", "300", "400", "500", "600"]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [fullName, setFullName] = useState("");
  const [index, setIndex] = useState("");
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [program, setProgram] = useState("");
  const [loading, setLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmedAccurate, setConfirmedAccurate] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const portalSnap = await getDocs(
          query(
            collection(firestoreDb, "student_portal_links"),
            where("token", "==", token),
            where("is_active", "==", true),
          ),
        );
        if (portalSnap.empty) return;
        const pOwnerId = (portalSnap.docs[0].data() as any)?.owner_id;
        if (!pOwnerId) return;

        const deptSnap = await getDocs(
          query(collection(firestoreDb, "departments"), where("owner_id", "==", pOwnerId)),
        );
        const depts = deptSnap.docs.map((d) => ({
          id: d.id,
          name: (d.data() as any).name,
        }));
        depts.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setDepartments(depts);
      } catch (err) {
        console.error("Failed to load departments", err);
      }
    })();
  }, [token]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanIndex = index.trim().toUpperCase();
    const cleanName = fullName.trim();

    if (!cleanIndex || !cleanName) {
      return toast.error("Full name and index number are required");
    }
    if (!level) {
      return toast.error("Please select your class level");
    }
    // Prompt student to cross-check info in modal
    setConfirmedAccurate(false);
    setShowConfirmModal(true);
  };

  const performRegistration = async () => {
    const cleanIndex = index.trim().toUpperCase();
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim();

    setLoading(true);
    try {
      // 1. Verify portal token
      const portalSnap = await getDocs(
        query(
          collection(firestoreDb, "student_portal_links"),
          where("token", "==", token),
          where("is_active", "==", true),
        ),
      );

      if (portalSnap.empty) {
        throw new Error("Invalid or expired portal link");
      }
      const portalData = portalSnap.docs[0].data() as any;
      const courseId = portalData.course_id;
      const portalOwnerId = portalData.owner_id;

      if (!portalOwnerId) {
        throw new Error("This registration link is missing a valid lecturer association.");
      }

      // 2. Look up student strictly under this lecturer's system
      const studQuery = query(
        collection(firestoreDb, "students"),
        where("owner_id", "==", portalOwnerId),
        where("index_number", "==", cleanIndex),
      );
      const studSnap = await getDocs(studQuery);

      let studentId: string;
      let qrUuid: string;
      let existed = false;
      let deptName = program.trim() || "General";

      if (departmentId) {
        const found = departments.find((d) => d.id === departmentId);
        if (found) deptName = found.name;
      }

      if (!studSnap.empty) {
        // Student already exists under this lecturer
        existed = true;
        const studDoc = studSnap.docs[0];
        studentId = studDoc.id;
        const sData = studDoc.data() as any;
        qrUuid =
          sData.qr_uuid ||
          (typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : Math.random().toString(36).substring(2, 18));

        await updateDoc(doc(firestoreDb, "students", studentId), {
          qr_uuid: qrUuid,
          owner_id: portalOwnerId,
          ...(cleanEmail && !sData.email ? { email: cleanEmail } : {}),
          ...(level ? { level: Number(level) || 100 } : {}),
          ...(departmentId ? { department_id: departmentId } : {}),
          ...(program ? { program: program.trim() } : {}),
          updated_at: new Date().toISOString(),
        });
      } else {
        // Enforce max 400 students per class/level for this lecturer
        const targetLevelNum = Number(level) || 100;
        const countSnap = await getDocs(
          query(
            collection(firestoreDb, "students"),
            where("owner_id", "==", portalOwnerId),
            where("level", "==", targetLevelNum),
          ),
        );
        if (countSnap.size >= 400) {
          setLoading(false);
          toast.error(
            `Registration closed: Class Level ${targetLevelNum} has reached its maximum capacity of 400 students.`,
          );
          return;
        }

        // Create new student strictly tied to this lecturer's account
        qrUuid =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : Math.random().toString(36).substring(2, 18);

        const newDoc = await addDoc(collection(firestoreDb, "students"), {
          full_name: cleanName,
          index_number: cleanIndex,
          email: cleanEmail || null,
          level: Number(level) || 100,
          department_id: departmentId || null,
          program: program.trim() || null,
          qr_uuid: qrUuid,
          owner_id: portalOwnerId,
          created_at: new Date().toISOString(),
        });
        studentId = newDoc.id;
      }

      // 3. Register for the course if portal link is associated with a specific course
      if (courseId) {
        const regSnap = await getDocs(
          query(
            collection(firestoreDb, "course_registrations"),
            where("owner_id", "==", portalOwnerId),
            where("course_id", "==", courseId),
            where("student_id", "==", studentId),
          ),
        );
        if (regSnap.empty) {
          await addDoc(collection(firestoreDb, "course_registrations"), {
            course_id: courseId,
            student_id: studentId,
            owner_id: portalOwnerId,
            created_at: new Date().toISOString(),
          });
        }
      }

      const row: Created = {
        full_name: cleanName,
        index_number: cleanIndex,
        level: level || "100",
        department: deptName,
        qr_uuid: qrUuid,
        pin: "",
        existed,
      };

      setCreated(row);
      setShowConfirmModal(false);
      setQrDataUrl(
        await QRCode.toDataURL(row.qr_uuid, {
          width: 360,
          margin: 2,
          color: { dark: "#064e3b", light: "#ffffff" },
        }),
      );
      toast.success(
        row.existed
          ? "You were already in this lecturer's system — here is your QR."
          : "Registration complete! You are now added to your lecturer's class.",
      );
    } catch (err: any) {
      toast.error(err?.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const downloadPng = async () => {
    if (!created || !qrDataUrl) return;
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
      ctx.fillText(created.full_name, 300, 140);

      ctx.fillStyle = "#064e3b";
      ctx.font = "bold 18px monospace";
      ctx.fillText(`INDEX: ${created.index_number}`, 300, 175);

      ctx.fillStyle = "#64748b";
      ctx.font = "14px sans-serif";
      ctx.fillText(`Level ${created.level} · ${created.department}`, 300, 202);

      // Draw QR Code
      const qrImg = new Image();
      await new Promise((resolve) => {
        qrImg.onload = () => {
          ctx.drawImage(qrImg, 110, 230, 380, 380);
          resolve(true);
        };
        qrImg.onerror = () => resolve(true);
        qrImg.src = qrDataUrl;
      });

      // Footer
      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px sans-serif";
      ctx.fillText("Show this QR to lecturer or scan projector QR to check in", 300, 670);
      ctx.fillText("Powered by QRoll · Verified University System", 300, 695);

      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `QRoll-${created.index_number}-badge.png`;
      a.click();
    } catch {
      const a = document.createElement("a");
      a.href = qrDataUrl;
      a.download = `${created!.index_number}-qr.png`;
      a.click();
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <div className="flex-1 flex flex-col items-center p-3 sm:p-6 w-full max-w-[360px] sm:max-w-md mx-auto">
        <div className="w-full flex items-center justify-between mt-2 mb-4">
          <Link to="/portal/$token" params={{ token }}>
            <Button variant="ghost" size="sm" className="text-xs h-8 px-2">
              <ArrowLeft className="size-3.5 mr-1" />
              Back
            </Button>
          </Link>
          <div className="flex items-center gap-1.5">
            <img src={qrollLogo} alt="QRoll" className="size-6 object-contain" />
            <span className="font-bold text-xs tracking-tight text-foreground">QRoll Portal</span>
          </div>
        </div>

        {!created ? (
          <Card className="w-full shadow-sm">
            <CardHeader className="p-4 sm:p-6 pb-3">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <UserPlus className="size-4 sm:size-5 text-primary" /> New student registration
              </CardTitle>
              <CardDescription className="text-xs">
                Register yourself once. You will be added to your class automatically and get your
                personal QR code.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              <form onSubmit={handleFormSubmit} className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Full name</Label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. John Doe"
                    required
                    className="h-10 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Index number</Label>
                  <Input
                    value={index}
                    onChange={(e) => setIndex(e.target.value)}
                    placeholder="e.g. 20700000"
                    required
                    className="h-10 text-sm font-mono uppercase"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@example.com"
                    required
                    className="h-10 text-sm"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Level</Label>
                    <Select value={level} onValueChange={setLevel} required>
                      <SelectTrigger className="h-10 text-sm">
                        <SelectValue placeholder="Select level" />
                      </SelectTrigger>
                      <SelectContent>
                        {levels.map((l) => (
                          <SelectItem key={l} value={l}>
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Department</Label>
                    <Select value={departmentId} onValueChange={setDepartmentId}>
                      <SelectTrigger className="h-10 text-sm">
                        <SelectValue placeholder="Department" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Program / Major (optional)</Label>
                  <Input
                    value={program}
                    onChange={(e) => setProgram(e.target.value)}
                    placeholder="e.g. BSc Computer Science"
                    className="h-10 text-sm"
                  />
                </div>

                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                  <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div>
                    <span className="font-semibold">⚠️ Attention:</span> Please cross-check all your
                    information carefully before submitting. Your details will be registered
                    strictly into the account of the lecturer who shared this link.
                  </div>
                </div>

                <Button type="submit" className="w-full h-10 font-semibold" disabled={loading}>
                  {loading ? "Checking details..." : "Review & Register"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card className="w-full shadow-sm">
            <CardHeader className="p-4 sm:p-6 text-center">
              <CardTitle className="text-lg font-bold">{created.full_name}</CardTitle>
              <CardDescription className="text-xs">
                {created.index_number} · Level {created.level} · {created.department}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0 space-y-4">
              <div className="flex justify-center p-3 bg-white rounded-xl border shadow-inner">
                <img
                  src={qrDataUrl}
                  alt="Student QR Code"
                  className="size-56 max-w-full object-contain"
                />
              </div>
              <div className="flex flex-col gap-2.5 w-full">
                <Button onClick={downloadPng} className="w-full h-10 font-semibold">
                  <Download className="size-4 mr-2" /> Download Branded Badge (PNG)
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Save this image to your phone gallery. You can show it in any lecture session to
                verify attendance.
              </p>
            </CardContent>
          </Card>
        )}

        <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" />
                Cross-Check Your Information
              </DialogTitle>
              <DialogDescription>
                Please review your details carefully. This information will be saved directly into
                your lecturer's attendance roster and cannot be changed after submission.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Full Name:</span>
                <span className="font-semibold">{fullName.trim()}</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Index Number:</span>
                <span className="font-mono font-bold text-primary">
                  {index.trim().toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Class Level:</span>
                <span className="font-semibold">Level {level}</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Department:</span>
                <span>{departments.find((d) => d.id === departmentId)?.name || "General"}</span>
              </div>
              {program.trim() && (
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Program:</span>
                  <span>{program.trim()}</span>
                </div>
              )}
              {email.trim() && (
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Email:</span>
                  <span>{email.trim()}</span>
                </div>
              )}
            </div>

            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/30 p-2.5 rounded border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="size-4 shrink-0 text-amber-600 mt-0.5" />
              <span>
                Please verify that your <strong>Index Number ({index.trim().toUpperCase()})</strong>{" "}
                and <strong>Level ({level})</strong> are completely accurate.
              </span>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowConfirmModal(false)}
                disabled={loading}
              >
                Edit Information
              </Button>
              <Button type="button" onClick={performRegistration} disabled={loading}>
                <CheckCircle2 className="size-4 mr-1.5" />
                {loading ? "Registering..." : "Confirm & Submit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <PublicFooter />
    </div>
  );
}
