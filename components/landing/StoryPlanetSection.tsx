const items = [
  {
    title: "Write",
    text: "Start from a spark and shape your story.",
  },
  {
    title: "Build",
    text: "Create characters, worlds, timelines, and canon.",
  },
  {
    title: "Light",
    text: "Complete your script and light up its planet.",
  },
];

export function StoryPlanetSection() {
  return (
    <section className="story-planet-section" id="product" aria-labelledby="story-planet-title">
      <div className="section-heading centered">
        <span>THE CORE METAPHOR</span>
        <h2 id="story-planet-title">Every story is a planet.</h2>
        <p>Every finished script can be lit. Every creator builds a nebula.</p>
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
