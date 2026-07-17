"use client";

import { BookOpen, Clapperboard, Film, Flame, Music2, Palette, PanelsTopLeft, Mic, Scissors, type LucideIcon } from "lucide-react";

export type WorkflowEntryId =
  | "novel"
  | "script"
  | "song"
  | "art"
  | "storyboard"
  | "video"
  | "dub"
  | "edit"
  | "viral";

/** 三张需求卡分类（任务 1：三层导航与需求墙） */
export type WorkflowCategory = "create" | "produce" | "adapt";

export type WorkflowEntryPoint = {
  id: WorkflowEntryId;
  category: WorkflowCategory;
  title: string;
  titleZh: string;
  description: string;
  descriptionZh: string;
  href: string;
  icon: LucideIcon;
  /** 占位项（配音/剪辑本期功能不做，仅挂映射） */
  placeholder?: boolean;
};

/**
 * 最终信息架构：后台共四个工作台（创作 / 制作 / 歌曲 / 改编）。
 * Dashboard WORKFLOWS 区改为 3 张需求卡，每张卡点击展开子项墙。
 */
export const WORKFLOW_ENTRY_POINTS: WorkflowEntryPoint[] = [
  // ---------- 我要原创 ----------
  {
    id: "novel",
    category: "create",
    title: "Novel",
    titleZh: "小说",
    description: "AI-assisted serialized fiction grounded in your Universe lore.",
    descriptionZh: "AI 辅助连载小说，章节、弧线与角色之声锚定宇宙设定。",
    href: "/novel-workbench?new=1&setup=1",
    icon: BookOpen,
  },
  {
    id: "script",
    category: "create",
    title: "Screenplay",
    titleZh: "剧本",
    description: "Skip the wizard, jump straight into the Screenplay tab.",
    descriptionZh: "跳过创建向导，直达创作工作台剧本 Tab。",
    href: "/novel-workbench?new=1&setup=1&mode=screenplay",
    icon: Clapperboard,
  },
  {
    id: "song",
    category: "create",
    title: "Song",
    titleZh: "歌曲",
    description: "Compose music and lyrics native to your story world.",
    descriptionZh: "创作与你的故事世界和角色浑然一体的原创音乐与歌词。",
    href: "/song-workbench?new=1&setup=1",
    icon: Music2,
  },

  // ---------- 我要制作 ----------
  {
    id: "art",
    category: "produce",
    title: "Art",
    titleZh: "美术",
    description: "Extract characters, scenes, props into visual references.",
    descriptionZh: "拆解角色、场景、道具，生成美术参考表（已并入制作工作台美术 Tab）。",
    href: "/production?mode=art&setup=1",
    icon: Palette,
  },
  {
    id: "storyboard",
    category: "produce",
    title: "Storyboard",
    titleZh: "分镜",
    description: "Turn scripts into visual sequences ready for production.",
    descriptionZh: "将剧本转为可直接投产的视觉序列（分镜表 Tab）。",
    href: "/production?mode=planning&setup=1",
    icon: PanelsTopLeft,
  },
  {
    id: "video",
    category: "produce",
    title: "Video",
    titleZh: "视频",
    description: "Generate video from storyboard to final cut.",
    descriptionZh: "从分镜生成视频（分镜图与即梦提示词 Tab）。",
    href: "/production?mode=editor&setup=1",
    icon: Film,
  },
  {
    id: "dub",
    category: "produce",
    title: "Dubbing",
    titleZh: "配音",
    description: "Voice-over production (coming soon).",
    descriptionZh: "配音制作（本期仅挂映射占位，功能不做）。",
    href: "/production?mode=dub&setup=1",
    icon: Mic,
    placeholder: true,
  },
  {
    id: "edit",
    category: "produce",
    title: "Edit",
    titleZh: "剪辑",
    description: "Final cut editing (coming soon).",
    descriptionZh: "终剪剪辑（本期仅挂映射占位，功能不做）。",
    href: "/production?mode=edit&setup=1",
    icon: Scissors,
    placeholder: true,
  },

  // ---------- 我要改编 ----------
  {
    id: "viral",
    category: "adapt",
    title: "Adaptation",
    titleZh: "改编",
    description: "Upload video, analyze structure, remake in your voice.",
    descriptionZh: "上传视频，AI 拆解结构，一键同结构改写（改编工作台）。",
    href: "/viral-workbench?setup=1",
    icon: Flame,
  },
];

export type WorkflowCategoryDef = {
  id: WorkflowCategory;
  title: string;
  titleZh: string;
  subtitle: string;
  subtitleZh: string;
};

/** 三张需求卡定义 */
export const WORKFLOW_CATEGORIES: WorkflowCategoryDef[] = [
  {
    id: "create",
    title: "Create Original",
    titleZh: "我要原创",
    subtitle: "Start from a blank page — novel, screenplay, or song.",
    subtitleZh: "从零开始——小说、剧本或歌曲。",
  },
  {
    id: "produce",
    title: "Produce",
    titleZh: "我要制作",
    subtitle: "Art, storyboard, video, dubbing, and editing.",
    subtitleZh: "美术、分镜、视频、配音、剪辑。",
  },
  {
    id: "adapt",
    title: "Adapt",
    titleZh: "我要改编",
    subtitle: "Remake an existing video in your own voice.",
    subtitleZh: "用你的声音重制已有视频（原「爆款」更名）。",
  },
];
