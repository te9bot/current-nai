const MY_REPORTS_KEY = "current-nai-my-reports";

/** Report ids this browser has submitted, so it can offer to update them later. */
export function readMyReports(): Set<number> {
  try {
    const raw = localStorage.getItem(MY_REPORTS_KEY);
    return new Set<number>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function rememberMyReport(id: number) {
  try {
    const next = readMyReports();
    next.add(id);
    localStorage.setItem(MY_REPORTS_KEY, JSON.stringify([...next]));
  } catch {
    /* storage unavailable (private mode) — the report just won't be tracked */
  }
}
