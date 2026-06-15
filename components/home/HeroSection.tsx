"use client";

type HeroSectionProps = {
  onStartCreating: () => void;
};

export function HeroSection({ onStartCreating }: HeroSectionProps) {
  return (
    <section className="kiikis-hero" aria-labelledby="kiikis-hero-title">
      <div className="hero-cosmos" aria-hidden="true">
        <img src="/brand/kiikis-hero-clean.jpg" alt="" />
      </div>

      <div className="hero-copy">
        <span className="hero-kicker">THE AI WRITER'S ROOM</span>
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
