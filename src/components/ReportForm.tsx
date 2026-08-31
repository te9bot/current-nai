import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  DIVISIONS,
  getDistricts,
  getAreas,
  getDivision,
  getDistrict,
  localizedName,
  matchDivision,
  matchDistrictFromCandidates,
  matchAreaFromCandidates,
} from "../data/locations";
import { PROVIDERS } from "../data/providers";
import { createReport } from "../api/reports";
import type { NewReportInput, Report } from "../types";
import { XIcon, AlertIcon, MapPinIcon, LocateIcon, LoaderIcon } from "./icons";
import LocationPicker, { type PickedLocation } from "./LocationPicker";
import { districtCoords } from "../utils/geo";
import { getCurrentPositionWithFallback } from "../utils/geolocation";
import clsx from "../utils/clsx";

type AutofillStatus = "idle" | "locating" | "error" | "partial";

// Plain fetch() has no built-in timeout — on a slow or flaky mobile
// connection it can hang indefinitely with the button stuck on "Detecting..."
// forever instead of ever reaching the error state. AbortSignal.timeout()
// guarantees this rejects (and the surrounding try/catch shows the existing
// error message) instead of waiting forever.
function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
}

function isValidLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

interface Props {
  onClose: () => void;
  onCreated: (report: Report) => void;
}

interface FormErrors {
  divisionId?: string;
  districtId?: string;
  areaId?: string;
  outageDate?: string;
  startTime?: string;
  endTime?: string;
}

