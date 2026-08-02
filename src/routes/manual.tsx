import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { X, Download } from "lucide-react";

export const Route = createFileRoute("/manual")({
  head: () => ({
    meta: [
      { title: "App Manual — QRoll" },
      { name: "description", content: "Step-by-step QRoll user manual for lecturers, admins, and students." },
      { property: "og:title", content: "QRoll App Manual" },
      { property: "og:description", content: "Step-by-step QRoll user manual for lecturers, admins, and students." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "QRoll App Manual" },
      { name: "twitter:description", content: "Step-by-step QRoll user manual." },
    ],
  }),
  component: ManualPage,
});

function ManualPage() {
  const router = useRouter();
  const close = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
    else router.navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">QRoll App Manual</div>
          <div className="truncate text-xs text-muted-foreground">Full user guide (PDF)</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <a href="/app-manual.pdf" download>
            <Button variant="outline" size="sm">
              <Download className="size-4 sm:mr-1" />
              <span className="hidden sm:inline">Download</span>
            </Button>
          </a>
          <Button size="sm" onClick={close} aria-label="Close manual">
            <X className="size-4 sm:mr-1" />
            <span className="hidden sm:inline">Close</span>
          </Button>
        </div>
      </header>
      <object data="/app-manual.pdf" type="application/pdf" className="flex-1 w-full min-h-[70vh]">
        <div className="p-6 text-center text-sm text-muted-foreground">
          Your browser can't display PDFs inline.{" "}
          <a href="/app-manual.pdf" className="text-primary underline" target="_blank" rel="noreferrer">
            Open the manual
          </a>
          .
        </div>
      </object>
    </div>
  );
}
