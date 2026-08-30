import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon } from "./icons";
import clsx from "../utils/clsx";

const FAQ_KEYS = ["official", "prediction", "reportHow", "resolveHow", "privacy"] as const;

export default function Faq() {
  const { t } = useTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="panel">
      <div className="border-b border-black/8 px-4 py-3">
        <h2 className="font-display text-base font-bold text-grey-900">{t("faq.title")}</h2>
        <p className="text-xs text-grey-500">{t("faq.subtitle")}</p>
      </div>
      <div>
        {FAQ_KEYS.map((key, i) => {
          const isOpen = openIndex === i;
          return (
            <div key={key} className="border-b border-black/8 last:border-0">
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
              >
                <span className="text-sm font-semibold text-grey-900">{t(`faq.${key}.q`)}</span>
                <ChevronDownIcon
                  width={16}
                  height={16}
                  className={clsx(
                    "shrink-0 text-grey-400 transition-transform duration-fast",
                    isOpen && "rotate-180"
                  )}
                />
              </button>
              {isOpen && <p className="px-4 pb-4 text-sm leading-relaxed text-grey-500">{t(`faq.${key}.a`)}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
