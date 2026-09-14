import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { linkWithPopup, unlink, updatePassword, sendPasswordResetEmail } from "firebase/auth";
import { firebaseAuth, googleProvider } from "@/integrations/firebase/config";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  CheckCircle2,
  Link2,
  Mail,
  ShieldCheck,
  Home as HomeIcon,
  Info,
  Laptop,
  Smartphone,
  Tablet,
  Trash2,
  RefreshCw,
  Devices as DevicesIcon,
  KeyRound,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  getUserDevices,
  revokeDevice,
  revokeOtherDevices,
  getDeviceId,
  type UserDevice,
  MAX_DEVICES_PER_ACCOUNT,
} from "@/lib/device-manager";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Account Settings — QRoll" }] }),
  component: SettingsPage,
});

type Identity = { provider: string; email?: string };

function SettingsPage() {
  const { user } = useAuth();
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const currentDeviceId = getDeviceId();

  // Password Setup / Change Modal
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  const fetchDevices = async () => {
    if (!user?.id) return;
    setLoadingDevices(true);
    try {
      const list = await getUserDevices(user.id);
      setDevices(list);
    } catch (err) {
      console.error("Error fetching devices:", err);
    } finally {
      setLoadingDevices(false);
    }
  };

  const handleRevokeDevice = async (d: UserDevice) => {
    if (d.device_id === currentDeviceId) {
      if (!confirm("Are you sure you want to sign out this device?")) return;
    }
    setRevokingId(d.id);
    try {
      await revokeDevice(d.id);
      toast.success(`Revoked ${d.device_name}`);
      await fetchDevices();
      if (d.device_id === currentDeviceId) {
        await firebaseAuth.signOut();
        window.location.href = "/auth";
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to revoke device");
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeOthers = async () => {
    if (!user?.id) return;
    if (
      !confirm("Revoke all other logged-in sessions? You will stay logged in only on this device.")
    )
      return;
    setLoadingDevices(true);
    try {
      await revokeOtherDevices(user.id, currentDeviceId);
      toast.success("All other device sessions revoked.");
      await fetchDevices();
    } catch (err: any) {
      toast.error(err?.message || "Failed to revoke other devices");
    } finally {
      setLoadingDevices(false);
    }
  };

  const refresh = () => {
    const fbUser = firebaseAuth.currentUser;
    if (!fbUser) return;
    const ids: Identity[] = (fbUser.providerData || []).map((p) => ({
      provider:
        p.providerId === "google.com"
          ? "google"
          : p.providerId === "password"
            ? "email"
            : p.providerId,
      email: p.email || undefined,
    }));
    setIdentities(ids);
  };

  useEffect(() => {
    refresh();
    void fetchDevices();
  }, [user?.id]);

  const hasGoogle =
    user?.provider === "google" ||
    identities.some((i) => i.provider === "google" || i.provider === "google.com");

  const hasPassword = identities.some((i) => i.provider === "email" || i.provider === "password");

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      toast.error("Password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    const current = firebaseAuth.currentUser;
    if (!current) {
      toast.error("You must be signed in.");
      return;
    }

    setPasswordLoading(true);
    try {
      await updatePassword(current, newPassword);
      toast.success(
        "Password saved successfully! You can now sign in using either Email/Password or Continue with Google.",
      );
      setPasswordModalOpen(false);
      setNewPassword("");
      setConfirmPassword("");
      refresh();
    } catch (err: any) {
      if (err?.code === "auth/requires-recent-login") {
        toast.error(
          "For security, please use the email setup link below or re-sign in recently to set your password directly.",
        );
      } else {
        toast.error(err?.message || "Failed to set password.");
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSendResetEmail = async () => {
    const email = firebaseAuth.currentUser?.email;
    if (!email) {
      toast.error("No email found for this account.");
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(firebaseAuth, email);
      toast.success(`Password setup instructions sent to ${email}! Check your inbox.`);
      setPasswordModalOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to send email link.");
    } finally {
      setBusy(false);
    }
  };

  const linkGoogle = async () => {
    const current = firebaseAuth.currentUser;
    if (!current) return;
    setBusy(true);
    try {
      await linkWithPopup(current, googleProvider);
      toast.success("Google account linked successfully!");
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Could not link Google account");
    } finally {
      setBusy(false);
    }
  };

  const unlinkGoogle = async () => {
    const current = firebaseAuth.currentUser;
    if (!current) return;
    setBusy(true);
    try {
      await unlink(current, "google.com");
      toast.success("Google unlinked");
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Could not unlink Google");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6 w-full max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Account Settings</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage how you sign in to your QRoll account.
            </p>
          </div>
          <div className="flex gap-2">
            <Link to={"/dashboard" as string} className="w-full sm:w-auto">
              <Button className="w-full">
                <HomeIcon className="size-4 mr-1" />
                Dashboard
              </Button>
            </Link>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" /> Signed-in account
            </CardTitle>
            <CardDescription>{user?.email}</CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="size-5 text-primary" /> Connected sign-in methods
            </CardTitle>
            <CardDescription>
              Connect both Google and Email & Password so you can sign in whichever way is easiest.
              Both methods access the exact same lecturer account and courses.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border bg-muted/30 gap-3">
              <div className="flex items-center gap-3">
                <Mail className="size-5 text-muted-foreground shrink-0" />
                <div>
                  <div className="font-medium text-sm">Email & Password</div>
                  <div className="text-xs text-muted-foreground">
                    {hasPassword
                      ? "Manual email login enabled with active password"
                      : "No password set yet (signed in via Google)"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                {hasPassword ? (
                  <>
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="size-3" /> Active
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => setPasswordModalOpen(true)}>
                      <KeyRound className="size-3.5 mr-1" />
                      Change Password
                    </Button>
                  </>
                ) : (
                  <>
                    <Badge
                      variant="outline"
                      className="text-amber-600 border-amber-300 bg-amber-50"
                    >
                      Not set
                    </Badge>
                    <Button size="sm" variant="default" onClick={() => setPasswordModalOpen(true)}>
                      <KeyRound className="size-3.5 mr-1" />
                      Set Password for Email Login
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border bg-muted/30 gap-3">
              <div className="flex items-center gap-3">
                <svg className="size-5 shrink-0" viewBox="0 0 24 24">
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
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <div>
                  <div className="font-medium text-sm">Google</div>
                  <div className="text-xs text-muted-foreground">
                    {hasGoogle
                      ? "Connected to Google Sign-In"
                      : "Add Google as a second way to sign in"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                {hasGoogle ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="size-3" /> Linked
                    </Badge>
                    {hasPassword && (
                      <Button variant="ghost" size="sm" onClick={unlinkGoogle} disabled={busy}>
                        Unlink
                      </Button>
                    )}
                  </div>
                ) : (
                  <Button size="sm" onClick={linkGoogle} disabled={busy}>
                    Link Google
                  </Button>
                )}
              </div>
            </div>

            <p className="text-xs text-muted-foreground pt-2">
              💡 <b>Security tip:</b> we only link your Google account when you're already signed in
              here. This prevents anyone else with the same Gmail address from taking over your
              account.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Laptop className="size-5 text-primary" /> Logged-in Devices
              </CardTitle>
              <CardDescription className="text-xs">
                Maximum <b>4 devices</b> can be logged in per account simultaneously.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={devices.length >= MAX_DEVICES_PER_ACCOUNT ? "destructive" : "secondary"}
              >
                {devices.length} of {MAX_DEVICES_PER_ACCOUNT} used
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={fetchDevices}
                disabled={loadingDevices}
                aria-label="Refresh devices"
              >
                <RefreshCw className={`size-3.5 ${loadingDevices ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {devices.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                {loadingDevices ? "Loading devices..." : "No active devices recorded."}
              </p>
            ) : (
              <div className="space-y-2">
                {devices.map((d) => {
                  const isCurrent = d.device_id === currentDeviceId;
                  return (
                    <div
                      key={d.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border text-sm gap-2 transition-all ${
                        isCurrent ? "bg-primary/5 border-primary/30" : "bg-muted/30"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="size-9 rounded-lg bg-background border grid place-items-center shrink-0">
                          {d.device_type === "mobile" ? (
                            <Smartphone className="size-4 text-primary" />
                          ) : d.device_type === "tablet" ? (
                            <Tablet className="size-4 text-primary" />
                          ) : (
                            <Laptop className="size-4 text-primary" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs sm:text-sm text-foreground truncate">
                              {d.device_name}
                            </span>
                            {isCurrent && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/30"
                              >
                                This device
                              </Badge>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            Active: {new Date(d.last_active).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <Button
                        variant={isCurrent ? "outline" : "ghost"}
                        size="sm"
                        className={`text-xs h-8 shrink-0 ${isCurrent ? "hover:text-destructive" : "text-destructive hover:bg-destructive/10"}`}
                        disabled={revokingId === d.id}
                        onClick={() => void handleRevokeDevice(d)}
                      >
                        <Trash2 className="size-3.5 mr-1" />
                        {revokingId === d.id
                          ? "Revoking..."
                          : isCurrent
                            ? "Sign out device"
                            : "Revoke"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {devices.length > 1 && (
              <div className="pt-2 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={handleRevokeOthers}
                  disabled={loadingDevices}
                >
                  Revoke All Other Devices
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="size-5 text-primary" /> About QRoll
            </CardTitle>
            <CardDescription>Attendance and classroom management, made simple.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            <p>
              Built by <b className="text-foreground">Bern Studio</b>
            </p>
            <p>
              Developed by <b className="text-foreground">Agbenyo Bernard Atsu</b>
            </p>
            <p>
              Created by <b className="text-foreground">Bern Studio Labs</b>
            </p>
            <p className="text-xs pt-2">
              <Link to={"/manual" as string} className="underline hover:text-primary">
                Manual
              </Link>
              {" · "}
              <Link to={"/terms" as string} className="underline hover:text-primary">
                Terms
              </Link>
              {" · "}
              <Link to={"/privacy" as string} className="underline hover:text-primary">
                Privacy
              </Link>
            </p>
          </CardContent>
        </Card>

        {/* Set / Change Password Dialog */}
        <Dialog open={passwordModalOpen} onOpenChange={setPasswordModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <KeyRound className="size-5 text-primary" />
                <DialogTitle>
                  {hasPassword ? "Change Password" : "Set Password for Email Login"}
                </DialogTitle>
              </div>
              <DialogDescription>
                {hasPassword
                  ? "Enter a new password for your account."
                  : "Set a password for your account so you can sign in with your email address or Continue with Google anytime. Both methods access the exact same account."}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSavePassword} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Repeat new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={handleSendResetEmail}
                  className="text-xs text-primary hover:underline text-left"
                >
                  Send password setup email instead
                </button>
                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPasswordModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={passwordLoading}>
                    {passwordLoading ? (
                      <>
                        <Loader2 className="size-4 mr-1.5 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Password"
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
