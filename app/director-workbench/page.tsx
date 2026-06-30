"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Download, Film, PanelsTopLeft, SlidersHorizontal } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";

const directorChecks = [
  { zh: "剧本来源", en: "Script source", bodyZh: "确认分镜来自已保存项目或 Universe 资产。", bodyEn: "Confirm storyboard comes from a saved project or Universe asset." },
  { zh: "美术设计", en: "Art direction", bodyZh: "画风、角色形象、场景图和参考素材已统一。", bodyEn: "Style, character looks, scene concepts, and references are aligned." },
  { zh: "镜头节奏", en: "Shot rhythm", bodyZh: "镜头时长、动作转折和情绪曲线可进入视频生产。", bodyEn: "Duration, action turns, and emotional curve are ready for video." },
  { zh: "模型路由", en: "Model routing", bodyZh: "在设置页为视频/分镜选择默认模型，后续可切 Kling、Seedance 或自定义 API。", bodyEn: "Assign storyboard/video models in Settings. Switch to Kling, Seedance, or custom APIs later." },
];

export default function DirectorWorkbenchPage() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  return (
    <main className="app-shell production-workbench-page studio-workbench-page director-workbench-page">
      <header className="studio-workbench-header">
        <div>
          <span>{isZh ? "导演工作台" : "Director Workbench"}</span>
          <h1>{isZh ? "从分镜到视频的统筹台" : "Production control before video"}</h1>
        </div>
        <div className="studio-flow-row">
          <span>{isZh ? "分镜" : "Storyboard"}</span>
          <ArrowRight size={14} />
          <span>{isZh ? "导演审查" : "Director review"}</span>
          <ArrowRight size={14} />
          <span>{isZh ? "视频生成" : "Video"}</span>
        </div>
      </header>

      <section className="studio-three-column">
        <aside className="dashboard-panel studio-panel">
          <div className="studio-section-head">
            <span>01</span>
            <h2>{isZh ? "导入生产包" : "Import production pack"}</h2>
          </div>
          <Link className="secondary-button full" href="/storyboard-workbench">
            <PanelsTopLeft size={16} /> {isZh ? "打开分镜工作台" : "Open Storyboard"}
          </Link>
          <Link className="secondary-button full" href="/settings">
            <SlidersHorizontal size={16} /> {isZh ? "配置模型路由" : "Configure model routing"}
          </Link>
        </aside>

        <section className="dashboard-panel studio-panel">
          <div className="studio-section-head">
            <span>02</span>
            <h2>{isZh ? "导演检查表" : "Director checklist"}</h2>
          </div>
          <div className="director-check-grid">
            {directorChecks.map((item) => (
              <article key={item.en}>
                <CheckCircle2 size={18} />
                <strong>{isZh ? item.zh : item.en}</strong>
                <p>{isZh ? item.bodyZh : item.bodyEn}</p>
              </article>
            ))}
          </div>
        </section>

        <aside className="dashboard-panel studio-panel">
          <div className="studio-section-head">
            <span>03</span>
            <h2>{isZh ? "输出" : "Output"}</h2>
          </div>
          <Link className="primary-button full" href="/video-workbench">
            <Film size={16} /> {isZh ? "进入视频工作台" : "Go to Video Workbench"}
          </Link>
          <button className="secondary-button full" type="button" disabled>
            <Download size={16} /> {isZh ? "导出导演检查表" : "Export checklist"}
          </button>
        </aside>
      </section>
    </main>
  );
}
