"use client";

import type { WorkflowType } from "@/lib/projects";
import { useI18n } from "@/lib/i18n/useI18n";

const workflowEntries = [
  {
    title: "Short Drama",
    titleZh: "短剧",
    description: "Fast vertical episodes with hooks, cliffhangers, and delivery assets.",
    descriptionZh: "高密度竖屏短剧，包含钩子、反转和交付内容。",
    steps: 9,
    difficulty: "Focused",
    difficultyZh: "聚焦",
    mode: "creation" as WorkflowType,
  },
  {
    title: "Novel",
    titleZh: "小说",
    description: "Long-form arcs, chapter engines, canon, and serialized pacing.",
    descriptionZh: "长篇故事线、章节推进、设定连续性与连载节奏。",
    steps: 12,
    difficulty: "Deep",
    difficultyZh: "深入",
    mode: "creation" as WorkflowType,
  },
  {
    title: "Film Script",
    titleZh: "电影剧本",
    description: "Feature treatments, scenes, rewrites, and final draft support.",
    descriptionZh: "电影梗概、场景、改写和最终稿支持。",
    steps: 10,
    difficulty: "Pro",
    difficultyZh: "专业",
    mode: "creation" as WorkflowType,
  },
  {
    title: "MV Concept",
    titleZh: "MV 概念",
    description: "Visual story frames, mood, symbolic sequences, and direction.",
    descriptionZh: "音乐视频故事画面、情绪、视觉隐喻和导演方向。",
    steps: 6,
    difficulty: "Beta",
    difficultyZh: "测试",
    mode: "creation" as WorkflowType,
  },
];

type WorkflowListProps = {
  onSelectWorkflow: (workflowType: WorkflowType) => void;
};

export function WorkflowList({ onSelectWorkflow }: WorkflowListProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  return (
    <section className="dashboard-panel workflow-worlds" id="workflows" aria-labelledby="dashboard-workflows-title">
      <div className="dashboard-panel-head">
        <div>
          <span>{isZh ? "工作流" : "WORKFLOWS"}</span>
          <h2 id="dashboard-workflows-title">{isZh ? "选择下一个故事入口" : "Templates for the next world"}</h2>
        </div>
      </div>
      <div className="workflow-template-grid">
        {workflowEntries.map((entry) => (
          <article className="workflow-template-card" key={entry.title}>
            <span className="workflow-thumb" />
            <div>
              <h3>{isZh ? entry.titleZh : entry.title}</h3>
              <p>{isZh ? entry.descriptionZh : entry.description}</p>
            </div>
            <div className="workflow-template-meta">
              <span>{entry.steps} {isZh ? "步" : "steps"}</span>
              <span>{isZh ? entry.difficultyZh : entry.difficulty}</span>
            </div>
            <button type="button" onClick={() => onSelectWorkflow(entry.mode)}>
              {isZh ? "开始" : "Start"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
