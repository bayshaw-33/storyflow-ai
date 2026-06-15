"use client";

import { KiikisLogo } from "@/components/brand/KiikisLogo";

type HeroSectionProps = {
  onStartCreating: () => void;
};

export function HeroSection({ onStartCreating }: HeroSectionProps) {
  return (
    <section className="kiikis-hero" aria-labelledby="kiikis-hero-title">
      <div className="hero-cosmos" aria-hidden="true">
        <span className="story-dome" />
        <span className="galaxy-ring ring-one" />
        <span className="galaxy-ring ring-two" />
        <span className="planet planet-a" />
        <span className="planet planet-b" />
        <span className="planet planet-c lit" />
        <span className="creator-silhouette">
          <span className="creator-head" />
          <span className="creator-body" />
          <span className="shoulder-cat" />
        </span>
      </div>

      <div className="hero-copy">
        <KiikisLogo showTagline />
        <h1 id="kiikis-hero-title">
          Every great story
          <span>starts in the dark.</span>
        </h1>
        <p>From spark to story. From idea to universe. Your imagination. Unlocked.</p>
        <div className="hero-actions">
          <button className="kk-primary-cta" type="button" onClick={onStartCreating}>
            Enter the Writer's Room
          </button>
          <button className="kk-secondary-cta" type="button">
            Watch the film
          </button>
        </div>
      </div>
    </section>
  );
}
