import raw from "../../data/providers.json";
import type { Provider } from "../types";

export const PROVIDERS = raw as Provider[];

export function getProvider(providerId: string | undefined | null): Provider | undefined {
  if (!providerId) return undefined;
  return PROVIDERS.find((p) => p.id === providerId);
}

/** Short label (e.g. "DPDC" / "ডিপিডিসি") for badges and table rows. */
export function providerName(providerId: string | undefined | null, lang: string): string {
  const provider = getProvider(providerId);
  if (!provider) return "";
  return lang.startsWith("bn") ? provider.bn : provider.en;
}

/** Expanded name for tooltips and the picker. */
export function providerFullName(providerId: string | undefined | null, lang: string): string {
  const provider = getProvider(providerId);
  if (!provider) return "";
  return lang.startsWith("bn") ? provider.fullBn : provider.fullEn;
}
