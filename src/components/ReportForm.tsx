import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { DIVISIONS, getDistricts, localizedName } from "../data/locations";
import { PROVIDERS } from "../data/providers";
import { createReport } from "../api/reports";
import type { NewReportInput, Report, ReportStatus } from "../types";
import BreakerToggle from "./BreakerToggle";
import { XIcon, AlertIcon } from "./icons";
import clsx from "../utils/clsx";

interface Props {
  onClose: () => void;
  onCreated: (report: Report) => void;
}

interface FormErrors {
  divisionId?: string;
  districtId?: string;
  area?: string;
  outageDate?: string;
  startTime?: string;
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
  const [area, setArea] = useState("");
  const [providerId, setProviderId] = useState("unknown");
  const [status, setStatus] = useState<ReportStatus>("power_on");
  const [outageDate, setOutageDate] = useState(today());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    setDistrictId("");
  }, [divisionId]);

  function validate(): boolean {
    const next: FormErrors = {};
    if (!divisionId) next.divisionId = t("validation.divisionRequired");
    if (!districtId) next.districtId = t("validation.districtRequired");
    if (!area.trim()) next.area = t("validation.areaRequired");
    if (status === "load_shedding") {
      if (!outageDate) next.outageDate = t("validation.dateRequired");
      if (!startTime) next.startTime = t("validation.startTimeRequired");
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError(false);
    const input: NewReportInput = {
      divisionId,
      districtId,
      area: area.trim(),
      providerId,
      status,
      outageDate: status === "load_shedding" ? outageDate : null,
      startTime: status === "load_shedding" ? startTime : null,
      endTime: status === "load_shedding" ? endTime || null : null,
      note: note.trim(),
    };

    try {
      const report = await createReport(input);
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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-xl border border-white/10 bg-ink-900 shadow-sheet sm:max-w-lg sm:rounded-xl sm:shadow-callout"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-form-heading"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/8 bg-ink-900/95 px-5 py-4 backdrop-blur">
          <div>
            <h2 id="report-form-heading" className="font-display text-lg font-bold text-white">
              {t("form.heading")}
            </h2>
            <p className="text-xs text-grey-500">{t("form.subheading")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("form.close")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-grey-400 hover:bg-white/10 hover:text-white"
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
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-grey-400">{t("form.statusLabel")}</label>
              <BreakerToggle value={status} onChange={setStatus} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-grey-400">{t("form.division")}</label>
                <select
                  value={divisionId}
                  onChange={(e) => setDivisionId(e.target.value)}
                  className={clsx(
                    "h-11 w-full rounded-md border bg-ink-800 px-3 text-sm text-white outline-none transition-colors duration-fast",
                    errors.divisionId ? "border-rust-500" : "border-white/10 focus:border-leaf-500/60"
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
                <label className="mb-1.5 block text-xs font-semibold text-grey-400">{t("form.district")}</label>
                <select
                  value={districtId}
                  onChange={(e) => setDistrictId(e.target.value)}
                  disabled={!divisionId}
                  className={clsx(
                    "h-11 w-full rounded-md border bg-ink-800 px-3 text-sm text-white outline-none transition-colors duration-fast disabled:opacity-40",
                    errors.districtId ? "border-rust-500" : "border-white/10 focus:border-leaf-500/60"
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
              <label className="mb-1.5 block text-xs font-semibold text-grey-400">{t("form.area")}</label>
              <input
                type="text"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder={t("form.areaPlaceholder")}
                className={clsx(
                  "h-11 w-full rounded-md border bg-ink-800 px-3 text-sm text-white placeholder:text-grey-600 outline-none transition-colors duration-fast",
                  errors.area ? "border-rust-500" : "border-white/10 focus:border-leaf-500/60"
                )}
              />
              {errors.area && <p className="mt-1 text-[11px] text-rust-400">{errors.area}</p>}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-grey-400">{t("provider.label")}</label>
              <select
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className="h-11 w-full rounded-md border border-white/10 bg-ink-800 px-3 text-sm text-white outline-none transition-colors duration-fast focus:border-leaf-500/60"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {i18n.language.startsWith("bn") ? `${p.bn} — ${p.fullBn}` : `${p.en} — ${p.fullEn}`}
                  </option>
                ))}
              </select>
            </div>

            {status === "load_shedding" && (
              <div className="grid grid-cols-3 gap-3 rounded-md border border-rust-600/20 bg-rust-500/5 p-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-grey-400">{t("form.date")}</label>
                  <input
                    type="date"
                    value={outageDate}
                    onChange={(e) => setOutageDate(e.target.value)}
                    className={clsx(
                      "h-10 w-full rounded-md border bg-ink-800 px-2 font-mono text-xs text-white outline-none",
                      errors.outageDate ? "border-rust-500" : "border-white/10 focus:border-leaf-500/60"
                    )}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-grey-400">{t("form.startTime")}</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className={clsx(
                      "h-10 w-full rounded-md border bg-ink-800 px-2 font-mono text-xs text-white outline-none",
                      errors.startTime ? "border-rust-500" : "border-white/10 focus:border-leaf-500/60"
                    )}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-grey-400">{t("form.endTime")}</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="h-10 w-full rounded-md border border-white/10 bg-ink-800 px-2 font-mono text-xs text-white outline-none focus:border-leaf-500/60"
                  />
                </div>
                <p className="col-span-3 -mt-1 text-[11px] text-grey-500">{t("form.endTimeHint")}</p>
                {(errors.outageDate || errors.startTime) && (
                  <p className="col-span-3 text-[11px] text-rust-400">{errors.outageDate || errors.startTime}</p>
                )}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-grey-400">{t("form.note")}</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("form.notePlaceholder")}
                rows={3}
                className="w-full resize-none rounded-md border border-white/10 bg-ink-800 px-3 py-2 text-sm text-white placeholder:text-grey-600 outline-none transition-colors duration-fast focus:border-leaf-500/60"
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
              className="mt-1 h-12 rounded-pill bg-leaf-500 font-display text-sm font-bold uppercase tracking-wide text-ink-950 transition-colors duration-fast hover:bg-leaf-400 disabled:opacity-50"
            >
              {submitting ? t("form.submitting") : t("form.submit")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
