import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import QRCode from "qrcode";
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, FileText, GraduationCap } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/$token")({
  ssr: false,
  head: () => ({ meta: [{ title: "Student QR Portal — KNUST" }] }),
  component: PortalPage,
});

type Student = { full_name: string; index_number: string; level: string; department: string; qr_uuid: string; pin: string };

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
    const { data, error } = await supabase.rpc("portal_lookup", { _token: token, _index: index.trim(), _email: email.trim() });
    setLoading(false);
    if (error) return toast.error(error.message);
    const row = (data as any[])?.[0];
    if (!row) return toast.error("No match. Check your index number and email.");
    setStudent(row);
    const url = await QRCode.toDataURL(row.qr_uuid, { width: 360, margin: 2, color: { dark: "#006633", light: "#ffffff" } });
    setQrDataUrl(url);
  };

  const downloadPng = () => {
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `${student!.index_number}-qr.png`;
    a.click();
  };
  const downloadPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("KNUST Attendance — Student QR", 105, 25, { align: "center" });
    doc.setFontSize(12);
    doc.text(student!.full_name, 105, 40, { align: "center" });
    doc.text(`Index: ${student!.index_number}`, 105, 48, { align: "center" });
    doc.text(`Level ${student!.level} · ${student!.department}`, 105, 56, { align: "center" });
    doc.addImage(qrDataUrl, "PNG", 65, 68, 80, 80);
    doc.setFontSize(10);
    doc.text("Show this QR to your T.A. or scan the classroom board QR to check in.", 105, 165, { align: "center" });
    doc.text("This QR works for every course and session — past, present and future.", 105, 173, { align: "center" });
    doc.save(`${student!.index_number}-qr.pdf`);
  };

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center p-6">
      <div className="flex items-center gap-2 mb-6 mt-4">
        <GraduationCap className="size-7 text-primary" />
        <h1 className="text-2xl font-bold">KNUST Student QR Portal</h1>
      </div>

      {!student ? (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Get your QR code</CardTitle>
            <CardDescription>Enter your index number and the email you registered with. Your QR works for every course you are enrolled in.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={lookup} className="space-y-3">
              <div><Label>Index number</Label><Input value={index} onChange={(e) => setIndex(e.target.value)} required /></div>
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <Button type="submit" className="w-full" disabled={loading}>{loading ? "Looking up..." : "Show my QR"}</Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{student.full_name}</CardTitle>
            <CardDescription>
              {student.index_number} · Level {student.level} · {student.department}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            {qrDataUrl && <img src={qrDataUrl} alt="Your QR" className="mx-auto rounded-lg border" />}
            <p className="text-xs text-muted-foreground">Save this QR. It is the same QR that works for every course and every session (past, present and future).</p>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={downloadPng} variant="outline"><Download className="size-4 mr-1" />PNG</Button>
              <Button onClick={downloadPdf}><FileText className="size-4 mr-1" />PDF</Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={() => { setStudent(null); setIndex(""); setEmail(""); }}>Look up another</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
