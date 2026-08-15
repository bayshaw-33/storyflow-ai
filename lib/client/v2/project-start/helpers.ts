/**
 * KIIKIS V2.2 project-start UI helpers.
 *
 * Card metadata for the 8-module entry grid (PRD §5.1). No fixture, no novel.
 * Browser-safe pure functions.
 */

import type { WorkType } from "../../../contracts/v2/work.ts";
import { DEFAULT_WORK_TITLES, WORK_TYPES } from "../../../contracts/v2/work.ts";

export interface WorkTypeCardMeta {
  id: string;
  workType?: WorkType;
  /** Legacy workbench route for an entry outside the V2 WorkType RPC. */
  route?: string;
  /** Lucide icon name; the component maps this to the actual icon component. */
  icon: string;
  titleZh: string;
  titleEn: string;
  descZh: string;
  descEn: string;
}

/**
 * The 8 top-level creation modules in canonical order (PRD §5.1).
 * Universe / actor library / community / task center are NOT in this grid.
 */
export const WORK_TYPE_CARDS: WorkTypeCardMeta[] = [
  {
    id: "script",
    workType: "script",
    icon: "FileText",
    titleZh: "剧本",
    titleEn: "Script",
    descZh: "从想法、世界观或已有 Universe 开始创作剧本。",
    descEn: "Start a script from an idea, world, or existing Universe.",
  },
  {
    id: "song",
    workType: "song",
    icon: "Music",
    titleZh: "歌曲",
    titleEn: "Song",
    descZh: "歌词、翻译、风格提示词与参考文件。",
    descEn: "Lyrics, translations, style prompts and references.",
  },
  {
    id: "art",
    workType: "art",
    icon: "Palette",
    titleZh: "美术",
    titleEn: "Art",
    descZh: "角色、场景、道具统一在美术中管理。",
    descEn: "Characters, scenes and props, all in one place.",
  },
  {
    id: "storyboard",
    workType: "storyboard",
    icon: "LayoutGrid",
    titleZh: "分镜",
    titleEn: "Storyboard",
    descZh: "镜头表、4/6/9/12 宫格与视频提示词。",
    descEn: "Shot list, 4/6/9/12 grids and video prompts.",
  },
  {
    id: "video",
    workType: "video",
    icon: "Video",
    titleZh: "视频",
    titleEn: "Video",
    descZh: "从确认分镜生成视频，结果持久保存。",
    descEn: "Generate video from confirmed shots, persisted.",
  },
  {
    id: "voice",
    workType: "voice",
    icon: "Mic",
    titleZh: "配音",
    titleEn: "Voice",
    descZh: "角色与台词配音，关联 Voice Identity。",
    descEn: "Character and dialogue voice, linked to Voice Identity.",
  },
  {
    id: "editing",
    workType: "editing",
    icon: "Scissors",
    titleZh: "剪辑",
    titleEn: "Editing",
    descZh: "轻量 Timeline 编辑与导出。",
    descEn: "Lightweight timeline editing and export.",
  },
  {
    id: "adaptation",
    route: "/viral-workbench?setup=1",
    icon: "Flame",
    titleZh: "改编",
    titleEn: "Adaptation",
    descZh: "从已有作品出发，拆解结构并创作新的表达。",
    descEn: "Start from an existing work and create a new interpretation.",
  },
];

export function getWorkTypeCard(workType: WorkType): WorkTypeCardMeta {
  const card = WORK_TYPE_CARDS.find((c) => c.workType === workType);
  if (!card) throw new Error(`No card meta for workType: ${workType}`);
  return card;
}

export function defaultTitleFor(workType: WorkType): string {
  return DEFAULT_WORK_TITLES[workType];
}

export { WORK_TYPES, DEFAULT_WORK_TITLES };
