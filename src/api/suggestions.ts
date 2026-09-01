import type { NewSuggestionInput } from "../types";

export async function createSuggestion(input: NewSuggestionInput): Promise<void> {
  const res = await fetch("/api/suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to create suggestion: ${res.status}`);
  }
}
