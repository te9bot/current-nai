import { useEffect, useState } from "react";
import type { TFunction } from "i18next";

export function useNowTick(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function formatRelativeTime(createdAt: string, now: number, t: TFunction): string {
  const then = new Date(createdAt).getTime();
  const diffMs = Math.max(0, now - then);
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return t("relativeTime.justNow");
  if (minutes < 60) return t("relativeTime.minutesAgo", { count: minutes });
  if (hours < 24) return t("relativeTime.hoursAgo", { count: hours });
  return t("relativeTime.daysAgo", { count: days });
}

/** "2h 15m" / "45m" — compact outage length for cards and stat tiles. */
export function formatDuration(minutes: number, t: TFunction): string {
  if (!minutes || minutes < 1) return t("duration.lessThanMinute");
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return t("duration.minutes", { count: m });
  if (m === 0) return t("duration.hours", { count: h });
  return t("duration.hoursMinutes", { hours: h, minutes: m });
}

/** Hours with one decimal, for aggregate totals ("12.5h"). */
export function formatHours(minutes: number, t: TFunction): string {
  return t("duration.hoursDecimal", { value: (minutes / 60).toFixed(1) });
}

export function toLocalizedDigits(value: string, lang: string): string {
  if (!lang.startsWith("bn")) return value;
  const bnDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  return value.replace(/[0-9]/g, (d) => bnDigits[Number(d)]);
}
