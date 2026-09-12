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
import { ArrowLeft, Download, UserPlus } from "lucide-react";
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanIndex = index.trim().toUpperCase();
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim();

    if (!cleanIndex || !cleanName) {
      return toast.error("Full name and index number are required");
    }

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

      // 2. Look up student by index number (optionally scoped to portal owner if available)
      const studQuery = portalOwnerId
        ? query(
            collection(firestoreDb, "students"),
            where("owner_id", "==", portalOwnerId),
            where("index_number", "==", cleanIndex),
          )
        : query(collection(firestoreDb, "students"), where("index_number", "==", cleanIndex));
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
        // Student already exists
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
          ...(portalOwnerId && !sData.owner_id ? { owner_id: portalOwnerId } : {}),
          ...(cleanEmail && !sData.email ? { email: cleanEmail } : {}),
          ...(level ? { level: Number(level) || 100 } : {}),
          ...(departmentId ? { department_id: departmentId } : {}),
          ...(program ? { program: program.trim() } : {}),
          updated_at: new Date().toISOString(),
        });
      } else {
        // Enforce max 400 students per class/level
        const targetLevelNum = Number(level) || 100;
        if (portalOwnerId) {
          const countSnap = await getDocs(
            query(
              collection(firestoreDb, "students"),
              where("owner_id", "==", portalOwnerId),
              where("level", "==", targetLevelNum),
            ),
          );
          if (countSnap.size >= 400) {
            setSubmitting(false);
            toast.error(
              `Registration closed: Class Level ${targetLevelNum} has reached its maximum capacity of 400 students.`,
            );
            return;
          }
        }

        // Create new student
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
          ...(portalOwnerId ? { owner_id: portalOwnerId } : {}),
          created_at: new Date().toISOString(),
        });
        studentId = newDoc.id;
      }

      // 3. Register for the course if portal link is associated with a course
      if (courseId) {
        const regSnap = await getDocs(
          query(
            collection(firestoreDb, "course_registrations"),
            where("course_id", "==", courseId),
            where("student_id", "==", studentId),
          ),
        );
        if (regSnap.empty) {
          await addDoc(collection(firestoreDb, "course_registrations"), {
            course_id: courseId,
            student_id: studentId,
            ...(portalOwnerId ? { owner_id: portalOwnerId } : {}),
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
      setQrDataUrl(
        await QRCode.toDataURL(row.qr_uuid, {
          width: 360,
          margin: 2,
          color: { dark: "#1e3a8a", light: "#ffffff" },
        }),
      );
      toast.success(
        row.existed ? "You were already registered — here is your QR." : "Registration complete!",
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
              <form onSubmit={submit} className="space-y-3">
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
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Registering..." : "Generate my QR code"}
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
      </div>
      <PublicFooter />
    </div>
  );
}
