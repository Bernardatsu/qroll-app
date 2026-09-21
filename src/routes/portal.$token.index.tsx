import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, UserCheck } from "lucide-react";
import { PublicFooter } from "@/components/PublicFooter";

export const Route = createFileRoute("/portal/$token/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Student Portal & Registration — QRoll" }] }),
  component: PortalPage,
});

function PortalPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate({ to: "/student" });
    }, 1200);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border border-emerald-800/40 bg-card p-6 shadow-xl text-center space-y-4">
          <CardContent className="pt-6 space-y-4">
            <div className="size-14 mx-auto rounded-2xl bg-emerald-950 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <UserCheck className="size-8" />
            </div>
            <h2 className="text-xl font-bold">QRoll Student Portal</h2>
            <p className="text-sm text-muted-foreground">
              Student Registration and universal QR passes are now accessible directly in the
              Central Student Portal. Redirecting you to the student portal...
            </p>
            <Button
              onClick={() => navigate({ to: "/student" })}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-black font-semibold"
            >
              Enter Student Portal <ArrowRight className="size-4 ml-1.5" />
            </Button>
          </CardContent>
        </Card>
      </div>
      <PublicFooter />
    </div>
  );
}
