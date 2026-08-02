import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import qrollLogo from "@/assets/qroll-logo.png.asset.json";
import qrollLogin from "@/assets/qroll-login.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — QRoll" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    navigate({ to: "/dashboard" });
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Account created. You can sign in.");
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/auth` });
    if (r.error) toast.error(r.error.message);
    else if (!r.redirected) navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="relative hidden md:flex bg-knust-gradient text-primary-foreground p-12 flex-col justify-between overflow-hidden">
        <img src={qrollLogin.url} alt="" aria-hidden="true" className="absolute inset-x-0 inset-y-0 h-full w-full object-cover object-top opacity-45" />
        <div className="absolute inset-0 bg-linear-to-t from-primary/85 via-primary/50 to-primary/70" aria-hidden="true" />
        <Link to="/" className="relative flex items-center gap-3">
          <img src={qrollLogo.url} alt="QRoll logo" className="h-10 w-auto object-contain" />
          <div className="font-semibold">QRoll</div>
        </Link>
        <div className="relative">
          <div className="text-gold uppercase tracking-widest text-xs font-semibold mb-3">Scan. Verify. Attend.</div>
          <h1 className="text-4xl font-bold leading-tight drop-shadow">Attendance made easy.</h1>
          <p className="mt-4 text-primary-foreground/85 max-w-md">Secure QR-based attendance for lectures, labs, and tutorials — built for KNUST.</p>
        </div>
        <div className="relative text-xs text-primary-foreground/60">© {new Date().getFullYear()} QRoll</div>
      </div>
      <div className="flex items-center justify-center p-6 md:p-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Sign in to manage attendance. First account becomes Super Admin.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="space-y-3 mt-4">
                <form onSubmit={signIn} className="space-y-3">
                  <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
                  <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
                  <Button type="submit" className="w-full" disabled={loading}>Sign in</Button>
                </form>
                <div className="relative my-3 text-center text-xs text-muted-foreground"><span className="bg-card px-2 relative z-10">or</span><div className="absolute inset-x-0 top-1/2 border-t" /></div>
                <Button type="button" variant="outline" className="w-full" onClick={google}>Continue with Google</Button>
                <p className="text-[11px] text-muted-foreground text-center leading-relaxed pt-1">
                  Already have a password account with this Gmail? <b>Sign in with your password first</b>, then go to <b>Settings → Connected sign-in methods</b> to link Google — no duplicate account.
                </p>
              </TabsContent>
              <TabsContent value="signup" className="space-y-3 mt-4">
                <form onSubmit={signUp} className="space-y-3">
                  <div><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
                  <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
                  <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></div>
                  <Button type="submit" className="w-full" disabled={loading}>Create account</Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
