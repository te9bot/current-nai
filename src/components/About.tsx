import { useTranslation } from "react-i18next";

export default function About() {
  // The creator bio is always shown in English regardless of the site
  // language toggle — getFixedT bypasses the active language on purpose.
  const { i18n } = useTranslation();
  const t = i18n.getFixedT("en");

  return (
    <section className="panel">
      <div className="border-b border-black/8 px-4 py-3">
        <h2 className="font-display text-base font-bold text-grey-900">{t("about.title")}</h2>
        <p className="text-xs text-grey-500">{t("about.subtitle")}</p>
      </div>
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
        <img
          src="/team/talha.jpg"
          alt={t("about.name")}
          className="h-24 w-24 shrink-0 rounded-lg border border-black/8 object-cover sm:h-28 sm:w-28"
        />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-600">{t("about.role")}</p>
          <h3 className="font-display text-lg font-bold text-grey-900">{t("about.name")}</h3>
          <p className="mt-1 text-sm leading-relaxed text-grey-500">{t("about.bio")}</p>
        </div>
      </div>
    </section>
  );
}
