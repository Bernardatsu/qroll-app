import { useEffect, useState } from "react";
import { BrandVideo } from "@/components/BrandVideo";
import introLandscape from "@/assets/qroll-intro-landscape.mp4";
import introPortrait from "@/assets/qroll-intro-video---portrait.mp4";

/**
 * QRoll launch screen — plays the branded intro video automatically on app load.
 * Fades out smoothly upon video completion.
 */
export function SplashScreen() {
  const [show, setShow] = useState(true);
  const [fading, setFading] = useState(false);

  const finish = () => {
    setFading(true);
    setTimeout(() => {
      setShow(false);
      setFading(false);
    }, 500);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Fallback timer in case video media fails to decode or load
    const fallbackTimer = setTimeout(() => {
      finish();
    }, 8000);

    return () => {
      clearTimeout(fallbackTimer);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      className={`fixed inset-0 z-100 bg-[#071326] transition-opacity duration-500 overflow-hidden select-none ${
        fading ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      aria-hidden={!show}
    >
      <BrandVideo
        landscape={introLandscape}
        portrait={introPortrait}
        autoStart
        loop={false}
        onEnded={finish}
        className="h-full w-full object-cover object-center"
      />
    </div>
  );
}
