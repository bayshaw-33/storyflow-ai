"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

type ContentSectionProps = {
  id: string;
  kicker: string;
  title: string;
  subtitle: string;
  ctaLabel?: string;
  ctaHref?: string;
  bgGradient: string;
  align?: "left" | "center" | "right";
  children?: React.ReactNode;
};

export function ContentSection({
  id,
  kicker,
  title,
  subtitle,
  ctaLabel,
  ctaHref,
  bgGradient,
  align = "left",
  children,
}: ContentSectionProps) {
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
      className={`content-section align-${align}`}
      style={{ backgroundImage: bgGradient }}
      data-bg-image=""
    >
      <div className="content-section-inner" ref={innerRef}>
        <p className="content-section-kicker">{kicker}</p>
        <h2 className="content-section-title">{title}</h2>
        <p className="content-section-subtitle">{subtitle}</p>
        {ctaLabel && ctaHref && (
          <Link className="primary-button" href={ctaHref}>
            {ctaLabel}
          </Link>
        )}
        {children}
      </div>
    </section>
  );
}