// Local calendar date, not UTC — toISOString() would roll over to the next day
// for evening reports in Bangladesh (UTC+6) and mis-date the outage.
const today = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export default function ReportForm({ onClose, onCreated }: Props) {
  const { t, i18n } = useTranslation();
  const [divisionId, setDivisionId] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [landmark, setLandmark] = useState("");
  const [providerId, setProviderId] = useState("unknown");
  const [outageDate, setOutageDate] = useState(today());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [note, setNote] = useState("");
  const [location, setLocation] = useState<PickedLocation | null>(null);
  // True once the reporter has explicitly used GPS or tapped/dragged the pin
  // themselves — from then on their address text no longer silently moves
  // it, even if they keep editing the landmark field.
  const [pinConfirmedByUser, setPinConfirmedByUser] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [autofillStatus, setAutofillStatus] = useState<AutofillStatus>("idle");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  // The division/district cascade normally clears the levels below whenever
  // a higher one changes (manual re-selection). The location auto-fill sets
  // all three at once from a single GPS+reverse-geocode read, so these hold
  // the exact value each cascade-reset effect should let through this one
  // time — a value comparison, not a time-limited "pause" flag. A
  // setTimeout-based pause isn't ordered relative to React's own effect
  // scheduling, so on a slower device the "resume" timeout can fire before
  // the guarded effect actually runs, wiping out the very values auto-fill
  // just set with no error shown (autofillStatus already reached its
  // success state before the wipe). Each ref is consumed — set back to null
  // — by the one effect it exists for, so it can't accidentally suppress a
  // later, unrelated manual reset.
  const expectedDistrictAfterAutofillRef = useRef<string | null>(null);
  const expectedAreaAfterAutofillRef = useRef<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    if (expectedDistrictAfterAutofillRef.current !== null && expectedDistrictAfterAutofillRef.current === districtId) {
      expectedDistrictAfterAutofillRef.current = null;
      return;
    }
    setDistrictId("");
  }, [divisionId]);

  useEffect(() => {
    if (expectedAreaAfterAutofillRef.current !== null && expectedAreaAfterAutofillRef.current === areaId) {
      expectedAreaAfterAutofillRef.current = null;
      return;
    }
    setAreaId("");
  }, [districtId]);

  // Turning a typed house/road number into an actual pin: the area dropdown
  // alone only gets a district-level centroid, nowhere near exact — this
  // geocodes the full address (landmark + area + district + division) so
  // "Road 5, House 10" in Dhanmondi lands on that street, not just somewhere
  // in Dhanmondi. Debounced so it fires once typing pauses, not per
  // keystroke, and skipped entirely once the reporter has set the pin
  // themselves (GPS or a direct map tap always wins).
  useEffect(() => {
    if (pinConfirmedByUser) return;
    const trimmed = landmark.trim();
    if (!areaId || trimmed.length < 3) return;

    const area = getAreas(divisionId, districtId).find((a) => a.id === areaId);
    const query = [
      trimmed,
      area ? localizedName(area, i18n.language) : "",
      localizedName(getDistrict(divisionId, districtId), i18n.language),
      localizedName(getDivision(divisionId), i18n.language),
      "Bangladesh",
    ]
      .filter(Boolean)
      .join(", ");

    const handle = setTimeout(async () => {
      setGeocoding(true);
      try {
        const res = await fetchWithTimeout(`/api/geocode?q=${encodeURIComponent(query)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.found && isValidLatLng(data.lat, data.lng)) {
          setLocation({ lat: data.lat, lng: data.lng, accuracy: null, source: "manual" });
        }
      } catch {
        // A failed lookup just means no pin update — never a fabricated one.
      } finally {
        setGeocoding(false);
      }
    }, 700);

    return () => clearTimeout(handle);
  }, [landmark, areaId, districtId, divisionId, pinConfirmedByUser, i18n.language]);

  function handlePickerChange(next: PickedLocation | null) {
    setPinConfirmedByUser(true);
    setLocation(next);
  }

  // One tap: GPS fix -> reverse-geocode -> match against this app's own
  // division/district/area list -> fill all three and drop the exact pin
  // with the same coordinates. Nominatim's admin boundaries and suburb
  // names don't line up 1:1 with this app's thana-level area list, so an
  // area match often won't be found even when division/district are —
  // that's surfaced as a "partial" status, never guessed at.
  async function handleAutofillFromLocation() {
    setAutofillStatus("locating");
    try {
      const { lat, lng, accuracy } = await getCurrentPositionWithFallback();
      if (!isValidLatLng(lat, lng)) {
        setAutofillStatus("error");
        return;
      }

      const res = await fetchWithTimeout(`/api/reverse-geocode?lat=${lat}&lng=${lng}`);
      if (!res.ok) throw new Error("reverse geocode request failed");
      const data = await res.json();
      const matchedDivision = data.found ? matchDivision(data.division) : undefined;
      if (!matchedDivision) {
        setAutofillStatus("error");
        return;
      }
      const matchedDistrict = matchDistrictFromCandidates(matchedDivision, data.districtCandidates ?? []);
      const matchedArea = matchedDistrict
        ? matchAreaFromCandidates(matchedDistrict, data.areaCandidates ?? [])
        : undefined;

      expectedDistrictAfterAutofillRef.current = matchedDistrict?.id ?? "";
      expectedAreaAfterAutofillRef.current = matchedArea?.id ?? "";
      setDivisionId(matchedDivision.id);
      setDistrictId(matchedDistrict?.id ?? "");
      setAreaId(matchedArea?.id ?? "");

      setPinConfirmedByUser(true);
      setLocation({ lat, lng, accuracy, source: "gps" });

      setAutofillStatus(matchedArea ? "idle" : "partial");
    } catch {
      setAutofillStatus("error");
    }
  }

  function validate(): boolean {
    const next: FormErrors = {};
    if (!divisionId) next.divisionId = t("validation.divisionRequired");
    if (!districtId) next.districtId = t("validation.districtRequired");
    if (!areaId) next.areaId = t("validation.areaRequired");
    if (!outageDate) next.outageDate = t("validation.dateRequired");
    if (!startTime) next.startTime = t("validation.startTimeRequired");
    if (endTime && startTime && endTime <= startTime) next.endTime = t("validation.endTimeBeforeStart");
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError(false);

    const area = areas.find((a) => a.id === areaId);
    const areaLabel = area ? localizedName(area, i18n.language) : "";
    const trimmedLandmark = landmark.trim();

    // Area is administrative context, not the report's exact position — only
    // a GPS fix or a manually placed pin (validated here, never fabricated)
    // is trustworthy enough to send as the actual coordinates.
    const hasValidLocation = location && isValidLatLng(location.lat, location.lng);

    const input: NewReportInput = {
      divisionId,
      districtId,
      area: trimmedLandmark ? `${areaLabel} — ${trimmedLandmark}` : areaLabel,
      areaId,
      landmark: trimmedLandmark || null,
      providerId,
      status: "load_shedding",
      outageDate,
      startTime,
      endTime: endTime || null,
      note: note.trim(),
      latitude: hasValidLocation ? location.lat : null,
      longitude: hasValidLocation ? location.lng : null,
      locationAccuracy: hasValidLocation && location.accuracy ? location.accuracy : null,
      locationSource: hasValidLocation ? location.source : null,
    };

    try {
      const { report } = await createReport(input);
      onCreated(report);
      setSuccess(true);
      setTimeout(onClose, 1100);
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }

  const districts = getDistricts(divisionId);
  const areas = getAreas(divisionId, districtId);
  // GPS failure must never block manually placing an exact position: once an
  // area is picked, or the auto-fill attempt has resolved (fully, partially,
  // or failed outright), the map is available for a direct tap — it no
  // longer waits on area selection alone.
  const showLocationPicker =
    Boolean(areaId) || autofillStatus === "error" || autofillStatus === "partial" || Boolean(location);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/35 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-xl border border-black/10 bg-ink-900/95 shadow-sheet backdrop-blur sm:max-w-lg sm:rounded-xl sm:shadow-callout"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-form-heading"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/8 bg-ink-900/95 px-5 py-4 backdrop-blur">
          <div>
            <h2 id="report-form-heading" className="font-display text-lg font-bold text-grey-900">
              {t("form.heading")}
            </h2>
            <p className="text-xs text-grey-500">{t("form.subheading")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("form.close")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-grey-400 hover:bg-black/10 hover:text-grey-900"
          >
            <XIcon width={18} height={18} />
          </button>
        </div>

        {success ? (
          <div className="px-5 py-10 text-center">
            <p className="font-display text-base font-semibold text-leaf-400">{t("form.success")}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
            <div className="rounded-md border border-black/10 bg-ink-800/60 p-3">
              <button
                type="button"
                onClick={handleAutofillFromLocation}
                disabled={autofillStatus === "locating"}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-black/10 bg-ink-800 text-sm font-semibold text-grey-900 transition-colors duration-fast ease-standard hover:border-black/30 disabled:opacity-60"
              >
                {autofillStatus === "locating" ? (
                  <LoaderIcon width={16} height={16} className="animate-spin" />
                ) : (
                  <LocateIcon width={16} height={16} />
                )}
                {autofillStatus === "locating" ? t("form.locating") : t("form.useMyLocationAutofill")}
              </button>
              <p className="mt-1.5 text-[11px] text-grey-600">{t("form.useMyLocationAutofillHelp")}</p>
              {autofillStatus === "error" && (
                <p className="mt-1.5 text-[11px] text-rust-400">{t("form.autofillGpsUnavailable")}</p>
              )}
              {autofillStatus === "partial" && (
                <p className="mt-1.5 text-[11px] text-amber-500">{t("form.autofillPartialMatch")}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="report-division" className="mb-1.5 block text-xs font-semibold text-grey-400">
                  {t("form.division")}
                </label>
                <select
                  id="report-division"
                  value={divisionId}
                  onChange={(e) => setDivisionId(e.target.value)}
                  className={clsx(
                    "h-11 w-full rounded-md border bg-ink-800 px-3 text-sm text-grey-900 outline-none transition-colors duration-fast",
                    errors.divisionId ? "border-rust-500" : "border-black/10 focus:border-black/30"
                  )}
                >
                  <option value="">{t("form.divisionPlaceholder")}</option>
                  {DIVISIONS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {localizedName(d, i18n.language)}
                    </option>
                  ))}
                </select>
                {errors.divisionId && <p className="mt-1 text-[11px] text-rust-400">{errors.divisionId}</p>}
              </div>

              <div>
                <label htmlFor="report-district" className="mb-1.5 block text-xs font-semibold text-grey-400">
                  {t("form.district")}
                </label>
                <select
                  id="report-district"
                  value={districtId}
                  onChange={(e) => setDistrictId(e.target.value)}
                  disabled={!divisionId}
                  className={clsx(
                    "h-11 w-full rounded-md border bg-ink-800 px-3 text-sm text-grey-900 outline-none transition-colors duration-fast disabled:opacity-40",
                    errors.districtId ? "border-rust-500" : "border-black/10 focus:border-black/30"
                  )}
                >
                  <option value="">
                    {divisionId ? t("form.districtPlaceholder") : t("form.districtPlaceholderNoDivision")}
                  </option>
                  {districts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {localizedName(d, i18n.language)}
                    </option>
                  ))}
                </select>
                {errors.districtId && <p className="mt-1 text-[11px] text-rust-400">{errors.districtId}</p>}
              </div>
            </div>

            <div>
              <label
                htmlFor="report-area"
                className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-grey-400"
              >
                <MapPinIcon width={13} height={13} className="text-grey-500" />
                {t("form.area")}
              </label>
              <select
                id="report-area"
                value={areaId}
                onChange={(e) => setAreaId(e.target.value)}
                disabled={!districtId}
                className={clsx(
                  "h-11 w-full rounded-md border bg-ink-800 px-3 text-sm text-grey-900 outline-none transition-colors duration-fast disabled:opacity-40",
                  errors.areaId ? "border-rust-500" : "border-black/10 focus:border-black/30"
                )}
              >
                <option value="">
                  {districtId ? t("form.areaPlaceholder") : t("form.areaPlaceholderNoDistrict")}
                </option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {localizedName(a, i18n.language)}
                  </option>
                ))}
              </select>
              {errors.areaId ? (
                <p className="mt-1 text-[11px] text-rust-400">{errors.areaId}</p>
              ) : (
                <p className="mt-1 text-[11px] text-grey-600">{t("form.areaHelper")}</p>
              )}
            </div>

            {showLocationPicker && (
              <LocationPicker
                areaFocus={districtId ? districtCoords(districtId) ?? null : null}
                value={location}
                onChange={handlePickerChange}
                previewFromAddress={Boolean(location) && !pinConfirmedByUser}
                geocoding={geocoding}
              />
            )}

            <div>
              <label htmlFor="report-landmark" className="mb-1.5 block text-xs font-semibold text-grey-400">
                {t("form.landmark")}
              </label>
              <input
                id="report-landmark"
                type="text"
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                placeholder={t("form.landmarkPlaceholder")}
                className="h-11 w-full rounded-md border border-black/10 bg-ink-800 px-3 text-sm text-grey-900 placeholder:text-grey-600 outline-none transition-colors duration-fast focus:border-black/30"
              />
            </div>

            <div>
              <label htmlFor="report-provider" className="mb-1.5 block text-xs font-semibold text-grey-400">
                {t("provider.label")}
              </label>
              <select
                id="report-provider"
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className="h-11 w-full rounded-md border border-black/10 bg-ink-800 px-3 text-sm text-grey-900 outline-none transition-colors duration-fast focus:border-black/30"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {i18n.language.startsWith("bn") ? `${p.bn} — ${p.fullBn}` : `${p.en} — ${p.fullEn}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-md border border-rust-600/20 bg-rust-500/5 p-3">
              <div>
                <label htmlFor="report-date" className="mb-1.5 block text-xs font-semibold text-grey-400">
                  {t("form.date")}
                </label>
                <input
                  id="report-date"
                  type="date"
                  value={outageDate}
                  onChange={(e) => setOutageDate(e.target.value)}
                  className={clsx(
                    "h-10 w-full rounded-md border bg-ink-800 px-2 font-mono text-xs text-grey-900 outline-none",
                    errors.outageDate ? "border-rust-500" : "border-black/10 focus:border-black/30"
                  )}
                />
              </div>
              <div>
                <label htmlFor="report-start-time" className="mb-1.5 block text-xs font-semibold text-grey-400">
                  {t("form.startTime")}
                </label>
                <input
                  id="report-start-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={clsx(
                    "h-10 w-full rounded-md border bg-ink-800 px-2 font-mono text-xs text-grey-900 outline-none",
                    errors.startTime ? "border-rust-500" : "border-black/10 focus:border-black/30"
                  )}
                />
              </div>
              <div className="col-span-2">
                <label htmlFor="report-end-time" className="mb-1.5 block text-xs font-semibold text-grey-400">
                  {t("form.endTime")}
                </label>
                <input
                  id="report-end-time"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className={clsx(
                    "h-10 w-full rounded-md border bg-ink-800 px-2 font-mono text-xs text-grey-900 outline-none",
                    errors.endTime ? "border-rust-500" : "border-black/10 focus:border-black/30"
                  )}
                />
                <p className="mt-1 text-[11px] text-grey-600">{t("form.endTimeHelper")}</p>
              </div>
              {(errors.outageDate || errors.startTime || errors.endTime) && (
                <p className="col-span-2 text-[11px] text-rust-400">
                  {errors.outageDate || errors.startTime || errors.endTime}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="report-note" className="mb-1.5 block text-xs font-semibold text-grey-400">
                {t("form.note")}
              </label>
              <textarea
                id="report-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("form.notePlaceholder")}
                rows={3}
                className="w-full resize-none rounded-md border border-black/10 bg-ink-800 px-3 py-2 text-sm text-grey-900 placeholder:text-grey-600 outline-none transition-colors duration-fast focus:border-black/30"
              />
            </div>

            {submitError && (
              <div className="flex items-center gap-2 rounded-md border border-rust-600/30 bg-rust-500/10 px-3 py-2 text-xs text-rust-400">
                <AlertIcon width={14} height={14} />
                {t("form.errorGeneric")}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 h-12 rounded-pill bg-amber-500 font-display text-sm font-bold uppercase tracking-wide text-ink-onAccent transition-colors duration-fast hover:bg-amber-400 disabled:opacity-50"
            >
              {submitting ? t("form.submitting") : t("form.submit")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
