import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { BANGLADESH_CENTER, BANGLADESH_BOUNDS, type LatLng } from "../utils/geo";

interface Props {
  /** When set, the backdrop flies to this point instead of showing all of Bangladesh. */
  focus: LatLng | null;
}

const COUNTRY_ZOOM = 7;
const FOCUS_ZOOM = 11;

/**
 * App-wide basemap: a real, non-interactive map of Bangladesh (not a static
 * image) so it reads as an actual map rather than decoration, and so it can
 * follow whatever area the visitor picks in "Nearby outages". Fixed to the
 * viewport with a slow scroll-tied drift for a parallax feel; a light scrim
 * on top keeps body text legible over the tile detail.
 */
export default function MapBackdrop({ focus }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  // Scroll-driven parallax offset is written straight to the DOM (below)
  // instead of through React state — this element re-renders on every
  // scroll frame otherwise, which is pure overhead for a transform string
  // no other part of the tree reads.
  const parallaxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [BANGLADESH_CENTER.lat, BANGLADESH_CENTER.lng],
      zoom: COUNTRY_ZOOM,
      minZoom: COUNTRY_ZOOM,
      maxBounds: BANGLADESH_BOUNDS,
      maxBoundsViscosity: 1.0,
      // Decorative only — every interactive control is off so it never
      // competes with the actual page scroll/content on top of it.
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
    });

    // Standard OSM tiles (free, keyless — CARTO's hosted styles now require
    // an API key and watermark unkeyed requests). The CSS filter on the
    // container below desaturates/lightens them into background texture
    // instead of a full-colour working map.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    L.control
      .attribution({ prefix: false, position: "bottomleft" })
      .addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>')
      .addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Follow the chosen area, or reset to the whole country when cleared.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (focus) {
      map.flyTo([focus.lat, focus.lng], FOCUS_ZOOM, { duration: 1.2 });
    } else {
      map.flyTo([BANGLADESH_CENTER.lat, BANGLADESH_CENTER.lng], COUNTRY_ZOOM, { duration: 1.2 });
    }
  }, [focus]);

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
        // Direct style write, not setState — this runs on every scroll
        // frame and must not trigger a React commit.
        const el = parallaxRef.current;
        if (el) el.style.transform = `translate3d(0, ${-(window.scrollY * 0.16)}px, 0)`;
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
      <div ref={parallaxRef} className="absolute inset-[-6%]" style={{ transform: "translate3d(0, 0, 0)", opacity: 0.55 }}>
        <div
          ref={containerRef}
          className="h-full w-full"
          style={{ filter: "grayscale(0.55) brightness(1.12) contrast(0.85) saturate(0.6)" }}
        />
      </div>
      {/* Vertical scrim: enough to keep text legible, light enough that the
          basemap still reads as a background rather than a flat field. */}
      <div className="absolute inset-0 bg-gradient-to-b from-ink-950/50 via-ink-950/65 to-ink-950/75" />
      {/* A faint accent bloom so the page isn't uniformly flat. */}
      <div className="absolute left-1/2 top-0 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-amber-500/10 blur-[120px]" />
    </div>
  );
}
