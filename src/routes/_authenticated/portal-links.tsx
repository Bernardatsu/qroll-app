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

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `qroll-student-portal-qr.png`;
    a.click();
  };

  return (
    <AppShell>
      <div className="max-w-4xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <Share2 className="size-6 text-primary" /> Student QR Portal
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Share this permanent link or display the QR code in class so students can retrieve
              their personal QR passes.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerate}
            disabled={loading || regenerating}
            className="self-start sm:self-auto text-xs"
          >
            <RefreshCw className={`size-3.5 mr-1.5 ${regenerating ? "animate-spin" : ""}`} />
            Regenerate Link
          </Button>
        </div>

        {/* Main Link & QR Card */}
        <div className="grid gap-6 md:grid-cols-5">
          <Card className="md:col-span-3 border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Your Active Student QR Portal Link</CardTitle>
              <CardDescription>
                Students use this link to look up their record by index number and download their
                badge.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {url ? (
                <>
                  <div className="p-3.5 rounded-lg border bg-muted/40 font-mono text-sm break-all select-all flex items-center justify-between gap-2">
                    <span className="truncate">{url}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={copy} className="flex-1 sm:flex-initial">
                      {copied ? (
                        <Check className="size-4 mr-1.5 text-emerald-300" />
                      ) : (
                        <Copy className="size-4 mr-1.5" />
                      )}
                      {copied ? "Copied!" : "Copy Link"}
                    </Button>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 sm:flex-initial"
                    >
                      <Button variant="outline" className="w-full">
                        <ExternalLink className="size-4 mr-1.5" /> Test Portal
                      </Button>
                    </a>
                  </div>

                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs space-y-2 text-foreground">
                    <div className="font-semibold text-primary flex items-center gap-1.5">
                      <ShieldCheck className="size-4" /> Portal Protection & Scope
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-muted-foreground leading-relaxed">
                      <li>
                        <b>Multi-Course Support:</b> This link stays active indefinitely for all
                        courses you create.
                      </li>
                      <li>
                        <b>Privacy Guaranteed:</b> Only students uploaded to your courses can look
                        themselves up.
                      </li>
                      <li>
                        <b>Token Identifier:</b>{" "}
                        <code className="font-mono bg-background px-1 py-0.5 rounded border">
                          {token}
                        </code>
                      </li>
                    </ul>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center space-y-3">
                  <RefreshCw className="size-6 mx-auto animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Preparing your secure student portal link...
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* QR Code Card for Class Projection */}
          <Card className="md:col-span-2 border-border shadow-sm flex flex-col justify-between">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-base flex items-center justify-center gap-1.5">
                <QrCode className="size-4 text-primary" /> Project In Class
              </CardTitle>
              <CardDescription className="text-xs">
                Students can scan this directly from your screen.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center space-y-3 pb-6">
              {qrDataUrl ? (
                <>
                  <div className="p-3 bg-white rounded-xl shadow-inner border border-slate-200">
                    <img
                      src={qrDataUrl}
                      alt="Student Portal QR Code"
                      className="size-48 object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <Button variant="outline" size="sm" onClick={downloadQr} className="text-xs">
                    <Download className="size-3.5 mr-1.5" /> Download QR Code
                  </Button>
                </>
              ) : (
                <div className="h-48 grid place-items-center text-xs text-muted-foreground">
                  Generating QR Code...
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Student Hub Info Banner */}
        <div className="p-4 rounded-xl border bg-card text-foreground flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h4 className="font-semibold text-sm">
              Have students enrolled with multiple lecturers?
            </h4>
            <p className="text-xs text-muted-foreground">
              Direct them to the <b>Central Student Portal</b> (
              <code className="font-mono">/student</code>) where they can track coursework,
              assignments, and attendance across all their lecturers.
            </p>
          </div>
          <a href="/student" target="_blank" rel="noreferrer" className="shrink-0">
            <Button variant="outline" size="sm" className="text-xs">
              Open Student Portal <ExternalLink className="size-3.5 ml-1.5" />
            </Button>
          </a>
        </div>
      </div>
    </AppShell>
  );
}
