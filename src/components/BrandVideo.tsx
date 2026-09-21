import { useEffect, useRef, useState } from "react";

/**
 * Autoplaying, control-free brand video.
 * Picks the landscape source on laptops/desktops and the portrait source on
 * phones & tablets. Plays automatically when scrolled into view (or hovered)
 * and pauses when it leaves the viewport.
 */
export function BrandVideo({
  landscape,
  portrait,
  className = "",
  loop = true,
  onEnded,
  autoStart = false,
}: {
  landscape: string;
  portrait: string;
  className?: string;
  loop?: boolean;
  onEnded?: () => void;
  autoStart?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [portraitMode, setPortraitMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return window.matchMedia("(max-width: 1023px)").matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 1023px)");
    const apply = () => {
      setPortraitMode((prev) => (prev !== mql.matches ? mql.matches : prev));
    };
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);

  const attemptPlay = () => {
    const el = ref.current;
    if (!el) return;
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;

    const promise = el.play();
    if (promise !== undefined) {
      promise.catch((err) => {
        console.warn("[BrandVideo] Autoplay blocked or deferred:", err);
        // If autoplay was blocked by browser security policy, resume on first user interaction
        const triggerPlay = () => {
          if (el) {
            el.muted = true;
            void el.play().catch(() => {});
          }
          window.removeEventListener("click", triggerPlay);
          window.removeEventListener("touchstart", triggerPlay);
          window.removeEventListener("keydown", triggerPlay);
        };
        window.addEventListener("click", triggerPlay, { once: true });
        window.addEventListener("touchstart", triggerPlay, { once: true });
        window.addEventListener("keydown", triggerPlay, { once: true });
      });
    }
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;
    el.setAttribute("muted", "");
    el.setAttribute("playsinline", "");
    el.setAttribute("webkit-playsinline", "true");

    if (autoStart) {
      attemptPlay();
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            attemptPlay();
          } else {
            el.pause();
          }
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [autoStart, portraitMode]);

  return (
    <video
      ref={ref}
      key={portraitMode ? "portrait-src" : "landscape-src"}
      src={portraitMode ? portrait : landscape}
      muted
      autoPlay
      loop={loop}
      playsInline
      preload="auto"
      onEnded={onEnded}
      onCanPlay={() => {
        if (autoStart && ref.current && ref.current.paused) {
          attemptPlay();
        }
      }}
      onLoadedData={() => {
        if (autoStart && ref.current && ref.current.paused) {
          attemptPlay();
        }
      }}
      onClick={() => {
        if (ref.current) {
          if (ref.current.paused) {
            attemptPlay();
          }
        }
      }}
      onMouseEnter={() => {
        if (ref.current && ref.current.paused && !autoStart) {
          attemptPlay();
        }
      }}
      controls={false}
      disablePictureInPicture
      className={className}
    />
  );
}
