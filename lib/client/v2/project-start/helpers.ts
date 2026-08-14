/**
 * KIIKIS V2.2 project-start UI helpers.
 *
 * Card metadata for the 7-module entry grid (PRD §5.1). No fixture, no novel.
 * Browser-safe pure functions.
 */

import type { WorkType } from "../../../contracts/v2/work.ts";
import { DEFAULT_WORK_TITLES, WORK_TYPES } from "../../../contracts/v2/work.ts";

export interface WorkTypeCardMeta {
  workType: WorkType;
  /** Lucide icon name; the component maps this to the actual icon component. */
  icon: string;
  titleZh: string;
  titleEn: string;
  descZh: string;
  descEn: string;
}

/**
 * The 7 V2.2 top-level creation modules in canonical order (PRD §5.1).
 * Universe / actor library / community / task center are NOT in this grid.
 */
export const WORK_TYPE_CARDS: WorkTypeCardMeta[] = [
  {
    workType: "script",
    icon: "FileText",
    titleZh: "剧本",
    titleEn: "Script",
    descZh: "从想法、世界观或已有 Universe 开始创作剧本。",
    descEn: "Start a script from an idea, world, or existing Universe.",
  },
  {
    workType: "song",
    icon: "Music",
    titleZh: "歌曲",
    titleEn: "Song",
    descZh: "歌词、翻译、风格提示词与参考文件。",
    descEn: "Lyrics, translations, style prompts and references.",
  },
  {
    workType: "art",
    icon: "Palette",
    titleZh: "美术",
    titleEn: "Art",
    descZh: "角色、场景、道具统一在美术中管理。",
    descEn: "Characters, scenes and props, all in one place.",
  },
  {
    workType: "storyboard",
    icon: "LayoutGrid",
    titleZh: "分镜",
    titleEn: "Storyboard",
    descZh: "镜头表、4/6/9/12 宫格与视频提示词。",
    descEn: "Shot list, 4/6/9/12 grids and video prompts.",
  },
  {
    workType: "video",
    icon: "Video",
    titleZh: "视频",
    titleEn: "Video",
    descZh: "从确认分镜生成视频，结果持久保存。",
    descEn: "Generate video from confirmed shots, persisted.",
  },
  {
    workType: "voice",
    icon: "Mic",
    titleZh: "配音",
    titleEn: "Voice",
    descZh: "角色与台词配音，关联 Voice Identity。",
    descEn: "Character and dialogue voice, linked to Voice Identity.",
  },
  {
    workType: "editing",
    icon: "Scissors",
    titleZh: "剪辑",
    titleEn: "Editing",
    descZh: "轻量 Timeline 编辑与导出。",
    descEn: "Lightweight timeline editing and export.",
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
