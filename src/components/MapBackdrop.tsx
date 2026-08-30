import { useEffect, useState } from "react";

/**
 * App-wide basemap. Fixed to the viewport so it stays put while the page
 * scrolls, with a slow drift tied to scroll position for a parallax feel.
 * Scrims on top keep body text legible over the map detail.
 */
export default function MapBackdrop() {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    // Parallax is a desktop nicety; skip the scroll work when the user has
    // asked for reduced motion or is on a touch device where it costs more
    // than it adds.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (reduced || coarse) return;

    let frame: number | null = null;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        // Move the map a fraction of the scroll distance so it lags behind.
        setOffset(window.scrollY * 0.12);
        frame = null;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        className="absolute inset-[-10%] bg-cover bg-center opacity-40"
        style={{
          backgroundImage: "url(/map-dark.png)",
          transform: `translate3d(0, ${-offset}px, 0)`,
        }}
      />
      {/* Vertical scrim: enough to keep text legible, light enough that the
          basemap still reads as a background rather than a black field. */}
      <div className="absolute inset-0 bg-gradient-to-b from-ink-950/55 via-ink-950/70 to-ink-950/80" />
      {/* A faint accent bloom so the page isn't uniformly flat. */}
      <div className="absolute left-1/2 top-0 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-leaf-500/10 blur-[120px]" />
    </div>
  );
}
