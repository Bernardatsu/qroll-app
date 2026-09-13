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
          color: { dark: "#1e3a8a", light: "#ffffff" },
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

  const downloadPng = () => {
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `${created!.index_number}-qr.png`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <div className="flex-1 flex flex-col items-center p-6">
        <div className="w-full max-w-md mt-4 mb-4">
          <Link to="/portal/$token" params={{ token }}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="size-4 mr-1" />
              Back to portal
            </Button>
          </Link>
        </div>

        {!created ? (
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="size-5 text-primary" /> New student registration
              </CardTitle>
              <CardDescription>
                Register yourself once. You will be added to your class automatically and get your
                personal QR code.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleFormSubmit} className="space-y-3">
                <div>
                  <Label>Full name</Label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. John Doe"
                    required
                  />
                </div>
                <div>
                  <Label>Index number</Label>
                  <Input
                    value={index}
                    onChange={(e) => setIndex(e.target.value)}
                    placeholder="e.g. 20700000"
                    required
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@example.com"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Level</Label>
                    <Select value={level} onValueChange={setLevel} required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
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
                  <div>
                    <Label>Department</Label>
                    <Select value={departmentId} onValueChange={setDepartmentId}>
                      <SelectTrigger>
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
                <div>
                  <Label>Program / Major (optional)</Label>
                  <Input
                    value={program}
                    onChange={(e) => setProgram(e.target.value)}
                    placeholder="e.g. BSc Computer Science"
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

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Checking details..." : "Review & Register"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>{created.full_name}</CardTitle>
              <CardDescription>
                {created.index_number} · Level {created.level} · {created.department}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center p-4 bg-white rounded-lg border">
                <img src={qrDataUrl} alt="Student QR Code" className="size-64" />
              </div>
              <Button onClick={downloadPng} className="w-full">
                <Download className="size-4 mr-1" /> Download PNG
              </Button>
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
