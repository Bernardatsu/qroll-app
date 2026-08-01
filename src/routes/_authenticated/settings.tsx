import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, Link2, Mail, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Account Settings — KNUST Attendance" }] }),
  component: SettingsPage,
});

type Identity = { provider: string; identity_data?: { email?: string } };

function SettingsPage() {
  const { user } = useAuth();
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const { data } = await supabase.auth.getUserIdentities();
    setIdentities((data?.identities as Identity[] | undefined) ?? []);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const hasGoogle = identities.some((i) => i.provider === "google");
  const hasEmail = identities.some((i) => i.provider === "email");

  const linkGoogle = async () => {
    setBusy(true);
    try {
      const r = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/settings`,
      });
      if (r.error) toast.error(r.error.message);
      else await refresh();
    } finally {
      setBusy(false);
    }
  };

  const unlinkGoogle = async () => {
    const goog = identities.find((i) => i.provider === "google");
    if (!goog) return;
    setBusy(true);
    const { error } = await supabase.auth.unlinkIdentity(goog as never);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Google unlinked");
    await refresh();
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-3xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Account Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage how you sign in to your KNUST Attendance account.</p>
        </div>
        <div className="flex gap-2">
          <Link to={"/" as string} className="w-full sm:w-auto">
            <Button variant="outline" className="w-full"><HomeIcon className="size-4 mr-1" />Home</Button>
          </Link>
          <Link to={"/dashboard" as string} className="w-full sm:w-auto">
            <Button className="w-full">Dashboard</Button>
          </Link>
        </div>
      </div>


      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /> Signed-in account</CardTitle>
          <CardDescription>{user?.email}</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Link2 className="size-5 text-primary" /> Connected sign-in methods</CardTitle>
          <CardDescription>
            Link Google to your existing password account so you can use either method — no duplicate accounts, no lost data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3">
              <Mail className="size-5 text-muted-foreground" />
              <div>
                <div className="font-medium text-sm">Email & Password</div>
                <div className="text-xs text-muted-foreground">Sign in with your email address</div>
              </div>
            </div>
            {hasEmail ? (
              <Badge variant="secondary" className="gap-1"><CheckCircle2 className="size-3" /> Active</Badge>
            ) : (
              <Badge variant="outline">Not set</Badge>
            )}
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3">
              <svg className="size-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              <div>
                <div className="font-medium text-sm">Google</div>
                <div className="text-xs text-muted-foreground">
                  {hasGoogle ? "You can sign in with Google" : "Add Google as a second way to sign in"}
                </div>
              </div>
            </div>
            {hasGoogle ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1"><CheckCircle2 className="size-3" /> Linked</Badge>
                {hasEmail && (
                  <Button variant="ghost" size="sm" onClick={unlinkGoogle} disabled={busy}>Unlink</Button>
                )}
              </div>
            ) : (
              <Button size="sm" onClick={linkGoogle} disabled={busy}>Link Google</Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground pt-2">
            💡 <b>Security tip:</b> we only link your Google account when you're already signed in here. This prevents anyone else with the same Gmail address from taking over your account.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
