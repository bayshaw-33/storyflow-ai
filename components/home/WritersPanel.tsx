"use client";

import { useI18n } from "@/lib/i18n/useI18n";

type WriterStatus = "active" | "idle";

const writers: Array<{ nameKey: string; status: WriterStatus }> = [
  { nameKey: "home.writers.storyArchitect", status: "active" },
  { nameKey: "home.writers.characterDesigner", status: "idle" },
  { nameKey: "home.writers.scriptDoctor", status: "idle" },
  { nameKey: "home.writers.marketAnalyst", status: "active" },
  { nameKey: "home.writers.visualDirector", status: "idle" },
];

export function WritersPanel() {
  const { t } = useI18n();

  return (
    <aside className="kk-writers-panel" aria-labelledby="kk-writers-title">
      <div className="kk-panel-head">
        <span>{t("home.writers.kicker")}</span>
        <h2 id="kk-writers-title">{t("home.writers.title")}</h2>
      </div>

      <div className="kk-writer-list">
        {writers.map((writer) => (
          <div className="kk-writer-row" key={writer.nameKey}>
            <span>{t(writer.nameKey)}</span>
            <small data-state={writer.status}>
              <i aria-hidden="true" />
              {writer.status === "active" ? t("home.writers.active") : t("home.writers.idle")}
            </small>
          </div>
        ))}
      </div>
    </aside>
  );
}
