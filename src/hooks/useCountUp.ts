import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../utils/motion";

/**
 * Ramps a displayed number from 0 to `target` once on mount (not on every
 * re-render when `target` changes from polling), for a livelier landing page.
 */
export function useCountUp(target: number, durationMs = 650): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (!isFirstRender.current) {
      // A later target change (e.g. from polling) tracks live instead of re-animating.
      setValue(target);
      return;
    }
    isFirstRender.current = false;

    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }

    const start = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return value;
}
