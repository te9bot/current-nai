import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { prefersReducedMotion } from "../utils/motion";

/**
 * Fades a panel up into place the first time it scrolls into view. Skipped
 * entirely under prefers-reduced-motion, same as the map's parallax effect.
 */
export default function Reveal({ children }: PropsWithChildren) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(() => prefersReducedMotion());

  useEffect(() => {
    if (prefersReducedMotion() || !ref.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={visible ? "animate-fade-up" : "opacity-0"}>
      {children}
    </div>
  );
}
