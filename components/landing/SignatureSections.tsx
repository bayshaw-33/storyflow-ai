"use client";

import { useI18n } from "@/lib/i18n/useI18n";

const copy = {
  "en-US": {
    ariaLabel: "What Kiikis gives you",
    systemKicker: "Creation system",
    systemTitle: "A quiet operating layer for story production.",
    systemBody: "Kiikis turns scattered ideas into a repeatable writing room: premise, characters, structure, episodes, localization, and delivery stay connected instead of living in separate documents.",
    splitTitle: "Move from spark to draft without losing the canon.",
    splitBody: "Every workflow keeps the project brief, character memory, episode outline, and final delivery aligned. The interface stays sparse so the work remains the center.",
    splitMetricA: "60-80",
    splitMetricALabel: "episode draft range",
    splitMetricB: "5",
    splitMetricBLabel: "specialized writing roles",
    featuresKicker: "Workflow",
    featuresTitle: "Three production passes, one thread.",
    featureOne: "Capture the premise, target market, genre, and delivery shape.",
    featureTwo: "Build the story bible, characters, structure model, and episode beats.",
    featureThree: "Generate, revise, localize, evaluate, and export without breaking context.",
    cardsKicker: "For creators",
    cardsTitle: "Built for repeat production.",
    cardOneTitle: "Draft room",
    cardOneBody: "Generate complete scripts with project memory and staged controls.",
    cardTwoTitle: "Universe memory",
    cardTwoBody: "Keep people, places, rules, and relationships coherent as projects expand.",
    cardThreeTitle: "Delivery layer",
    cardThreeBody: "Prepare export-ready scripts, storyboards, prompts, and production notes.",
  },
  "zh-CN": {
    ariaLabel: "Kiikis 能提供什么",
    systemKicker: "创作系统",
    systemTitle: "为故事生产准备的安静操作层。",
    systemBody: "Kiikis 把散落的灵感变成可重复的编剧室：故事前提、角色、结构、分集、本地化与交付在同一条上下文里推进。",
    splitTitle: "从火花到初稿，不丢失设定。",
    splitBody: "每个工作流都会把项目 brief、角色记忆、分集大纲和最终交付连在一起。界面保持克制，让创作本身站在最前面。",
    splitMetricA: "60-80",
    splitMetricALabel: "集完整初稿",
    splitMetricB: "5",
    splitMetricBLabel: "个专业 AI 编剧角色",
    featuresKicker: "工作流",
    featuresTitle: "三个生产阶段，一条创作线。",
    featureOne: "确认故事前提、目标市场、题材类型和交付形态。",
    featureTwo: "搭建故事圣经、角色、结构模型与分集节拍。",
    featureThree: "生成、改写、本地化、评估和导出都保持上下文一致。",
    cardsKicker: "面向创作者",
    cardsTitle: "为连续生产而设计。",
    cardOneTitle: "初稿工作间",
    cardOneBody: "用项目记忆和阶段控制生成完整剧本。",
    cardTwoTitle: "宇宙记忆",
    cardTwoBody: "随着项目扩展，持续维护人物、地点、规则和关系。",
    cardThreeTitle: "交付层",
    cardThreeBody: "整理可导出的剧本、分镜、提示词和制作说明。",
  },
};

export function SignatureSections() {
  const { locale } = useI18n();
  const text = copy[locale];
  const features = [text.featureOne, text.featureTwo, text.featureThree];
  const cards = [
    { title: text.cardOneTitle, body: text.cardOneBody },
    { title: text.cardTwoTitle, body: text.cardTwoBody },
    { title: text.cardThreeTitle, body: text.cardThreeBody },
  ];

  return (
    <section className="signature-sections" aria-label={text.ariaLabel}>
      <article className="settings-card">
        <span>{text.systemKicker}</span>
        <h2>{text.systemTitle}</h2>
        <p>{text.systemBody}</p>
      </article>

      <section className="story-planet-grid" aria-label={text.splitTitle}>
        <article className="story-planet-card">
          <span>{text.systemKicker}</span>
          <h2>{text.splitTitle}</h2>
          <p>{text.splitBody}</p>
          <div className="kk-landing-stats">
            <div className="kk-stat-glass-card">
              <strong>{text.splitMetricA}</strong>
              <span>{text.splitMetricALabel}</span>
            </div>
            <div className="kk-stat-glass-card">
              <strong>{text.splitMetricB}</strong>
              <span>{text.splitMetricBLabel}</span>
            </div>
          </div>
        </article>
        <figure className="signature-slide">
          <img
            src="/landing/section-03-professional-ai-workflows.png"
            alt={text.splitTitle}
            loading="lazy"
            decoding="async"
          />
        </figure>
      </section>

      <section className="settings-card" aria-labelledby="landing-feature-list">
        <span>{text.featuresKicker}</span>
        <h2 id="landing-feature-list">{text.featuresTitle}</h2>
        <dl className="plan-entitlements">
          {features.map((feature, index) => (
            <div key={feature}>
              <dt>{String(index + 1).padStart(2, "0")}</dt>
              <dd>{feature}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="landing-card-grid">
        <div className="section-heading centered">
          <span>{text.cardsKicker}</span>
          <h2 id="landing-card-grid">{text.cardsTitle}</h2>
        </div>
        <div className="story-planet-grid">
          {cards.map((card) => (
            <article className="story-planet-card" key={card.title}>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
