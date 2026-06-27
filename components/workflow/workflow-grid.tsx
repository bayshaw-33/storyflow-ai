"use client";

import { BookOpen, Clapperboard, Film, Music2, PanelsTopLeft } from "lucide-react";
import { WorkflowCard, type WorkflowCardData } from "@/components/workflow/workflow-card";

type WorkflowGridProps = {
  isZh: boolean;
  onNavigate?: () => void;
};

export function WorkflowGrid({ isZh, onNavigate }: WorkflowGridProps) {
  const workflows: WorkflowCardData[] = [
    {
      id: "novel",
      title: isZh ? "小说创作" : "Novel",
      description: isZh ? "连载创意、Bible、角色与章节生产" : "Serialized ideas, bible, characters, and chapters",
      href: "/novel-workbench?new=1",
      status: "active",
      tier: "extended",
      icon: BookOpen,
    },
    {
      id: "script",
      title: isZh ? "剧本创作" : "Script",
      description: isZh ? "短剧核心工作流、分集、钩子与交付" : "Core drama workflow, episodes, hooks, and delivery",
      href: "/projects/demo?template=demo",
      status: "active",
      tier: "core",
      icon: Clapperboard,
    },
    {
      id: "storyboard",
      title: isZh ? "分镜创作" : "Storyboard",
      description: isZh ? "镜头拆解、视觉提示与分镜交付" : "Shot breakdowns, visual prompts, and boards",
      href: "/storyboard",
      status: "coming_soon",
      tier: "core",
      icon: PanelsTopLeft,
    },
    {
      id: "video",
      title: isZh ? "视频创作" : "Video",
      description: isZh ? "视频生成、素材组织与剪辑衔接" : "Video generation, assets, and edit handoff",
      href: "/video",
      status: "coming_soon",
      tier: "core",
      icon: Film,
    },
    {
      id: "ost",
      title: isZh ? "歌曲创作" : "OST",
      description: isZh ? "歌词、曲风、OST 创意与项目沉淀" : "Lyrics, style, OST ideas, and project capture",
      href: "/song-workbench",
      status: "active",
      tier: "extended",
      icon: Music2,
    },
  ];

  return (
    <div className="workspace-workflow-grid" aria-label={isZh ? "工作流入口" : "Workflow entry points"}>
      {workflows.map((workflow) => (
        <WorkflowCard key={workflow.id} workflow={workflow} onNavigate={onNavigate} />
      ))}
    </div>
  );
}
