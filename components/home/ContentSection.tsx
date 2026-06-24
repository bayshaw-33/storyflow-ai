"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/useI18n";

type ContentSectionProps = {
  id: string;
  kicker: string;
  titleZh: string;
  titleEn: string;
  subtitleZh: string;
  subtitleEn: string;
  ctaLabel?: string;
  ctaHref?: string;
  /** Full CSS background-image value: gradient string or url('/path/to/img.png') */
  bgImageZh: string;
  bgImageEn: string;
  align?: "left" | "center" | "right";
  lightBg?: boolean;
  children?: React.ReactNode;
};

export function ContentSection({
  id,
  kicker,
  titleZh,
  titleEn,
  subtitleZh,
  subtitleEn,
  ctaLabel,
  ctaHref,
  bgImageZh,
  bgImageEn,
  align = "left",
  lightBg = false,
  children,
}: ContentSectionProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const bgImage = isZh ? bgImageZh : bgImageEn;
  const hasImage = bgImage.trim().startsWith("url(");
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-visible");
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id={id}
      className={`content-section align-${align}${lightBg ? " light-bg" : ""}${hasImage ? " has-image" : ""}`}
      style={hasImage ? undefined : { backgroundImage: bgImage }}
      data-bg-image={bgImage}
    >
      <div className="content-section-inner" ref={innerRef}>
        <p className="content-section-kicker">{kicker}</p>
        <h2 className="content-section-title">{isZh ? titleZh : titleEn}</h2>
        <p className="content-section-subtitle">{isZh ? subtitleZh : subtitleEn}</p>
        {ctaLabel && ctaHref && (
          <Link className="content-section-cta primary-button" href={ctaHref}>
            {ctaLabel}
          </Link>
        )}
        {children}
      </div>
      {hasImage ? (
        <div className="content-section-media" style={{ backgroundImage: bgImage }} aria-hidden="true" />
      ) : null}
    </section>
  );
}
