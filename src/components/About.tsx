import { useTranslation } from "react-i18next";

export default function About() {
  const { t } = useTranslation();

  return (
    <section className="panel">
      <div className="border-b border-black/8 px-4 py-3">
        <h2 className="font-display text-base font-bold text-grey-900">{t("about.title")}</h2>
        <p className="text-xs text-grey-500">{t("about.subtitle")}</p>
      </div>
      <div className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-600">{t("about.role")}</p>
        <h3 className="font-display text-lg font-bold text-grey-900">{t("about.name")}</h3>
        <p className="mt-1 text-sm leading-relaxed text-grey-500">{t("about.bio")}</p>
      </div>
    </section>
  );
}
