type WriterStatus = "active" | "idle";

const writers: Array<{ name: string; status: WriterStatus }> = [
  { name: "Story Architect", status: "active" },
  { name: "Character Designer", status: "idle" },
  { name: "Script Doctor", status: "idle" },
  { name: "Market Analyst", status: "active" },
  { name: "Visual Director", status: "idle" },
];

export function WritersPanel() {
  return (
    <aside className="kk-writers-panel" aria-labelledby="kk-writers-title">
      <div className="kk-panel-head">
        <span>AI Writers</span>
        <h2 id="kk-writers-title">Status</h2>
      </div>

      <div className="kk-writer-list">
        {writers.map((writer) => (
          <div className="kk-writer-row" key={writer.name}>
            <span>{writer.name}</span>
            <small data-state={writer.status}>
              <i aria-hidden="true" />
              {writer.status === "active" ? "Active" : "Idle"}
            </small>
          </div>
        ))}
      </div>
    </aside>
  );
}
