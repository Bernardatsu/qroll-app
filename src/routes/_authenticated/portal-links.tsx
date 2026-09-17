import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/AppShell";
import { firebaseAuth, firestoreDb } from "@/integrations/firebase/config";
import { useAuth } from "@/lib/auth";
import { collection, doc, getDocs, query, where, addDoc, updateDoc } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Copy,
  ExternalLink,
  Share2,
  RefreshCw,
  QrCode,
  Download,
  Check,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import qrollLogo from "@/assets/qroll-logo.png";

export const Route = createFileRoute("/_authenticated/portal-links")({
  head: () => ({ meta: [{ title: "Student QR Portal — QRoll" }] }),
  component: PortalLinksPage,
});

export function PortalLinksPage() {
  const { user, loading: authLoading } = useAuth();
  const [token, setToken] = useState<string>("");
  const [url, setUrl] = useState<string>("");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const initPortalLink = useCallback(
    async (forceNew = false) => {
      const activeUid = user?.id || firebaseAuth.currentUser?.uid;
      if (!activeUid) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // Find active link owned by this lecturer
        const portalSnap = await getDocs(
          query(
            collection(firestoreDb, "student_portal_links"),
            where("owner_id", "==", activeUid),
          ),
        );
        const existing = portalSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        existing.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

        let row = !forceNew ? existing.find((l) => l.is_active !== false) || existing[0] : null;

        if (!row || forceNew) {
          // If forceNew and old links exist, deactivate them
          if (forceNew && existing.length > 0) {
            for (const oldLink of existing) {
              try {
                await updateDoc(doc(firestoreDb, "student_portal_links", oldLink.id), {
                  is_active: false,
                });
              } catch {
                // ignore
              }
            }
          }

          const generatedToken =
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
              : Math.random().toString(36).substring(2, 18);

          const newDoc = await addDoc(collection(firestoreDb, "student_portal_links"), {
            token: generatedToken,
            is_active: true,
            owner_id: activeUid,
            created_at: new Date().toISOString(),
          });
          row = { id: newDoc.id, token: generatedToken, is_active: true };
        } else if (!row.is_active) {
          await updateDoc(doc(firestoreDb, "student_portal_links", row.id), { is_active: true });
          row.is_active = true;
        }

        setToken(row.token);
        const portalUrl = `${window.location.origin}/portal/${row.token}`;
        setUrl(portalUrl);

        // Generate QR Code
        const qr = await QRCode.toDataURL(portalUrl, {
          width: 320,
          margin: 2,
          color: { dark: "#1e3a8a", light: "#ffffff" },
        });
        setQrDataUrl(qr);
      } catch (err: any) {
        console.error("Portal link initialization error:", err);
        toast.error(err?.message || "Failed to load portal link");
      } finally {
        setLoading(false);
      }
    },
    [user?.id],
  );

  useEffect(() => {
    void initPortalLink();
  }, [initPortalLink]);

  const copy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Student QR portal link copied to clipboard!");
    setTimeout(() => setCopied(false), 2500);
  };

  const handleRegenerate = async () => {
    if (
      !confirm(
        "Are you sure you want to generate a new portal link? The previous link will be deactivated.",
      )
    ) {
      return;
    }
    setRegenerating(true);
    await initPortalLink(true);
    setRegenerating(false);
    toast.success("New portal link generated successfully!");
  };

  const downloadQr = async () => {
    if (!qrDataUrl) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 540;
      canvas.height = 680;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 540, 680);

      // Top brand header
      ctx.fillStyle = "#1e3a8a";
      ctx.fillRect(0, 0, 540, 84);

      // Draw QRoll logo
      const logoImg = new Image();
      logoImg.crossOrigin = "anonymous";
      await new Promise((resolve) => {
        logoImg.onload = () => {
          try {
            ctx.drawImage(logoImg, 24, 18, 48, 48);
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
      ctx.font = "bold 20px sans-serif";
      ctx.fillText("QRoll Student Portal QR", 84, 42);
      ctx.font = "12px sans-serif";
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.fillText("Scan to access course registration & attendance", 84, 62);

      // Draw QR Code
      const qrImg = new Image();
      await new Promise((resolve) => {
        qrImg.onload = () => {
          ctx.drawImage(qrImg, 70, 110, 400, 400);
          resolve(true);
        };
        qrImg.onerror = () => resolve(true);
        qrImg.src = qrDataUrl;
      });

      // Footer info
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Scan with your phone camera to open portal", 270, 540);

      ctx.fillStyle = "#64748b";
      ctx.font = "12px monospace";
      ctx.fillText(url, 270, 570);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "11px sans-serif";
      ctx.fillText("Powered by QRoll Attendance System", 270, 635);

      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `qroll-student-portal-qr.png`;
      a.click();
    } catch {
      const a = document.createElement("a");
      a.href = qrDataUrl;
      a.download = `qroll-student-portal-qr.png`;
      a.click();
    }
  };

  return (
    <AppShell>
      <div className="max-w-xl mx-auto space-y-6 w-full px-1 sm:px-2">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Share2 className="size-5 text-primary shrink-0" /> Student QR Portal
            </h1>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegenerate}
              disabled={loading || regenerating}
              className="text-xs shrink-0"
            >
              <RefreshCw className={`size-3.5 mr-1.5 ${regenerating ? "animate-spin" : ""}`} />
              Regenerate
            </Button>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Share this link or project the QR code in class so students can look up their records
            and retrieve their personal QR passes.
          </p>
        </div>

        {/* Main Stacked Cards - Vertical layout for mobile compatibility */}
        <div className="flex flex-col gap-5 w-full">
          {/* Active Link Card */}
          <Card className="border-border shadow-xs w-full overflow-hidden">
            <CardHeader className="p-4 sm:p-5 pb-3">
              <CardTitle className="text-sm sm:text-base">Active Student Portal Link</CardTitle>
              <CardDescription className="text-xs">
                Students use this link to find their record and download their attendance pass.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0 space-y-3.5">
              {url ? (
                <>
                  {/* Shortened, wrapped link container */}
                  <div className="p-3 rounded-lg border bg-muted/40 font-mono text-xs break-all select-all flex flex-col gap-1 w-full max-w-full overflow-hidden">
                    <span className="text-[10px] uppercase font-sans font-bold text-muted-foreground tracking-wider">
                      Direct Link
                    </span>
                    <span className="text-primary font-medium break-all">{url}</span>
                  </div>

                  {/* Vertical stack of actions - NOT side-by-side on mobile */}
                  <div className="flex flex-col gap-2 w-full">
                    <Button onClick={copy} className="w-full h-10 font-medium">
                      {copied ? (
                        <Check className="size-4 mr-2 text-emerald-300" />
                      ) : (
                        <Copy className="size-4 mr-2" />
                      )}
                      {copied ? "Copied to Clipboard!" : "Copy Portal Link"}
                    </Button>
                    <a href={url} target="_blank" rel="noreferrer" className="w-full">
                      <Button variant="outline" className="w-full h-10 font-medium">
                        <ExternalLink className="size-4 mr-2" /> Open Test Portal
                      </Button>
                    </a>
                  </div>

                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 text-xs space-y-1.5 text-foreground">
                    <div className="font-semibold text-primary flex items-center gap-1.5 text-xs">
                      <ShieldCheck className="size-3.5" /> Portal Protection & Scope
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-muted-foreground text-[11px] leading-relaxed">
                      <li>
                        <b>Multi-Course Support:</b> This link stays active indefinitely for all
                        your courses.
                      </li>
                      <li>
                        <b>Privacy Guaranteed:</b> Only students uploaded to your courses can look
                        themselves up.
                      </li>
                      <li>
                        <b>Token:</b>{" "}
                        <code className="font-mono bg-background px-1 py-0.5 rounded border text-[10px]">
                          {token}
                        </code>
                      </li>
                    </ul>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center space-y-3">
                  <RefreshCw className="size-6 mx-auto animate-spin text-primary" />
                  <p className="text-xs text-muted-foreground">
                    Preparing your secure student portal link...
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* QR Code Card for Class Projection */}
          <Card className="border-border shadow-xs flex flex-col items-center w-full">
            <CardHeader className="text-center p-4 sm:p-5 pb-2 w-full">
              <CardTitle className="text-sm sm:text-base flex items-center justify-center gap-1.5">
                <QrCode className="size-4 text-primary" /> Project In Class
              </CardTitle>
              <CardDescription className="text-xs">
                Display on screen so students can scan directly with their phone camera.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center space-y-3 p-4 pt-0 sm:p-5 sm:pt-0 pb-5 w-full">
              {qrDataUrl ? (
                <>
                  <div className="p-3 bg-white rounded-xl shadow-inner border border-slate-200">
                    <img
                      src={qrDataUrl}
                      alt="Student Portal QR Code"
                      className="size-44 sm:size-48 object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="flex flex-col gap-2 w-full">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={downloadQr}
                      className="w-full h-10 text-xs font-medium"
                    >
                      <Download className="size-3.5 mr-2" /> Download Branded QR Code
                    </Button>
                  </div>
                </>
              ) : (
                <div className="h-44 grid place-items-center text-xs text-muted-foreground">
                  Generating QR Code...
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Student Hub Info Banner */}
        <div className="p-3.5 rounded-xl border bg-card text-foreground flex flex-col gap-2.5">
          <div className="space-y-0.5">
            <h4 className="font-semibold text-xs sm:text-sm">Enrolled with multiple lecturers?</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Direct students to the <b>Central Student Portal</b> (
              <code className="font-mono">/student</code>) to track attendance, assignments, and
              academic standings across all courses.
            </p>
          </div>
          <a href="/student" target="_blank" rel="noreferrer" className="w-full">
            <Button variant="outline" size="sm" className="w-full h-9 text-xs">
              Open Central Student Portal <ExternalLink className="size-3.5 ml-1.5" />
            </Button>
          </a>
        </div>
      </div>
    </AppShell>
  );
}
