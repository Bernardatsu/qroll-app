// Returns a URL origin that will be reachable from students' phones.
// The editor preview subdomain (id-preview--*.lovable.app) requires Lovable
// login, so QR codes pointing there send students to a login screen. When we
// detect the preview origin (or localhost/dev), fall back to the published
// domain instead so shared QR links open the public /check-in page.
const PUBLISHED_ORIGIN = "https://qroll-app.lovable.app";

export function getPublicOrigin(): string {
  if (typeof window === "undefined") return PUBLISHED_ORIGIN;
  const h = window.location.hostname;
  const isPreview =
    h.includes("id-preview--") || h === "localhost" || h.startsWith("127.") || h.endsWith(".local");
  return isPreview ? PUBLISHED_ORIGIN : window.location.origin;
}
