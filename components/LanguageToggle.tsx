"use client";

import { useI18n } from "@/lib/i18n/useI18n";

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  const isChinese = locale === "zh-CN";

  return (
    <div className="language-toggle" aria-label="Interface language">
      <button
        className={isChinese ? "active" : ""}
        type="button"
        onClick={() => setLocale("zh-CN")}
        aria-pressed={isChinese}
      >
        {t("language.zh")}
      </button>
      <button
        className={!isChinese ? "active" : ""}
        type="button"
        onClick={() => setLocale("en-US")}
        aria-pressed={!isChinese}
      >
        {t("language.en")}
      </button>
    </div>
  );
}
