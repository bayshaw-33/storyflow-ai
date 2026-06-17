"use client";

const SECTIONS = [
  { src: "/landing/section-01-create-stories-without-borders.png", alt: "Create Stories Without Borders" },
  { src: "/landing/section-02-four-formats-one-universe.png", alt: "Four Formats, One Universe" },
  { src: "/landing/section-03-professional-ai-workflows.png", alt: "Professional AI Workflows" },
  { src: "/landing/section-04-living-ip-universe.png", alt: "Kiikis Living IP Universe" },
  { src: "/landing/section-05-characters-that-remember.png", alt: "Characters That Remember" },
  { src: "/landing/section-06-built-for-pro-creators.png", alt: "Built for Pro Creators" },
  { src: "/landing/section-07-create-with-kk.png", alt: "Create with KK" },
];

// Each image is already a complete designed slide (headline, body copy, and
// icon row baked in) — this just sequences them full-width, in order, with
// quiet consistent spacing. No extra captions are added on top; the
// artwork is the content.
export function SignatureSections() {
  return (
    <section className="signature-sections" aria-label="What Kiikis gives you">
      {SECTIONS.map((item) => (
        <figure className="signature-slide" key={item.src}>
          <img src={item.src} alt={item.alt} loading="lazy" decoding="async" />
        </figure>
      ))}
    </section>
  );
}
