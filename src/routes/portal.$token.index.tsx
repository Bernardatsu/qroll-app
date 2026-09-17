import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import QRCode from "qrcode";
import jsPDF from "jspdf";
import { firestoreDb } from "@/integrations/firebase/config";
import { collection, doc, getDoc, getDocs, query, where, updateDoc } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, FileText, UserPlus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PublicFooter } from "@/components/PublicFooter";
import qrollLogo from "@/assets/qroll-logo.png";
import { getLogoBase64 } from "@/lib/exporters";

export const Route = createFileRoute("/portal/$token/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Student QR Portal — QRoll" }] }),
  component: PortalPage,
});

type Student = {
  full_name: string;
  index_number: string;
  level: string;
  department: string;
  qr_uuid: string;
  pin: string;
};

function PortalPage() {
  const { token } = Route.useParams();
  const [index, setIndex] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [student, setStudent] = useState<Student | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // 1. Verify active portal token
      const portalSnap = await getDocs(
        query(
          collection(firestoreDb, "student_portal_links"),
          where("token", "==", token),
          where("is_active", "==", true),
        ),
      );
      if (portalSnap.empty) {
        toast.error("Invalid or expired portal link.");
        return;
      }
      const portalData = portalSnap.docs[0].data() as any;
      const portalOwnerId = portalData.owner_id;

      // 2. Find student (scoped to portal owner so other accounts' students are invisible)
      const cleanIndex = index.trim().toUpperCase();
      const cleanEmail = email.trim().toLowerCase();
      const studQuery = portalOwnerId
        ? query(
            collection(firestoreDb, "students"),
            where("owner_id", "==", portalOwnerId),
            where("index_number", "==", cleanIndex),
          )
        : query(collection(firestoreDb, "students"), where("index_number", "==", cleanIndex));
      const studSnap = await getDocs(studQuery);

      if (studSnap.empty) {
        toast.error("No match. Check your index number and email.");
        return;
      }

      const studDoc = studSnap.docs[0];
      const sData = studDoc.data() as any;

      if (sData.email && cleanEmail && sData.email.toLowerCase() !== cleanEmail) {
        toast.error("Email does not match our records for this index number.");
        return;
      }

      let qrUuid = sData.qr_uuid;
      if (!qrUuid) {
        qrUuid =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : Math.random().toString(36).substring(2, 18);
        await updateDoc(doc(firestoreDb, "students", studDoc.id), { qr_uuid: qrUuid });
      }

      let deptName = sData.program || "General";
      if (sData.department_id) {
        const deptDoc = await getDoc(doc(firestoreDb, "departments", sData.department_id));
        if (deptDoc.exists()) deptName = (deptDoc.data() as any).name || deptName;
      }

      const row: Student = {
        full_name: sData.full_name || "",
        index_number: sData.index_number || cleanIndex,
        level: sData.level ? String(sData.level) : "100",
        department: deptName,
        qr_uuid: qrUuid,
        pin: sData.pin || "",
      };

      setStudent(row);
      const url = await QRCode.toDataURL(row.qr_uuid, {
        width: 360,
        margin: 2,
        color: { dark: "#1e3a8a", light: "#ffffff" },
      });
      setQrDataUrl(url);
    } catch (err: any) {
      toast.error(err?.message || "Failed to retrieve QR");
    } finally {
      setLoading(false);
    }
  };

  const downloadPng = async () => {
    if (!student || !qrDataUrl) return;
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
      ctx.fillStyle = "#1e3a8a";
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
      ctx.fillText(student.full_name, 300, 140);

      ctx.fillStyle = "#1e3a8a";
      ctx.font = "bold 18px monospace";
      ctx.fillText(`INDEX: ${student.index_number}`, 300, 175);

      ctx.fillStyle = "#64748b";
      ctx.font = "14px sans-serif";
      ctx.fillText(`Level ${student.level} · ${student.department}`, 300, 202);

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
      a.download = `QRoll-${student.index_number}-badge.png`;
      a.click();
    } catch {
      // Fallback
      const a = document.createElement("a");
      a.href = qrDataUrl;
      a.download = `${student.index_number}-qr.png`;
      a.click();
    }
  };

  const downloadPdf = async () => {
    if (!student || !qrDataUrl) return;
    const doc = new jsPDF();
    try {
      const logoData = await getLogoBase64();
      if (logoData) {
        doc.addImage(logoData, "PNG", 20, 15, 18, 18);
      }
    } catch {
      // ignore
    }

    doc.setFontSize(18);
    doc.setTextColor(30, 58, 138);
    doc.text("QRoll — Student QR Pass", 45, 24);
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text("Official Attendance & Identity Pass", 45, 30);

    doc.setDrawColor(226, 232, 240);
    doc.line(20, 36, 190, 36);

    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text(student.full_name, 105, 52, { align: "center" });

    doc.setFontSize(13);
    doc.setTextColor(30, 58, 138);
    doc.text(`Index: ${student.index_number}`, 105, 60, { align: "center" });

    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    doc.text(`Level ${student.level} · ${student.department}`, 105, 68, { align: "center" });

    doc.addImage(qrDataUrl, "PNG", 55, 78, 100, 100);

    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(
      "Present this QR to your lecturer or scan the classroom board QR to check in.",
      105,
      190,
      {
        align: "center",
      },
    );
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text("This QR pass works across all your enrolled courses on QRoll.", 105, 198, {
      align: "center",
    });
    doc.save(`QRoll-${student.index_number}.pdf`);
  };

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <div className="flex-1 flex flex-col items-center p-3 sm:p-6 w-full max-w-[360px] sm:max-w-md mx-auto">
        {/* Header with App Logo */}
        <div className="flex items-center gap-2.5 mb-4 sm:mb-6 mt-2">
          <img src={qrollLogo} alt="QRoll" className="size-8 object-contain" />
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Student QR Portal</h1>
        </div>

        {!student ? (
          <Card className="w-full shadow-sm">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Get your QR code</CardTitle>
              <CardDescription className="text-xs">
                Enter your index number and the email you registered with. Your QR works for every
                course you are enrolled in.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0 space-y-4">
              <form onSubmit={lookup} className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Index number</Label>
                  <Input
                    value={index}
                    onChange={(e) => setIndex(e.target.value)}
                    required
                    className="h-10 font-mono uppercase"
                    placeholder="e.g. 1029485"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-10"
                    placeholder="name@university.edu"
                  />
                </div>
                <Button type="submit" className="w-full h-10 font-semibold" disabled={loading}>
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="size-4 animate-spin" /> Looking up...
                    </span>
                  ) : (
                    "Show my QR"
                  )}
                </Button>
              </form>

              {/* Stacked registration card */}
              <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3.5 text-center text-xs flex flex-col gap-2">
                <p className="text-muted-foreground">New student and not in the system yet?</p>
                <Link to="/portal/$token/register" params={{ token }} className="w-full">
                  <Button variant="outline" className="w-full h-9 text-xs">
                    <UserPlus className="size-3.5 mr-1.5" />
                    Register as a new student
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="w-full shadow-sm">
            <CardHeader className="p-4 sm:p-6 text-center">
              <CardTitle className="text-lg font-bold">{student.full_name}</CardTitle>
              <CardDescription className="text-xs">
                {student.index_number} · Level {student.level} · {student.department}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0 flex flex-col items-center space-y-4">
              <div className="w-full flex justify-center p-3 bg-white rounded-xl border shadow-inner">
                <img src={qrDataUrl} alt="QR Code" className="size-56 max-w-full object-contain" />
              </div>

              {/* Stacked Buttons - Never side-by-side on mobile screens */}
              <div className="flex flex-col gap-2.5 w-full">
                <Button variant="default" onClick={downloadPng} className="w-full h-10 font-medium">
                  <Download className="size-4 mr-2" /> Download PNG Badge
                </Button>
                <Button variant="outline" onClick={downloadPdf} className="w-full h-10 font-medium">
                  <FileText className="size-4 mr-2" /> Download PDF Card
                </Button>
                <Button
                  variant="ghost"
                  className="w-full h-9 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setStudent(null);
                    setIndex("");
                    setEmail("");
                  }}
                >
                  Look up another index
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      <PublicFooter />
    </div>
  );
}
