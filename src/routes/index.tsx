import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { QrCode, ShieldCheck, BarChart3, CalendarCheck, PlayCircle } from "lucide-react";
import { useEffect } from "react";
import { firebaseAuth } from "@/integrations/firebase/config";
import qrollLogo from "@/assets/qroll-logo.png";
import heroImage from "@/assets/9315935.webp";
import promoLandscape from "@/assets/qroll-promo-landscape.mp4";
import promoPortrait from "@/assets/qroll-promo-portrait.mp4";
import { BrandVideo } from "@/components/BrandVideo";
import { PublicFooter } from "@/components/PublicFooter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "QRoll — QR Attendance Made Easy" },
      {
        name: "description",
        content:
          "QRoll is a secure QR attendance system for universities. Scan. Verify. Attend. Instant reports, geofenced self check-in, exportable records.",
      },
      { property: "og:title", content: "QRoll — QR Attendance Made Easy" },
      {
        property: "og:description",
        content:
          "QRoll is a secure QR attendance system for universities. Scan. Verify. Attend. Instant reports, geofenced self check-in, exportable records.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "QRoll — QR Attendance Made Easy" },
      {
        name: "twitter:description",
        content:
          "QRoll is a secure QR attendance system for universities. Scan. Verify. Attend. Instant reports, geofenced self check-in, exportable records.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  useEffect(() => {
    if (firebaseAuth.currentUser) {
      navigate({ to: "/dashboard" });
    }
  }, [navigate]);
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 py-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <img src={qrollLogo} alt="QRoll logo" className="h-9 w-auto shrink-0 object-contain" />
            <div className="leading-tight min-w-0">
              <div className="font-bold truncate">QRoll</div>
              <div className="text-xs text-muted-foreground truncate">Scan. Verify. Attend.</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to={"/student" as string}>
              <Button variant="outline">Student page</Button>
            </Link>
            <Link to={"/auth" as string}>
              <Button>Sign in</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="relative bg-knust-gradient text-primary-foreground overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <img
            src={heroImage}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-primary/35" />
          <div className="absolute inset-0 bg-linear-to-r from-primary/45 via-primary/25 to-primary/10" />
        </div>

        <div className="relative max-w-6xl mx-auto px-6 py-20 md:py-28 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="text-gold uppercase tracking-widest text-xs font-semibold mb-3">
              Scan. Verify. Attend.
            </div>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight drop-shadow-md">
              QRoll — attendance made easy for every class, event, and gathering.
            </h1>
            <p className="mt-5 text-primary-foreground/90 text-lg max-w-lg drop-shadow">
              Secure UUID QR codes, geofenced self check-in, live dashboards, and Excel & PDF
              reports.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to={"/auth" as string}>
                <Button size="lg" className="bg-gold text-gold-foreground hover:bg-gold/90">
                  Get started
                </Button>
              </Link>
              <Link to={"/manual" as string}>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/40 bg-white/0 text-primary-foreground hover:bg-white/10"
                >
                  Read the manual
                </Button>
              </Link>
              <Link to={"/student" as string}>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/40 bg-white/0 text-primary-foreground hover:bg-white/10"
                >
                  Student page
                </Button>
              </Link>
            </div>
          </div>
          <div className="hidden md:grid grid-cols-2 gap-4">
            {[
              { i: QrCode, t: "Secure QR", d: "Random UUIDs — no names embedded." },
              { i: ShieldCheck, t: "Role-based", d: "Admins, organisers, assistants." },
              { i: BarChart3, t: "Reports", d: "Excel, CSV, PDF exports." },
              { i: CalendarCheck, t: "Any occasion", d: "Classes, events, meetings." },
            ].map((f) => (
              <div
                key={f.t}
                className="rounded-xl bg-white/15 backdrop-blur p-5 border border-white/20"
              >
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
        <p className="text-sm text-muted-foreground mt-1">
          A quick look at how attendance is captured in seconds.
        </p>
        <div className="mt-5 rounded-xl border shadow-sm bg-black overflow-hidden flex justify-center">
          <BrandVideo
            landscape={promoLandscape}
            portrait={promoPortrait}
            className="w-full max-h-[60vh] lg:max-h-[70vh] object-contain"
          />
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
