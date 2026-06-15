"use client";

import { useI18n } from "@/lib/i18n/useI18n";

export function StoryPlanetSection() {
  const { t } = useI18n();
  const items = [
    {
      title: t("landing.metaphor.write"),
      text: t("landing.metaphor.writeText"),
    },
    {
      title: t("landing.metaphor.build"),
      text: t("landing.metaphor.buildText"),
    },
    {
      title: t("landing.metaphor.light"),
      text: t("landing.metaphor.lightText"),
    },
  ];

  return (
    <section className="story-planet-section" id="product" aria-labelledby="story-planet-title">
      <div className="section-heading centered">
        <span>{t("landing.metaphor.kicker")}</span>
        <h2 id="story-planet-title">{t("landing.metaphor.title")}</h2>
        <p>{t("landing.metaphor.subtitle")}</p>
      </div>

      <div className="story-planet-grid">
        {items.map((item, index) => (
          <article className="story-planet-card" key={item.title}>
            <span className={`mini-planet mini-planet-${index + 1}`} />
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
