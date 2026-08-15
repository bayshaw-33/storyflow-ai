"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { useI18n } from "@/lib/i18n/useI18n";

const templates = [
  {
    id: "short_drama",
    title: "Script Creation",
    titleZh: "剧本创作",
    description: "Scene outlines, hooks, and production-ready scripts.",
    descriptionZh: "场景大纲、钩子和可直接投产的剧本。",
    steps: "9 steps",
    difficulty: "Focused",
    idea: "A high-stakes short drama built around betrayal, reversal, and a strong episode hook.",
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

    // 模板页只负责选择入口；项目与 Work 由最新 V2.2 入口原子创建。
    router.push("/projects/new-v2");
  }

  return (
    <main className="cosmic-page">
      <header className="cosmic-page-header">
        <Link href="/"><KiikisLogo compact /></Link>
      </header>

      <section className="cosmic-title-band">
        <span>{isZh ? "模板 / 工作流" : "TEMPLATES / WORKFLOWS"}</span>
        <h1>{isZh ? "选择一个宇宙入口。" : "Start from the right Universe entry."}</h1>
        <p>{isZh ? "模板会创建一个本地草稿项目，并打开工作台。" : "Templates create a local draft project and open the Workspace."}</p>
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
