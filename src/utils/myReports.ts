const MY_REPORTS_KEY = "current-nai-my-reports";

/** Report ids this browser has submitted, mapped to the per-report resolve
 *  token returned at creation time — required server-side to prove ownership
 *  when resolving later. */
export function readMyReports(): Map<number, string> {
  try {
    const raw = localStorage.getItem(MY_REPORTS_KEY);
    const entries = raw ? (JSON.parse(raw) as [number, string][]) : [];
    return new Map(entries);
  } catch {
    return new Map();
  }
}

export function rememberMyReport(id: number, resolveToken: string) {
  try {
    const next = readMyReports();
    next.set(id, resolveToken);
    localStorage.setItem(MY_REPORTS_KEY, JSON.stringify([...next.entries()]));
  } catch {
    /* storage unavailable (private mode) — the report just won't be tracked */
  }
}
