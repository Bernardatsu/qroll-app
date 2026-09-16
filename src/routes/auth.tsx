import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { signInWithPopup } from "firebase/auth";
import {
  firebaseAuth,
  onAuthStateChanged,
  googleProvider,
  syncUserToFirestore,
} from "@/integrations/firebase/config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";

import qrollLogo from "@/assets/qroll-logo.png";
import qrollLogin from "@/assets/qroll-login.png";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — QRoll" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (firebaseAuth.currentUser) {
      navigate({ to: "/dashboard" });
      return;
    }

    const unsubFb = onAuthStateChanged(firebaseAuth, (fbUser) => {
      if (fbUser) {
        navigate({ to: "/dashboard" });
      }
    });

    return () => {
      unsubFb();
    };
  }, [navigate]);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const result = await signInWithPopup(firebaseAuth, googleProvider);
      await syncUserToFirestore(result.user);
      toast.success(`Signed in as ${result.user.displayName || result.user.email || "User"}`);
      navigate({ to: "/dashboard" });
    } catch (err: unknown) {
      console.error("Google sign in error:", err);
      const errorObj = err as { code?: string; message?: string };
      if (errorObj?.code === "auth/popup-closed-by-user") {
        toast.info("Google sign-in was cancelled.");
      } else if (errorObj?.code === "auth/popup-blocked") {
        toast.error("Google sign-in popup was blocked. Please allow popups for this site.");
      } else {
        toast.error(errorObj?.message || "Failed to sign in with Google.");
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left branding column */}
      <div className="hidden lg:flex relative flex-col justify-between p-10 text-primary-foreground overflow-hidden">
        <img
          src={qrollLogin}
          alt="QRoll classroom attendance"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-primary/80" />

        <div className="relative z-10 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img
              src={qrollLogo}
              alt="QRoll logo"
              className="size-10 rounded-full bg-white object-contain p-0.5 shadow-md"
            />
            <span className="font-bold text-xl tracking-tight text-white drop-shadow">QRoll</span>
          </Link>
          <Link to="/">
            <Button
              variant="outline"
              size="sm"
              className="border-white/30 bg-black/30 hover:bg-black/50 text-white backdrop-blur"
            >
              <ArrowLeft className="size-4 mr-1.5" />
              Back to site
            </Button>
          </Link>
        </div>

        <div className="relative z-10 my-auto max-w-md space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3.5 py-1 text-xs font-semibold backdrop-blur text-white shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Fast & Reliable Attendance
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white drop-shadow-md">
            Attendance verification made seamless.
          </h1>
          <p className="text-white/90 text-base leading-relaxed drop-shadow">
            Generate rotating QR codes, verify enrolled students, and track live presence without
            the paperwork.
          </p>
        </div>
        <div className="relative z-10 text-xs text-white/70">
          © {new Date().getFullYear()} QRoll
        </div>
      </div>

      {/* Right form column */}
      <div className="relative flex items-center justify-center p-0 md:p-12">
        <div className="relative w-full max-w-md space-y-4 pb-6 md:pb-0">
          {/* Mobile and Tablet banner */}
          <div className="lg:hidden relative h-60 w-full overflow-hidden rounded-b-3xl bg-knust-gradient">
            <img
              src={qrollLogin}
              alt="Student checking in with a QR code"
              className="absolute inset-0 h-full w-full object-cover object-top"
            />
            <div
              className="absolute inset-0 bg-gradient-to-b from-primary/50 via-black/40 to-background"
              aria-hidden="true"
            />
            <div className="absolute inset-x-0 top-0 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4">
              <Link to="/" className="flex min-w-0 items-center gap-2 text-primary-foreground">
                <img
                  src={qrollLogo}
                  alt="QRoll logo"
                  className="h-9 w-auto shrink-0 object-contain rounded-full bg-white p-0.5"
                />
                <span className="truncate font-semibold drop-shadow text-white">QRoll</span>
              </Link>
              <Link to="/">
                <Button variant="secondary" size="sm" className="shrink-0">
                  <ArrowLeft className="size-4 mr-1" />
                  Home
                </Button>
              </Link>
            </div>
            <div className="absolute inset-x-0 bottom-3 px-5">
              <div className="text-[10px] uppercase tracking-widest font-semibold text-primary-foreground/90 drop-shadow">
                Scan. Verify. Attend.
              </div>
              <div className="text-lg font-bold text-white drop-shadow">
                Smart attendance portal
              </div>
            </div>
          </div>

          <div className="px-4 md:px-0">
            <Card className="border-border/60 shadow-lg">
              <CardHeader className="space-y-1 text-center pb-4">
                <CardTitle className="text-2xl font-bold">Welcome to QRoll</CardTitle>
                <CardDescription>
                  Sign in to manage courses, attendance sessions, and student rolls.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "signup")}>
                  <TabsList className="grid grid-cols-2 w-full mb-4">
                    <TabsTrigger value="signin">Sign in</TabsTrigger>
                    <TabsTrigger value="signup">Create account</TabsTrigger>
                  </TabsList>

                  {/* SIGN IN TAB */}
                  <TabsContent value="signin" className="space-y-4">
                    {/* Google OAuth Button */}
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full flex items-center justify-center gap-2 py-5 font-medium shadow-sm hover:bg-accent cursor-pointer"
                      onClick={handleGoogleSignIn}
                      disabled={googleLoading}
                    >
                      {googleLoading ? (
                        <>
                          <Loader2 className="size-4 animate-spin mr-1.5" />
                          Signing in with Google...
                        </>
                      ) : (
                        <>
                          <svg className="size-4 shrink-0" viewBox="0 0 24 24">
                            <path
                              fill="#4285F4"
                              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            />
                            <path
                              fill="#34A853"
                              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            />
                            <path
                              fill="#FBBC05"
                              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                            />
                            <path
                              fill="#EA4335"
                              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                            />
                          </svg>
                          Continue with Google
                        </>
                      )}
                    </Button>

                    <p className="text-center text-xs text-muted-foreground leading-relaxed pt-1">
                      Sign in securely using your institutional Google account.
                    </p>

                    <div className="pt-2 text-center text-xs text-muted-foreground">
                      Don&apos;t have an account yet?{" "}
                      <button
                        type="button"
                        onClick={() => setTab("signup")}
                        className="font-medium text-primary hover:underline"
                      >
                        Create an account
                      </button>
                    </div>
                  </TabsContent>

                  {/* SIGN UP TAB */}
                  <TabsContent value="signup" className="space-y-4">
                    {/* Google OAuth Button */}
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full flex items-center justify-center gap-2 py-5 font-medium shadow-sm hover:bg-accent cursor-pointer"
                      onClick={handleGoogleSignIn}
                      disabled={googleLoading}
                    >
                      {googleLoading ? (
                        <>
                          <Loader2 className="size-4 animate-spin mr-1.5" />
                          Signing up with Google...
                        </>
                      ) : (
                        <>
                          <svg className="size-4 shrink-0" viewBox="0 0 24 24">
                            <path
                              fill="#4285F4"
                              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            />
                            <path
                              fill="#34A853"
                              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            />
                            <path
                              fill="#FBBC05"
                              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                            />
                            <path
                              fill="#EA4335"
                              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                            />
                          </svg>
                          Sign up with Google
                        </>
                      )}
                    </Button>

                    <p className="text-center text-xs text-muted-foreground leading-relaxed pt-1">
                      New to QRoll? Sign in with your Google account to automatically set up your
                      lecturer profile in seconds.
                    </p>

                    <div className="pt-2 text-center text-xs text-muted-foreground">
                      Already have an account?{" "}
                      <button
                        type="button"
                        onClick={() => setTab("signin")}
                        className="font-medium text-primary hover:underline"
                      >
                        Sign in here
                      </button>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
