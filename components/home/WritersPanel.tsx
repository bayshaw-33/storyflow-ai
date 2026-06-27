import { useI18n } from "@/lib/i18n/useI18n";
import { KK3D } from "@/components/kk/KK3D";

export function WritersPanel() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  return (
    <aside className="dashboard-panel companion-strip" aria-labelledby="dashboard-companions-title">
      <div className="dashboard-panel-head">
        <div>
          <span>KK</span>
          <h2 id="dashboard-companions-title">{isZh ? "动态创作搭档" : "Dynamic Companion"}</h2>
        </div>
      </div>

      <div className="kk-dashboard-companion">
        <KK3D size="md" />
        <div>
          <strong>KK</strong>
          <small>{isZh ? "根据创作状态动态响应" : "Responds dynamically to your workflow"}</small>
        </div>
      </div>
    </aside>
  );
}
