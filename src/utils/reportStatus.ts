import type { Report } from "../types";

/**
 * Whether the area a report describes currently has power. `status` on the
 * row itself stays "load_shedding" forever, even after the reporter marks it
 * resolved — the ledger/stats endpoints need that historical outage to keep
 * counting toward totals. Only `endTime` flips from null to a timestamp.
 * Every place that colors a badge/pin/dot by status must read this derived
 * value instead of `report.status` directly, or a resolved outage keeps
 * showing as an active one everywhere except the reporter's own browser.
 */
export function isCurrentlyPowerOn(report: Report): boolean {
  return report.status === "power_on" || (report.status === "load_shedding" && Boolean(report.endTime));
}
