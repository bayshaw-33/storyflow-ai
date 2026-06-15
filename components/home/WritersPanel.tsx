import { useI18n } from "@/lib/i18n/useI18n";

const companions = [
  { name: "Lyra", role: "Story Architect", status: "Active" },
  { name: "Arlo", role: "Worldbuilder", status: "Idle" },
  { name: "Vale", role: "Dialogue Expert", status: "Idle" },
  { name: "Muse", role: "Mood & Tone", status: "Active" },
  { name: "KK", role: "Creative Companion", status: "Idle" },
];

export function WritersPanel() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  return (
    <aside className="dashboard-panel companion-strip" aria-labelledby="dashboard-companions-title">
      <div className="dashboard-panel-head">
        <div>
          <span>{isZh ? "伙伴" : "COMPANIONS"}</span>
          <h2 id="dashboard-companions-title">{isZh ? "AI 编剧室" : "Writers Room"}</h2>
        </div>
      </div>

      <div className="companion-list">
        {companions.map((writer) => (
          <div className="companion-row" key={writer.name}>
            <span className="companion-portrait">{writer.name.slice(0, 1)}</span>
            <div>
              <strong>{writer.name}</strong>
              <small>{writer.role}</small>
            </div>
            <em data-state={writer.status.toLowerCase()}>{isZh ? (writer.status === "Active" ? "活跃" : "空闲") : writer.status}</em>
          </div>
        ))}
      </div>
    </aside>
  );
}
