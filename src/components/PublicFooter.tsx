import { Link } from "@tanstack/react-router";
import { BookOpen, FileText, Shield } from "lucide-react";

export function PublicFooter() {
  return (
    <footer className="border-t bg-muted/30 mt-auto">
      <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
        <div className="text-muted-foreground text-center sm:text-left">
          © {new Date().getFullYear()} QRoll · Attendance Made Easy
        </div>
        <nav className="flex items-center gap-1 flex-wrap justify-center">
          <Link
            to={"/manual" as string}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-background hover:text-primary transition-colors font-medium"
          >
            <BookOpen className="size-4" /> App Manual
          </Link>
          <Link
            to={"/terms" as string}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-background hover:text-primary transition-colors font-medium"
          >
            <FileText className="size-4" /> Terms
          </Link>
          <Link
            to={"/privacy" as string}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-background hover:text-primary transition-colors font-medium"
          >
            <Shield className="size-4" /> Privacy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
