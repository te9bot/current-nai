import type { NewSuggestionInput, Suggestion } from "../types";

export async function fetchSuggestions(): Promise<Suggestion[]> {
  const res = await fetch("/api/suggestions");
  if (!res.ok) throw new Error(`Failed to fetch suggestions: ${res.status}`);
  const data = await res.json();
  return data.suggestions as Suggestion[];
}

export async function createSuggestion(input: NewSuggestionInput): Promise<Suggestion> {
  const res = await fetch("/api/suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to create suggestion: ${res.status}`);
  }
  const data = await res.json();
  return data.suggestion as Suggestion;
}
