import { useEffect, useRef } from "react";

/**
 * Autoplaying, control-free brand video.
 * Picks the landscape source on laptops/desktops and the portrait source on
 * mobile mode and mobile devices.
 * Uses native <source media="..."> elements to ensure 100% hydration fidelity
 * across server-side rendering and client devices.
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
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 1023px), (orientation: portrait)");

    const handleChange = () => {
      if (ref.current) {
        ref.current.load();
        attemptPlay();
      }
    };

    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

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
  }, [autoStart]);

  return (
    <video
      ref={ref}
      suppressHydrationWarning
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
        if (ref.current && ref.current.paused) {
          attemptPlay();
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
    >
      {/* Mobile devices and mobile viewports (< 1024px or portrait orientation) */}
      <source
        src={portrait}
        media="(max-width: 1023px), (orientation: portrait)"
        type="video/mp4"
      />
      {/* Desktops and laptops (>= 1024px wide screens) */}
      <source
        src={landscape}
        media="(min-width: 1024px) and (orientation: landscape)"
        type="video/mp4"
      />
      {/* Fallback default */}
      <source src={landscape} type="video/mp4" />
    </video>
  );
}
