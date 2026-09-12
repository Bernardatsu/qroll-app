import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { firebaseAuth, firestoreDb } from "@/integrations/firebase/config";
import { collection, doc, getDocs, query, where, addDoc, updateDoc } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink, Share2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/portal-links")({
  head: () => ({ meta: [{ title: "Student Portal Link — QRoll" }] }),
  component: PortalLinksPage,
});

function PortalLinksPage() {
  const [token, setToken] = useState<string>("");
  const [url, setUrl] = useState<string>("");

  useEffect(() => {
    (async () => {
      const user = firebaseAuth.currentUser;
      if (!user) return;
      try {
        // Find the newest active link owned by this lecturer; create one if none.
        const portalSnap = await getDocs(
          query(collection(firestoreDb, "student_portal_links"), where("owner_id", "==", user.uid)),
        );
        const existing = portalSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        existing.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

        let row = existing[0];
        if (!row) {
          const coursesSnap = await getDocs(
            query(collection(firestoreDb, "courses"), where("owner_id", "==", user.uid)),
          );
          const anyCourse = coursesSnap.docs.find((d) => !(d.data() as any).archived);
          if (!anyCourse) {
            toast.error("Create at least one course before generating the portal link");
            return;
          }
          const generatedToken =
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
              : Math.random().toString(36).substring(2, 18);

          const newDoc = await addDoc(collection(firestoreDb, "student_portal_links"), {
            course_id: anyCourse.id,
            token: generatedToken,
            is_active: true,
            owner_id: user.uid,
            created_at: new Date().toISOString(),
          });
          row = { id: newDoc.id, token: generatedToken };
        } else if (!row.is_active) {
          await updateDoc(doc(firestoreDb, "student_portal_links", row.id), { is_active: true });
        }
        setToken(row.token);
        setUrl(`${window.location.origin}/portal/${row.token}`);
      } catch (err: any) {
        toast.error(err?.message || "Failed to load portal link");
      }
    })();
  }, []);

  const copy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  return (
    <AppShell>
      <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
        <Share2 className="size-6 text-primary" /> Student QR Portal
      </h1>
      <p className="text-muted-foreground mb-6">
        Share this <b>single permanent link</b> with your students. On the portal they pick the
        course, then enter their index number and email to retrieve their personal QR code.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your shared portal link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {url ? (
            <>
              <div className="p-4 rounded-md border bg-muted/40 font-mono text-sm break-all">
                {url}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={copy}>
                  <Copy className="size-4 mr-1" /> Copy link
                </Button>
                <a href={url} target="_blank" rel="noreferrer">
                  <Button variant="outline">
                    <ExternalLink className="size-4 mr-1" /> Open portal
                  </Button>
                </a>
              </div>
              <div className="rounded-md border border-primary/20 bg-primary/5 p-4 text-sm">
                <div className="font-semibold text-primary mb-1">How it works</div>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li>
                    The link is <b>always active</b> and works for every course you teach.
                  </li>
                  <li>
                    Only students you uploaded can look themselves up; other lecturers' students are
                    invisible.
                  </li>
                  <li>
                    Token: <span className="font-mono">{token}</span>
                  </li>
                </ul>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Preparing your link…</p>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
