import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { QrCode, ShieldCheck, BarChart3, GraduationCap, PlayCircle } from "lucide-react";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import qrollLogo from "@/assets/qroll-logo.png.asset.json";
import qrollBanner from "@/assets/qroll-banner.png.asset.json";
import qrollPromo from "@/assets/qroll-promo.mp4.asset.json";
import { PublicFooter } from "@/components/PublicFooter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "QRoll — QR Attendance Made Easy" },
      { name: "description", content: "QRoll is a secure QR attendance system for universities. Scan. Verify. Attend. Instant reports, geofenced self check-in, exportable records." },
      { property: "og:title", content: "QRoll — QR Attendance Made Easy" },
      { property: "og:description", content: "QRoll is a secure QR attendance system for universities. Scan. Verify. Attend. Instant reports, geofenced self check-in, exportable records." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "QRoll — QR Attendance Made Easy" },
      { name: "twitter:description", content: "QRoll is a secure QR attendance system for universities. Scan. Verify. Attend. Instant reports, geofenced self check-in, exportable records." },
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
        <div className="max-w-6xl mx-auto px-6 py-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <img src={qrollLogo.url} alt="QRoll logo" className="h-9 w-auto shrink-0 object-contain" />
            <div className="leading-tight min-w-0">
              <div className="font-bold truncate">QRoll</div>
              <div className="text-xs text-muted-foreground truncate">Scan. Verify. Attend.</div>
            </div>
          </div>
          <Link to={"/auth" as string}><Button>Sign in</Button></Link>
        </div>
      </header>

      <section className="relative bg-knust-gradient text-primary-foreground overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <img src={qrollBanner.url} alt="" className="absolute inset-0 w-full h-full object-cover object-center opacity-25" />
          <div className="absolute inset-0 bg-linear-to-r from-primary/80 via-primary/55 to-primary/20" />
        </div>

        <div className="relative max-w-6xl mx-auto px-6 py-20 md:py-28 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="text-gold uppercase tracking-widest text-xs font-semibold mb-3">Scan. Verify. Attend.</div>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight drop-shadow-md">QRoll — attendance made easy for every lecture, lab, and tutorial.</h1>
            <p className="mt-5 text-primary-foreground/90 text-lg max-w-lg drop-shadow">Secure UUID student QR codes, geofenced self check-in, live dashboards, and Excel & PDF reports.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to={"/auth" as string}><Button size="lg" className="bg-gold text-gold-foreground hover:bg-gold/90">Get started</Button></Link>
              <Link to={"/manual" as string}><Button size="lg" variant="outline" className="border-white/40 bg-white/0 text-primary-foreground hover:bg-white/10">Read the manual</Button></Link>
            </div>
          </div>
          <div className="hidden md:grid grid-cols-2 gap-4">
            {[
              { i: QrCode, t: "Secure QR", d: "Random UUIDs — no names embedded." },
              { i: ShieldCheck, t: "Role-based", d: "Admins, lecturers, TAs." },
              { i: BarChart3, t: "Reports", d: "Excel, CSV, PDF exports." },
              { i: GraduationCap, t: "All classes", d: "Any level you create." },
            ].map((f) => (
              <div key={f.t} className="rounded-xl bg-white/15 backdrop-blur p-5 border border-white/20">
                <f.i className="size-6 text-gold mb-3" />
                <div className="font-semibold">{f.t}</div>
                <div className="text-sm text-primary-foreground/80">{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-4xl mx-auto w-full px-6 py-14">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <PlayCircle className="size-6 text-primary" /> See QRoll in action
        </h2>
        <p className="text-sm text-muted-foreground mt-1">A quick look at how attendance is captured in seconds.</p>
        <video
          src={qrollPromo.url}
          controls
          playsInline
          preload="metadata"
          className="mt-5 w-full rounded-xl border shadow-sm bg-black"
        />
      </section>

      <PublicFooter />
    </div>
  );
}
