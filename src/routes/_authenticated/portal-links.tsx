import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink, Share2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/portal-links")({
  head: () => ({ meta: [{ title: "Student Portal Link — KNUST" }] }),
  component: PortalLinksPage,
});

function PortalLinksPage() {
  const [token, setToken] = useState<string>("");
  const [url, setUrl] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: me } = await supabase.auth.getUser();
      if (!me.user) return;
      // Find the newest active link owned by this lecturer; create one if none.
      const { data: existing } = await supabase
        .from("student_portal_links")
        .select("id, token, is_active, course_id, courses(id)")
        .eq("owner_id", me.user.id)
        .order("created_at", { ascending: false });

      let row = existing?.[0] as any;
      if (!row) {
        const { data: anyCourse } = await supabase
          .from("courses").select("id").eq("archived", false).limit(1).maybeSingle();
        if (!anyCourse) {
          toast.error("Create at least one course before generating the portal link");
          return;
        }
        const { data: created, error } = await supabase
          .from("student_portal_links")
          .insert({ course_id: anyCourse.id, is_active: true } as any)
          .select("id, token")
          .single();
        if (error) { toast.error(error.message); return; }
        row = created;
      } else if (!row.is_active) {
        await supabase.from("student_portal_links").update({ is_active: true }).eq("id", row.id);
      }
      setToken(row.token);
      setUrl(`${window.location.origin}/portal/${row.token}`);
    })();
  }, []);

  const copy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  return (
    <AppShell>
      <h1 className="text-3xl font-bold mb-2 flex items-center gap-2"><Share2 className="size-6 text-primary" /> Student QR Portal</h1>
      <p className="text-muted-foreground mb-6">
        Share this <b>single permanent link</b> with your students. On the portal they pick the course, then enter their index number and email to retrieve their personal QR code.
      </p>

      <Card>
        <CardHeader><CardTitle className="text-base">Your shared portal link</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {url ? (
            <>
              <div className="p-4 rounded-md border bg-muted/40 font-mono text-sm break-all">{url}</div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={copy}><Copy className="size-4 mr-1" /> Copy link</Button>
                <a href={url} target="_blank" rel="noreferrer">
                  <Button variant="outline"><ExternalLink className="size-4 mr-1" /> Open portal</Button>
                </a>
              </div>
              <div className="rounded-md border border-primary/20 bg-primary/5 p-4 text-sm">
                <div className="font-semibold text-primary mb-1">How it works</div>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li>The link is <b>always active</b> and works for every course you teach.</li>
                  <li>Only students you uploaded can look themselves up; other lecturers' students are invisible.</li>
                  <li>Token: <span className="font-mono">{token}</span></li>
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
