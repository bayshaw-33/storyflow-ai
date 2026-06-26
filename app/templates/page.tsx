"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { createNovelProject, createProject, upsertProject } from "@/lib/projects";
import { useI18n } from "@/lib/i18n/useI18n";

const templates = [
  {
    id: "short_drama",
    title: "Short Drama Creation",
    titleZh: "短剧创作",
    description: "Vertical episodes, high-density turns, hooks, and delivery package.",
    descriptionZh: "竖屏分集、高密度反转、钩子和交付包。",
    steps: "9 steps",
    difficulty: "Focused",
    idea: "A high-stakes short drama built around betrayal, reversal, and a strong episode hook.",
  },
  {
    id: "novel",
    title: "Novel Creation",
    titleZh: "小说创作",
    description: "Serialized arcs, chapter plans, world logic, and character continuity.",
    descriptionZh: "连载弧线、章节规划、世界逻辑和角色连续性。",
    steps: "12 steps",
    difficulty: "Deep",
    idea: "A serialized fiction world with a long arc, recurring characters, and chapter momentum.",
  },
  {
    id: "viral_creation",
    title: "Viral Creation",
    titleZh: "爆款创作",
    description: "Upload video, AI deconstructs viral structure, one-click remake.",
    descriptionZh: "上传视频，AI拆解爆款结构，一键同结构改写。",
    steps: "6 steps",
    difficulty: "Viral",
    idea: "A viral video structure remake project prepared for video analysis and same-structure rewriting.",
  },
  {
    id: "mv_concept",
    title: "MV Concept",
    titleZh: "MV 概念",
    description: "Music video story frames, mood, visual metaphors, and direction.",
    descriptionZh: "音乐视频故事画面、情绪、视觉隐喻和方向。",
    steps: "6 steps",
    difficulty: "Beta",
    idea: "A cinematic music video concept with emotional beats and visual metaphors.",
  },
  {
    id: "custom",
    title: "Custom Workflow",
    titleZh: "自定义工作流",
    description: "Assemble a production path from reusable storytelling steps.",
    descriptionZh: "用可复用故事步骤组装专属生产路径。",
    steps: "Custom",
    difficulty: "Advanced",
    idea: "A custom workflow project ready for manual setup inside the workspace.",
  },
];

export default function TemplatesPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  function startTemplate(templateId: string) {
    const template = templates.find((item) => item.id === templateId) || templates[0];
    if (template.id === "viral_creation") {
      router.push("/viral-workbench");
      return;
    }

    if (template.id === "novel") {
      const project = createNovelProject({
        title: `${template.title} World`,
        genre: template.titleZh,
        idea: template.idea,
        novelBrief: template.idea,
      });
      upsertProject(project);
      router.push(`/novel-workbench?projectId=${encodeURIComponent(project.id)}`);
      return;
    }

    const project = createProject({
      title: `${template.title} World`,
      genre: template.title,
      idea: template.idea,
      storyBible: {
        logline: "",
        sellingPoint: "",
        targetMarket: "Global",
        genreType: template.title,
        world: "",
        mainConflict: "",
        characterRelationships: "",
        lockedCanon: "",
        languageStyle: "Clean, cinematic, high-retention storytelling.",
        pacingRules: "Open with a hook, escalate through reversals, end each episode with a clear reason to continue.",
        confirmedFacts: `Workflow template: ${template.id}`,
      },
    });

    upsertProject(project);
    router.push(`/projects/${project.id}?template=${template.id}`);
  }

  return (
    <main className="cosmic-page">
      <header className="cosmic-page-header">
        <Link href="/"><KiikisLogo compact /></Link>
      </header>

      <section className="cosmic-title-band">
        <span>{isZh ? "模板 / 工作流" : "TEMPLATES / WORKFLOWS"}</span>
        <h1>{isZh ? "选择一个清晰的创作入口。" : "Start from the right workflow."}</h1>
        <p>{isZh ? "模板会创建一个本地草稿项目，并打开工作台。" : "Templates create a local draft project and open the workspace."}</p>
      </section>

      <section className="template-page-grid">
        {templates.map((template) => (
          <article className="template-page-card" key={template.id}>
            <span className="template-cosmic-thumb" />
            <h2>{isZh ? template.titleZh : template.title}</h2>
            <p>{isZh ? template.descriptionZh : template.description}</p>
            <div>
              <span>{template.steps}</span>
              <span>{template.difficulty}</span>
            </div>
            <button type="button" onClick={() => startTemplate(template.id)}>{isZh ? "开始" : "Start"}</button>
          </article>
        ))}
      </section>
    </main>
  );
}
