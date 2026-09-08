import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ArrowLeft, GraduationCap, LogOut, Megaphone, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PublicFooter } from "@/components/PublicFooter";

export const Route = createFileRoute("/student")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Student Page — QRoll" },
      { name: "description", content: "Students sign in with their index number to track attendance percentage, present and absent sessions, and attendance warnings." },
      { property: "og:title", content: "Student Page — QRoll" },
      { property: "og:description", content: "Track your own attendance record with your index number." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudentPage,
});

const STORE = "qroll.student.session.v1";

type Me = { full_name: string; index_number: string; level: string; qr_uuid: string; pin: string };
type CourseRow = { course_id: string; code: string; title: string; sessions_total: number; attended: number; percentage: number };
type HistRow = { course_code: string; session_title: string; session_date: string; checked_in: string | null; status: string };
type NoticeRow = { id: string; title: string; body: string; course_code: string | null; starts_on: string; expires_on: string | null };
type AssignRow = { id: string; title: string; details: string; submission_url: string | null; course_code: string | null; due_at: string | null };

type Step = "index" | "create" | "login" | "reset";

function StudentPage() {
  const [step, setStep] = useState<Step>("index");
  const [index, setIndex] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasEmail, setHasEmail] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [history, setHistory] = useState<HistRow[]>([]);
  const [notices, setNotices] = useState<NoticeRow[]>([]);
  const [assignments, setAssignments] = useState<AssignRow[]>([]);

  useEffect(() => {
    const raw = sessionStorage.getItem(STORE);
    if (!raw) return;
    try {
      const { i, p } = JSON.parse(raw);
      void signIn(i, p, true);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async (i: string, p: string) => {
    const [c, h, n] = await Promise.all([
      (supabase as any).rpc("student_courses", { _index: i, _password: p }),
      (supabase as any).rpc("student_history", { _index: i, _password: p }),
      (supabase as any).rpc("student_announcements", { _index: i, _password: p }),
    ]);
    setCourses((c.data ?? []) as CourseRow[]);
    setHistory((h.data ?? []) as HistRow[]);
    setNotices((n.data ?? []) as NoticeRow[]);
  };

  const signIn = async (i: string, p: string, silent = false) => {
    const { data, error } = await (supabase as any).rpc("student_login", { _index: i, _password: p });
    if (error) { if (!silent) toast.error(error.message); return false; }
    const row = (data as Me[])?.[0];
    if (!row) { if (!silent) toast.error("Wrong index number or password"); return false; }
    sessionStorage.setItem(STORE, JSON.stringify({ i, p }));
    setIndex(i); setPassword(p); setMe(row);
    await loadData(i, p);
    return true;
  };

  const checkIndex = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await (supabase as any).rpc("student_auth_status", { _index: index.trim() });
    setBusy(false);
    if (error) return toast.error(error.message);
    const row = (data as any[])?.[0];
    if (!row) return toast.error("This index number is not registered by any tutor yet.");
    setHasEmail(!!row.has_email);
    setStep(row.has_password ? "login" : "create");
  };

  const createPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await (supabase as any).rpc("student_set_password", { _index: index.trim(), _email: email.trim(), _password: password });
    setBusy(false);
    if (error) return toast.error(error.message);
    const row = (data as any[])?.[0];
    if (!row?.ok) return toast.error(row?.message ?? "Could not create password");
    toast.success("Password created");
    await signIn(index.trim(), password);
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await (supabase as any).rpc("student_reset_password", { _index: index.trim(), _email: email.trim(), _password: password });
    setBusy(false);
    if (error) return toast.error(error.message);
    const row = (data as any[])?.[0];
    if (!row?.ok) return toast.error(row?.message ?? "Could not reset password");
    toast.success("Password reset");
    await signIn(index.trim(), password);
  };

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await signIn(index.trim(), password);
    setBusy(false);
  };

  const signOut = () => {
    sessionStorage.removeItem(STORE);
    setMe(null); setPassword(""); setStep("index"); setCourses([]); setHistory([]); setNotices([]);
  };

  const overall = courses.length
    ? Math.round((courses.reduce((a, c) => a + Number(c.percentage), 0) / courses.length) * 10) / 10
    : 0;

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <div className="flex-1 w-full max-w-3xl mx-auto p-6">
        <div className="mb-4">
          <Link to="/">
            <Button variant="ghost" size="sm"><ArrowLeft className="size-4 mr-1" />Home</Button>
          </Link>
        </div>

        <div className="flex items-center gap-2 mb-6">
          <GraduationCap className="size-7 text-primary" />
          <h1 className="text-2xl font-bold">Student Page</h1>
        </div>

        {!me ? (
          <Card className="max-w-md mx-auto animate-in fade-in duration-300">
            {step === "index" && (
              <>
                <CardHeader>
                  <CardTitle>Enter your index number</CardTitle>
                  <CardDescription>Free access for any student already registered by a tutor.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={checkIndex} className="space-y-3">
                    <div><Label>Index number</Label><Input value={index} onChange={(e) => setIndex(e.target.value)} required /></div>
                    <Button type="submit" className="w-full" disabled={busy}>{busy ? "Checking..." : "Continue"}</Button>
                  </form>
                </CardContent>
              </>
            )}

            {step === "create" && (
              <>
                <CardHeader>
                  <CardTitle>Create your password</CardTitle>
                  <CardDescription>First time here — set a password for {index}.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={createPassword} className="space-y-3">
                    {hasEmail && (
                      <div><Label>Email on your record</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
                    )}
                    <div><Label>New password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required /></div>
                    <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving..." : "Create password"}</Button>
                    <Button type="button" variant="ghost" className="w-full" onClick={() => setStep("index")}>Back</Button>
                  </form>
                </CardContent>
              </>
            )}

            {step === "login" && (
              <>
                <CardHeader>
                  <CardTitle>Welcome back</CardTitle>
                  <CardDescription>Sign in as {index}.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={doLogin} className="space-y-3">
                    <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
                    <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</Button>
                    <div className="flex justify-between">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setStep("index")}>Back</Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => { setPassword(""); setStep("reset"); }}>Forgot password?</Button>
                    </div>
                  </form>
                </CardContent>
              </>
            )}

            {step === "reset" && (
              <>
                <CardHeader>
                  <CardTitle>Reset your password</CardTitle>
                  <CardDescription>Verify the email on your student record.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={resetPassword} className="space-y-3">
                    <div><Label>Email on your record</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
                    <div><Label>New password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required /></div>
                    <Button type="submit" className="w-full" disabled={busy}>{busy ? "Resetting..." : "Reset password"}</Button>
                    <Button type="button" variant="ghost" className="w-full" onClick={() => setStep("login")}>Back</Button>
                  </form>
                </CardContent>
              </>
            )}
          </Card>
        ) : (
          <div className="space-y-6 animate-in fade-in duration-300">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>{me.full_name}</CardTitle>
                  <CardDescription>{me.index_number} · Level {me.level}</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={signOut}><LogOut className="size-4 mr-1" />Sign out</Button>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Overall attendance</span>
                  <span className="font-semibold">{overall}%</span>
                </div>
                <Progress value={overall} />
                {overall < 75 && courses.length > 0 && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                    Your attendance is below 75%. Attend upcoming sessions to avoid being barred.
                  </div>
                )}
              </CardContent>
            </Card>

            {notices.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Megaphone className="size-4 text-primary" /> Announcements
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {notices.map((n) => (
                    <div key={n.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{n.title}</div>
                        {n.course_code && <Badge variant="secondary">{n.course_code}</Badge>}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</p>
                      <div className="mt-1 text-xs text-muted-foreground">{n.starts_on}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle className="text-base">My courses</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {courses.length === 0 && <p className="text-sm text-muted-foreground">You are not registered in any course yet.</p>}
                {courses.map((c) => (
                  <div key={c.course_id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{c.code} — {c.title}</div>
                        <div className="text-xs text-muted-foreground">
                          Present {c.attended} of {c.sessions_total} sessions · Absent {Math.max(0, c.sessions_total - c.attended)}
                        </div>
                      </div>
                      <Badge variant={Number(c.percentage) >= 75 ? "default" : "destructive"}>{c.percentage}%</Badge>
                    </div>
                    <Progress className="mt-2" value={Number(c.percentage)} />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Attendance history</CardTitle></CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No attendance recorded yet.</p>
                ) : (
                  <div className="divide-y">
                    {history.map((h, i) => (
                      <div key={i} className="py-2 flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{h.course_code} · {h.session_title}</div>
                          <div className="text-xs text-muted-foreground">{h.session_date}</div>
                        </div>
                        <Badge variant="secondary">{h.status.replace(/_/g, " ").toLowerCase()}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4" /> You can only ever see your own records.
            </p>
          </div>
        )}
      </div>
      <PublicFooter />
    </div>
  );
}
