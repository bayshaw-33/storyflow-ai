"use client";

import { BookOpen, Clapperboard, Film, Flame, Music2, PanelsTopLeft, type LucideIcon } from "lucide-react";

export type WorkflowEntryId = "novel" | "script" | "storyboard" | "video" | "song" | "viral";
export type WorkflowEntryTier = "core" | "extended";

export type WorkflowEntryPoint = {
  id: WorkflowEntryId;
  title: string;
  titleZh: string;
  description: string;
  descriptionZh: string;
  href: string;
  tier: WorkflowEntryTier;
  icon: LucideIcon;
  steps: number;
  difficulty: string;
  difficultyZh: string;
};

export const WORKFLOW_ENTRY_POINTS: WorkflowEntryPoint[] = [
  {
    id: "novel",
    title: "Novel Creation",
    titleZh: "小说创作",
    description: "Serialized ideas, bible, characters, and chapters.",
    descriptionZh: "连载创意、Bible、角色与章节生产。",
    href: "/novel-workbench?new=1&setup=1",
    tier: "extended",
    icon: BookOpen,
    steps: 8,
    difficulty: "Deep",
    difficultyZh: "深入",
  },
  {
    id: "script",
    title: "Script Creation",
    titleZh: "剧本创作",
    description: "Core short drama workflow, episodes, hooks, and delivery.",
    descriptionZh: "短剧核心工作流、分集、钩子与交付。",
    href: "/dashboard?workflow=script&setup=1",
    tier: "core",
    icon: Clapperboard,
    steps: 14,
    difficulty: "Focused",
    difficultyZh: "聚焦",
  },
  {
    id: "storyboard",
    title: "Storyboard Creation",
    titleZh: "分镜创作",
    description: "Shot breakdowns, visual prompts, and storyboard handoff.",
    descriptionZh: "镜头拆解、视觉提示与分镜交付。",
    href: "/storyboard-workbench?setup=1",
    tier: "core",
    icon: PanelsTopLeft,
    steps: 4,
    difficulty: "Shots",
    difficultyZh: "镜头",
  },
  {
    id: "video",
    title: "Video Creation",
    titleZh: "视频创作",
    description: "MiniMax video queue, assets, and preview outputs.",
    descriptionZh: "MiniMax 视频队列、素材组织与预览输出。",
    href: "/video-workbench?setup=1",
    tier: "core",
    icon: Film,
    steps: 5,
    difficulty: "Video",
    difficultyZh: "视频",
  },
  {
    id: "song",
    title: "Song Creation",
    titleZh: "歌曲创作",
    description: "Lyrics, style prompts, OST ideas, and project capture.",
    descriptionZh: "歌词、曲风、OST 创意与项目沉淀。",
    href: "/song-workbench?new=1&setup=1",
    tier: "extended",
    icon: Music2,
    steps: 10,
    difficulty: "Music text",
    difficultyZh: "音乐文本",
  },
  {
    id: "viral",
    title: "Viral Creation",
    titleZh: "爆款创作",
    description: "Upload video, analyze viral structure, and remake.",
    descriptionZh: "上传视频，AI 拆解爆款结构，一键同结构改写。",
    href: "/viral-workbench?setup=1",
    tier: "extended",
    icon: Flame,
    steps: 6,
    difficulty: "Viral",
    difficultyZh: "爆款",
  },
];
