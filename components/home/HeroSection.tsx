import { BRAND_NAME } from "@/lib/brand";

type HeroSectionProps = {
  onStartCreating: () => void;
};

export function HeroSection({ onStartCreating }: HeroSectionProps) {
  return (
    <section className="kk-hero" aria-labelledby="kk-home-title">
      <div className="kk-hero-copy">
        <h1 id="kk-home-title">{BRAND_NAME}</h1>
        <p>AI Writers’ Room for Everyone</p>
        <button className="kk-primary-cta" type="button" onClick={onStartCreating}>
          Start Creating
        </button>
      </div>
    </section>
  );
}
