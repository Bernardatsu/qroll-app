import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Download, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { PublicFooter } from "@/components/PublicFooter";

export const Route = createFileRoute("/portal/$token/register")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Student Registration — QRoll" },
      { name: "description", content: "New students register themselves and instantly receive their personal QRoll attendance QR code." },
      { property: "og:title", content: "Student Registration — QRoll" },
      { property: "og:description", content: "Register once and get your personal attendance QR code." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RegisterPage,
});

type Option = { kind: string; id: string | null; name: string };
type Created = { full_name: string; index_number: string; level: string; department: string; qr_uuid: string; pin: string; existed: boolean };

function RegisterPage() {
  const { token } = Route.useParams();
  const [levels, setLevels] = useState<string[]>([]);
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
      const { data, error } = await (supabase as any).rpc("portal_options", { _token: token });
      if (error) return toast.error(error.message);
      const rows = (data ?? []) as Option[];
      const lv = Array.from(new Set(rows.filter((r) => r.kind === "level").map((r) => r.name))).sort();
      setLevels(lv.length ? lv : ["100", "200", "300", "400"]);
      setDepartments(rows.filter((r) => r.kind === "department" && r.id).map((r) => ({ id: r.id as string, name: r.name })));
    })();
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("portal_register", {
      _token: token,
      _full_name: fullName.trim(),
      _index: index.trim(),
      _email: email.trim(),
      _level: level,
      _department_id: departmentId || null,
      _program: program.trim() || null,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    const row = (data as Created[])?.[0];
    if (!row) return toast.error("Registration failed. Please try again.");
    setCreated(row);
    setQrDataUrl(await QRCode.toDataURL(row.qr_uuid, { width: 360, margin: 2, color: { dark: "#12294a", light: "#ffffff" } }));
    toast.success(row.existed ? "You were already registered — here is your QR." : "Registration complete!");
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
            <Button variant="ghost" size="sm"><ArrowLeft className="size-4 mr-1" />Back to portal</Button>
          </Link>
        </div>

        {!created ? (
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><UserPlus className="size-5 text-primary" /> New student registration</CardTitle>
              <CardDescription>Register yourself once. You will be added to your class automatically and get your personal QR code.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-3">
                <div><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} required /></div>
                <div><Label>Index number</Label><Input value={index} onChange={(e) => setIndex(e.target.value)} maxLength={50} required /></div>
                <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} required /></div>
                <div>
                  <Label>Level / class</Label>
                  <Select value={level} onValueChange={setLevel} required>
                    <SelectTrigger><SelectValue placeholder="Select your level" /></SelectTrigger>
                    <SelectContent>
                      {levels.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {departments.length > 0 && (
                  <div>
                    <Label>Department</Label>
                    <Select value={departmentId} onValueChange={setDepartmentId}>
                      <SelectTrigger><SelectValue placeholder="Select your department" /></SelectTrigger>
                      <SelectContent>
                        {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div><Label>Programme (optional)</Label><Input value={program} onChange={(e) => setProgram(e.target.value)} maxLength={120} /></div>
                <Button type="submit" className="w-full" disabled={loading || !level}>{loading ? "Registering..." : "Register me"}</Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>{created.full_name}</CardTitle>
              <CardDescription>{created.index_number} · Level {created.level} · {created.department}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
              {qrDataUrl && <img src={qrDataUrl} alt="Your personal attendance QR code" className="mx-auto rounded-lg border" />}
              <p className="text-xs text-muted-foreground">Save this QR — it works for every course and session. Your PIN is <span className="font-mono font-semibold">{created.pin}</span>.</p>
              <Button onClick={downloadPng} variant="outline" className="w-full"><Download className="size-4 mr-1" />Download QR</Button>
              <Link to="/portal/$token" params={{ token }}>
                <Button variant="ghost" className="w-full">Go to student portal</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
      <PublicFooter />
    </div>
  );
}
