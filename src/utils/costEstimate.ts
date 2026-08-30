import type { LedgerRow } from "../types";

/**
 * Rough, clearly-labelled estimate of the money represented by reported
 * load-shedding time — there's no real consumption data behind community
 * reports, so this treats every reported outage-hour as one unserved
 * household-equivalent load, priced at its own distributor's approximate
 * average retail tariff rather than one flat rate for the whole country.
 *
 * These are maintained, hand-entered reference values (approximate
 * BERC-approved average retail tariffs), not a live feed — there's no stable
 * public API for Bangladeshi distributor tariffs to poll at request time, and
 * scraping utility sites at runtime would be fragile and unreliable. Update
 * this table by hand when official tariffs change.
 */
export const ASSUMED_LOAD_KW = 1;

export const TARIFF_BDT_PER_KWH: Record<string, number> = {
  dpdc: 8.0,
  desco: 8.0,
  bpdb: 7.5,
  palli_bidyut: 7.8,
  nesco: 7.6,
  wzpdcl: 7.6,
  unknown: 7.8,
};

export function tariffFor(providerId: string): number {
  return TARIFF_BDT_PER_KWH[providerId] ?? TARIFF_BDT_PER_KWH.unknown;
}

/** Sums each provider's reported outage-minutes against that provider's own tariff. */
export function estimatedLossTaka(byProvider: LedgerRow[]): number {
  return byProvider.reduce((sum, p) => {
    const hours = p.minutes / 60;
    return sum + hours * ASSUMED_LOAD_KW * tariffFor(p.id);
  }, 0);
}

/** "৳12,345" — grouped digits, Bangla numerals swapped in for bn locale. */
export function formatTaka(amount: number, lang: string): string {
  const grouped = Math.round(amount).toLocaleString("en-US");
  if (!lang.startsWith("bn")) return `৳${grouped}`;
  const bnDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  return `৳${grouped.replace(/[0-9]/g, (d) => bnDigits[Number(d)])}`;
}
