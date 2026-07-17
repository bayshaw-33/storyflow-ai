"use client";

import { useI18n } from "@/lib/i18n/useI18n";
import { useTimeSlot, type TimeSlot } from "@/lib/time-slot/useTimeSlot";
import { CatMark } from "@/components/brand/CatMark";
import { assetUrl } from "@/lib/design/manifest";

type HeroSectionProps = {
  onStartCreating: () => void;
};

const SLOTS: { id: TimeSlot; label: string }[] = [
  { id: "gold", label: "Day" },
  { id: "purple", label: "Dusk" },
  { id: "blue", label: "Night" },
];

export function HeroSection({ onStartCreating }: HeroSectionProps) {
  const { t, locale } = useI18n();
  const isZh = locale === "zh-CN";
  const { slot, manual, setSlot, resetAuto } = useTimeSlot();

  return (
    <section className="hero-root hero-sixcolor" aria-labelledby="kiikis-hero-title" data-slot={slot}>
      {/* 三场景背景层（CSS 控制 opacity 切换；URL 走 manifest token） */}
      <div
        className="hero-time-bg-layer hero-time-bg-gold"
        aria-hidden="true"
        style={{ backgroundImage: `url('${assetUrl("HERO_TIME_GOLD")}')` }}
      />
      <div
        className="hero-time-bg-layer hero-time-bg-blue"
        aria-hidden="true"
        style={{ backgroundImage: `url('${assetUrl("HERO_TIME_BLUE")}')` }}
      />
      <div
        className="hero-time-bg-layer hero-time-bg-purple"
        aria-hidden="true"
        style={{ backgroundImage: `url('${assetUrl("HERO_TIME_PURPLE")}')` }}
      />

      {/* 星光闪烁层（4.5s 交替） */}
      <div className="hero-star-overlay" aria-hidden="true" />

      {/* 左→右压暗渐变（保证对比度 ≥4.5:1） */}
      <div className="hero-dark-gradient" aria-hidden="true" />

      {/* 猫标导航 */}
      <div className="hero-brand-mark">
        <CatMark state="idle" />
      </div>

      <div className="hero-content hero-copy layer-ui">
        <h1 id="kiikis-hero-title">
          {isZh ? (
            <>
              <span className="hero-line">每一个宇宙，</span>
              <span className="hero-line">都始于一个</span>
              <span className="hero-line hero-line-accent">念头 ×</span>
            </>
          ) : (
            <>
              <span className="hero-line">Every universe</span>
              <span className="hero-line">begins with</span>
              <span className="hero-line hero-line-accent">one idea.</span>
            </>
          )}
        </h1>
        <p>
          {isZh
            ? "写小说 × 构剧本 × 画分镜 × 剪视频 × 作曲子。都在一个宇宙里，由你来建造。"
            : "Write the novel. Shape the script. Frame the storyboard. Cut the video. Compose the song. All in one Universe — yours to build."}
        </p>
        <div className="hero-actions">
          <button className="kk-primary-cta hero-cta" type="button" onClick={onStartCreating}>
            {t("landing.hero.primary")}
          </button>
        </div>
      </div>

      {/* 时段切换器（手动选择后停止自动） */}
      <div className="hero-slot-switcher" role="group" aria-label="Time-of-day scene">
        {SLOTS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`hero-slot-dot hero-slot-${s.id}${slot === s.id ? " is-active" : ""}`}
            aria-label={s.label}
            aria-pressed={slot === s.id}
            onClick={() => setSlot(s.id)}
          />
        ))}
        {manual && (
          <button
            type="button"
            className="hero-slot-reset"
            onClick={resetAuto}
            aria-label="Resume auto time-of-day"
          >
            ↺
          </button>
        )}
      </div>
    </section>
  );
}
