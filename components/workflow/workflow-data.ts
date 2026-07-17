"use client";

import { BookOpen, Clapperboard, Film, Flame, Music2, Palette, PanelsTopLeft, type LucideIcon } from "lucide-react";

export type WorkflowEntryId = "novel" | "script" | "art" | "storyboard" | "video" | "song" | "viral";
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
    title: "Novel",
    titleZh: "小说",
    description: "AI-assisted serialized fiction grounded in your Universe lore.",
    descriptionZh: "AI 辅助连载小说，章节、弧线与角色之声锚定宇宙设定。",
    href: "/novel-workbench?new=1&setup=1",
    tier: "extended",
    icon: BookOpen,
    steps: 8,
    difficulty: "Deep",
    difficultyZh: "深入",
  },
  {
    id: "script",
    title: "Script",
    titleZh: "剧本",
    description: "From scene outlines to production-ready scripts.",
    descriptionZh: "从场景大纲到可直接投产的剧本。",
    href: "/novel-workbench?new=1&setup=1&mode=screenplay",
    tier: "core",
    icon: Clapperboard,
    steps: 14,
    difficulty: "Focused",
    difficultyZh: "聚焦",
  },
  {
    id: "storyboard",
    title: "Storyboard",
    titleZh: "分镜",
    description: "Turn scripts into visual sequences ready for production.",
    descriptionZh: "将剧本转为可直接投产的视觉序列。",
    href: "/production?mode=planning&setup=1",
    tier: "core",
    icon: PanelsTopLeft,
    steps: 4,
    difficulty: "Shots",
    difficultyZh: "镜头",
  },
  {
    id: "art",
    title: "Art",
    titleZh: "美术",
    description: "Extract characters, scenes, and props into production-ready visual references.",
    descriptionZh: "从剧本和项目资料中拆解角色、场景、关键道具，并生成美术参考表。",
    href: "/art-workbench",
    tier: "core",
    icon: Palette,
    steps: 4,
    difficulty: "Visuals",
    difficultyZh: "美术",
  },
  {
    id: "video",
    title: "Video",
    titleZh: "视频",
    description: "Generate, edit, and publish video from storyboard to final cut.",
    descriptionZh: "从分镜到终剪，生成、编辑、发布视频内容。",
    href: "/production?mode=editor&setup=1",
    tier: "core",
    icon: Film,
    steps: 5,
    difficulty: "Video",
    difficultyZh: "视频",
  },
  {
    id: "song",
    title: "Song",
    titleZh: "歌曲",
    description: "Compose music and lyrics native to your story world.",
    descriptionZh: "创作与你的故事世界和角色浑然一体的原创音乐与歌词。",
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
