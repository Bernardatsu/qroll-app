import { useEffect, useState } from "react";
import { BrandVideo } from "@/components/BrandVideo";
import introLandscape from "@/assets/qroll-intro-landscape.mp4.asset.json";
import introPortrait from "@/assets/qroll-intro-video---portrait.mp4.asset.json";

/**
 * QRoll launch screen — plays the branded intro video once per browser
 * session so the web app feels like a native app when opened.
 */
export function SplashScreen() {
  const [show, setShow] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("qroll_splash_seen")) return;
    sessionStorage.setItem("qroll_splash_seen", "1");
    setShow(true);
    const t1 = setTimeout(() => setFading(true), 5000);
    const t2 = setTimeout(() => setShow(false), 5600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (!show) return null;

  const finish = () => {
    setFading(true);
    setTimeout(() => setShow(false), 600);
  };

  return (
    <div
      className={`fixed inset-0 z-100 bg-[#0f2544] transition-opacity duration-500 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
      aria-hidden="true"
    >
      <BrandVideo
        landscape={introLandscape.url}
        portrait={introPortrait.url}
        autoStart
        loop={false}
        onEnded={finish}
        className="h-full w-full object-cover object-center"
      />
    </div>
  );
}
