import { useEffect, useState } from "react";
import { BrandVideo } from "@/components/BrandVideo";
import introLandscape from "@/assets/qroll-intro-landscape.mp4";
import introPortrait from "@/assets/qroll-intro-video---portrait.mp4";

/**
 * QRoll launch screen — plays the branded intro video once per browser
 * session so the web app feels like a native app when opened.
 *
 * The overlay is rendered on the very first paint (server + client) so the
 * landing page never flashes before the intro. If the intro was already shown
 * this session it is removed synchronously on mount.
 */
export function SplashScreen() {
  const [show, setShow] = useState(true);
  const [ready, setReady] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("qroll_splash_seen")) {
      setShow(false);
      return;
    }
    sessionStorage.setItem("qroll_splash_seen", "1");
    setReady(true);
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
      {ready && (
        <BrandVideo
          landscape={introLandscape}
          portrait={introPortrait}
          autoStart
          loop={false}
          onEnded={finish}
          className="h-full w-full object-cover object-center"
        />
      )}
    </div>
  );
}
