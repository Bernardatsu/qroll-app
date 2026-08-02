import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { QrCode, ShieldCheck, BarChart3, GraduationCap } from "lucide-react";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import qrollLogo from "@/assets/qroll-logo.png.asset.json";
import studentsBanner from "@/assets/students-banner.png.asset.json";
import { PublicFooter } from "@/components/PublicFooter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "QRoll — QR Attendance Made Easy" },
      { name: "description", content: "Official QR attendance management system for Kwame Nkrumah University of Science and Technology. Secure, instant, exportable." },
      { property: "og:title", content: "QRoll Attendance" },
      { property: "og:description", content: "Secure QR attendance for KNUST lectures, labs, and tutorials." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={qrollLogo.url}
              alt="QRoll logo"
              className="size-11 rounded-full bg-white object-contain p-0.5 shadow-sm"
            />
            <div className="leading-tight">
              <div className="font-bold">QRoll</div>
              <div className="text-xs text-muted-foreground">Attendance System</div>
            </div>
          </div>
          <Link to={"/auth" as string}><Button>Sign in</Button></Link>
        </div>
      </header>

      <section className="relative bg-knust-gradient text-primary-foreground overflow-hidden">
        {/* Banner image behind the text */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <img
            src={studentsBanner.url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-center opacity-90"
          />
          {/* very light tint so image stays clearly visible */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary/40 via-primary/15 to-transparent" />
        </div>

        <div className="relative max-w-6xl mx-auto px-6 py-20 md:py-28 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="text-gold uppercase tracking-widest text-xs font-semibold mb-3">Kwame Nkrumah University of Science and Technology</div>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight drop-shadow-md">QR Attendance for every lecture, lab, and tutorial.</h1>
            <p className="mt-5 text-white/90 text-lg max-w-lg drop-shadow">Secure UUID-based student QR codes. Two-scan check-in/out. Real-time dashboards. Excel & PDF reports.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to={"/auth" as string}><Button size="lg" className="bg-gold text-gold-foreground hover:bg-gold/90">Get started</Button></Link>
              <Link to={"/auth" as string}><Button size="lg" variant="outline" className="border-white/40 text-white bg-white/0 hover:bg-white/10">Sign in</Button></Link>
            </div>
          </div>
          <div className="hidden md:grid grid-cols-2 gap-4">
            {[
              { i: QrCode, t: "Secure QR", d: "Random UUIDs — no names embedded." },
              { i: ShieldCheck, t: "Role-based", d: "Admins, lecturers, TAs." },
              { i: BarChart3, t: "Reports", d: "Excel, CSV, PDF exports." },
              { i: GraduationCap, t: "All levels", d: "100, 200, 300, 400." },
            ].map((f) => (
              <div key={f.t} className="rounded-xl bg-white/15 backdrop-blur p-5 border border-white/20">
                <f.i className="size-6 text-gold mb-3" />
                <div className="font-semibold">{f.t}</div>
                <div className="text-sm text-white/80">{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
