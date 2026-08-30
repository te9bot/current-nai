import type { CSSProperties } from "react";
import clsx from "../utils/clsx";

/** A pulsing placeholder block, shaped via className (e.g. "h-4 w-20") or style. */
export default function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={clsx("animate-pulse rounded-sm bg-black/10", className)} style={style} aria-hidden />;
}
