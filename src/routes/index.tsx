import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { QrCode, ShieldCheck, BarChart3, GraduationCap } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KNUST Attendance — QR-based Attendance for Lectures" },
      { name: "description", content: "Official QR attendance management system for Kwame Nkrumah University of Science and Technology. Secure, instant, exportable." },
      { property: "og:title", content: "KNUST Attendance Management" },
      { property: "og:description", content: "Secure QR attendance for KNUST lectures, labs, and tutorials." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-knust-gradient grid place-items-center font-bold text-primary-foreground">K</div>
            <div className="leading-tight">
              <div className="font-bold">KNUST</div>
              <div className="text-xs text-muted-foreground">Attendance System</div>
            </div>
          </div>
          <Link to={"/auth" as string}><Button>Sign in</Button></Link>
        </div>
      </header>

      <section className="bg-knust-gradient text-primary-foreground">
        <div className="max-w-6xl mx-auto px-6 py-20 md:py-28 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="text-gold uppercase tracking-widest text-xs font-semibold mb-3">Kwame Nkrumah University of Science and Technology</div>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight">QR Attendance for every lecture, lab, and tutorial.</h1>
            <p className="mt-5 text-white/85 text-lg max-w-lg">Secure UUID-based student QR codes. Two-scan check-in/out. Real-time dashboards. Excel & PDF reports.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to={"/auth" as string}><Button size="lg" className="bg-gold text-gold-foreground hover:bg-gold/90">Get started</Button></Link>
              <Link to={"/auth" as string}><Button size="lg" variant="outline" className="border-white/30 text-white bg-white/0 hover:bg-white/10">Sign in</Button></Link>
            </div>
          </div>
          <div className="hidden md:grid grid-cols-2 gap-4">
            {[
              { i: QrCode, t: "Secure QR", d: "Random UUIDs — no names embedded." },
              { i: ShieldCheck, t: "Role-based", d: "Admins, lecturers, TAs." },
              { i: BarChart3, t: "Reports", d: "Excel, CSV, PDF exports." },
              { i: GraduationCap, t: "All levels", d: "100, 200, 300, 400." },
            ].map((f) => (
              <div key={f.t} className="rounded-xl bg-white/10 backdrop-blur p-5 border border-white/15">
                <f.i className="size-6 text-gold mb-3" />
                <div className="font-semibold">{f.t}</div>
                <div className="text-sm text-white/75">{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t mt-auto">
        <div className="max-w-6xl mx-auto px-6 py-6 text-sm text-muted-foreground flex justify-between flex-wrap">
          <div>© {new Date().getFullYear()} KNUST Attendance</div>
          <div>Built with security and accuracy in mind</div>
        </div>
      </footer>
    </div>
  );
}
