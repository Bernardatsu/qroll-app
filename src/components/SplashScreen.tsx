import { useEffect, useState } from "react";
import Lottie from "lottie-react";
import loadingAnim from "@/assets/qroll-loading.json.asset.json";
import qrollLogo from "@/assets/qroll-icon.png.asset.json";

/**
 * QRoll launch screen — shown once per browser session so the web app
 * feels like a native app when opened.
 */
export function SplashScreen() {
  const [show, setShow] = useState(false);
  const [fading, setFading] = useState(false);
  const [anim, setAnim] = useState<unknown>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("qroll_splash_seen")) return;
    sessionStorage.setItem("qroll_splash_seen", "1");
    setShow(true);
    fetch(loadingAnim.url)
      .then((r) => r.json())
      .then(setAnim)
      .catch(() => setAnim(null));
    const t1 = setTimeout(() => setFading(true), 1900);
    const t2 = setTimeout(() => setShow(false), 2500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-knust-gradient transition-opacity duration-500 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
      aria-hidden="true"
    >
      <div className="size-40">
        {anim ? (
          <Lottie animationData={anim as object} loop autoplay />
        ) : (
          <img src={qrollLogo.url} alt="" className="size-40 rounded-3xl" />
        )}
      </div>
      <div className="mt-4 text-3xl font-bold tracking-tight text-primary-foreground">QRoll</div>
      <div className="mt-1 text-sm text-primary-foreground/70">Scan. Verify. Attend.</div>
    </div>
  );
}
