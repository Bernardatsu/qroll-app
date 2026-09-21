import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, UserCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/portal-links")({
  head: () => ({ meta: [{ title: "Student Registration & Portal — QRoll" }] }),
  component: PortalLinksRedirectPage,
});

export function PortalLinksRedirectPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate({ to: "/student" });
    }, 1200);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <AppShell>
      <div className="max-w-md mx-auto py-12 text-center space-y-4">
        <Card className="border border-blue-800/40 bg-black text-white p-6 shadow-xl">
          <CardContent className="pt-6 space-y-4">
            <div className="size-14 mx-auto rounded-2xl bg-blue-950 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <UserCheck className="size-8" />
            </div>
            <h2 className="text-xl font-bold">Student Registration & Portal</h2>
            <p className="text-sm text-blue-200/70">
              Student Registration has been unified into the main Student Portal. Redirecting you to
              the student portal...
            </p>
            <Button
              onClick={() => navigate({ to: "/student" })}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold"
            >
              Go to Student Portal <ArrowRight className="size-4 ml-1.5" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
