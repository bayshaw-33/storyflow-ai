import { Sparkles } from "lucide-react";
import { BRAND_NAME, TAGLINE_EN } from "@/lib/brand";

type HeroProps = {
  onStartCreating: () => void;
};

export function Hero({ onStartCreating }: HeroProps) {
  return (
    <section className="kk-hero" aria-labelledby="kk-home-title">
      <div className="kk-hero-copy">
        <span className="kk-hero-kicker">AI Writers’ Room</span>
        <h1 id="kk-home-title">{BRAND_NAME}</h1>
        <p>{TAGLINE_EN}</p>
        <button className="kk-primary-cta" type="button" onClick={onStartCreating}>
          <Sparkles size={18} />
          Start Creating
        </button>
      </div>

      <div className="kk-hero-orb" aria-hidden="true">
        <div className="kk-orb-core">KK</div>
      </div>
    </section>
  );
}
