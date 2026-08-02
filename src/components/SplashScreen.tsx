import { useEffect, useState } from "react";
import qrollSplash from "@/assets/qroll-splash.png.asset.json";

/**
 * QRoll launch screen — shown once per browser session so the web app
 * feels like a native app when opened.
 */
export function SplashScreen() {
  const [show, setShow] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("qroll_splash_seen")) return;
    sessionStorage.setItem("qroll_splash_seen", "1");
    setShow(true);
    const t1 = setTimeout(() => setFading(true), 1500);
    const t2 = setTimeout(() => setShow(false), 2100);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      className={`fixed inset-0 z-100 bg-knust-gradient transition-opacity duration-500 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
      aria-hidden="true"
    >
      <img
        src={qrollSplash.url}
        alt=""
        className="h-full w-full object-cover object-center animate-in fade-in zoom-in-95 duration-700"
      />
      <div className="absolute inset-x-0 bottom-16 flex justify-center">
        <div className="h-1 w-32 overflow-hidden rounded-full bg-white/20">
          <div className="h-full w-1/2 animate-[splashbar_1.4s_ease-in-out_infinite] rounded-full bg-white/80" />
        </div>
      </div>
    </div>
  );
}
