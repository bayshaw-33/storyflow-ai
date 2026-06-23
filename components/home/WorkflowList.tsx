"use client";

import { useRouter } from "next/navigation";
import type { WorkflowType } from "@/lib/projects";
import { useI18n } from "@/lib/i18n/useI18n";

type DramaWorkflowType = Extract<WorkflowType, "creation" | "continuation">;

const workflowEntries = [
  {
    id: "short_drama",
    title: "Short Drama",
    titleZh: "短剧",
    description: "Fast vertical episodes with hooks, cliffhangers, and delivery assets.",
    descriptionZh: "高密度竖屏短剧，包含钩子、反转和交付内容。",
    steps: 14,
    difficulty: "Focused",
    difficultyZh: "聚焦",
    mode: "creation" as DramaWorkflowType,
    comingSoon: false,
  },
  {
    id: "song_creation",
    title: "Song Creation",
    titleZh: "歌曲创作",
    description: "Platform-ready lyrics, style prompts, singer tags, and versioned copy.",
    descriptionZh: "生成可用于音乐平台的歌词、风格提示词、歌手标签和版本。",
    steps: 10,
    difficulty: "Music text",
    difficultyZh: "音乐文本",
    mode: null,
    comingSoon: false,
  },
  {
    id: "novel",
    title: "Novel",
    titleZh: "小说",
    description: "Long-form arcs, chapter engines, canon, and serialized pacing.",
    descriptionZh: "长篇故事线、章节推进、设定连续性与连载节奏。",
    steps: 12,
    difficulty: "Deep",
    difficultyZh: "深入",
    mode: "creation" as DramaWorkflowType,
    comingSoon: true,
  },
  {
    id: "viral_creation",
    title: "Viral Creation",
    titleZh: "爆款创作",
    description: "Upload video, AI deconstructs viral structure, one-click remake.",
    descriptionZh: "上传视频，AI拆解爆款结构，一键同结构改写。",
    steps: 6,
    difficulty: "Viral",
    difficultyZh: "爆款",
    mode: null,
    route: "/viral-workbench",
    comingSoon: false,
  },
  {
    id: "mv_concept",
    title: "MV Concept",
    titleZh: "MV 概念",
    description: "Visual story frames, mood, symbolic sequences, and direction.",
    descriptionZh: "音乐视频故事画面、情绪、视觉隐喻和导演方向。",
    steps: 6,
    difficulty: "Beta",
    difficultyZh: "测试",
    mode: "creation" as DramaWorkflowType,
    comingSoon: true,
  },
];

type WorkflowListProps = {
  onSelectWorkflow: (workflowType: DramaWorkflowType) => void;
  onOpenSongWorkbench?: () => void;
};

export function WorkflowList({ onSelectWorkflow, onOpenSongWorkbench }: WorkflowListProps) {
  const router = useRouter();
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
          <article
            className={entry.comingSoon ? "workflow-template-card is-coming-soon" : "workflow-template-card"}
            key={entry.title}
          >
            {entry.comingSoon ? (
              <span className="coming-soon-badge">{isZh ? "即将开放" : "Coming Soon"}</span>
            ) : null}
            <span className="workflow-thumb" />
            <div>
              <h3>{isZh ? entry.titleZh : entry.title}</h3>
              <p>{isZh ? entry.descriptionZh : entry.description}</p>
            </div>
            <div className="workflow-template-meta">
              <span>{entry.steps} {isZh ? "步" : "steps"}</span>
              <span>{isZh ? entry.difficultyZh : entry.difficulty}</span>
            </div>
            <button
              type="button"
              disabled={entry.comingSoon}
              onClick={() => {
                if (entry.comingSoon) return;
                if (entry.mode) {
                  onSelectWorkflow(entry.mode);
                } else if ("route" in entry && entry.route) {
                  router.push(entry.route);
                } else {
                  onOpenSongWorkbench?.();
                }
              }}
            >
              {entry.comingSoon ? (isZh ? "敬请期待" : "Coming Soon") : (isZh ? "开始" : "Start")}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
