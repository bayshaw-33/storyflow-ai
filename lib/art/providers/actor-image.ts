/**
 * Actor image helpers — shared prompt builders and ArtImageRequest factories
 * for the actor image routes (generate-avatar / generate-reference-sheet /
 * generate-views) and other reference-driven image endpoints.
 *
 * KIIKIS-TR-ACTOR-P0-006: 图组从"多张独立图"改为"单张合成图"模式。
 *   - 每个 pack 只生成 1 张合成图（character sheet 风格）
 *   - pack 提供 promptVariants 多组措辞，失败时自动切换
 *   - 三视图横排3格(3:1) / 表情组2x2(1:1) / 身体细节2x2(1:1)
 *
 * All generation goes through generateArtImages (Atlas Cloud via catalog
 * default models). This module is Next-free and dependency-free so node:test
 * can import it directly.
 *
 * ERASABLE SYNTAX ONLY (Node type-stripping).
 */

import type { ArtCandidateCount } from "../types.ts";
import type { ArtImageProviderResult, ArtImageRequest } from "./types.ts";

export type ActorImageAspectRatio = ArtImageRequest["aspectRatio"];

export type ActorViewPackKey = "three-view-casual" | "three-view-swimwear" | "expressions" | "body-details";

export type ActorViewPack = {
  key: ActorViewPackKey;
  label: string;
  description: string;
  aspectRatio: ActorImageAspectRatio;
  costume: string;
  /** 合成图布局描述（嵌入 prompt）。 */
  sheetLayout: string;
  /** 合成图各格子内容（用于 UI 展示，不再独立生成）。 */
  sheetCells: { key: string; label: string }[];
  /**
   * 多组提示词措辞，失败时按序切换。
   * [0] 为主措辞，[1..] 为越来越保守的备选措辞。
   * 泳装 pack 尤其需要多组备选（内衣照容易被拒绝）。
   */
  promptVariants: string[];
};

const IDENTITY_NOTE =
  "Use the person in the reference image(s) as the exact same fictional virtual actor: identical face, identical hairstyle, identical body proportions, identical skin tone. Single person only.";

// 合成图专用质量注释：允许 collage 布局，禁止文字/水印/多余人物
const SHEET_QUALITY_NOTE =
  "Clean seamless studio background, even soft studio lighting, sharp focus, production-ready character reference quality. Clear cell boundaries with even spacing. No text, no watermark, no logo, no extra people beyond the intended cells.";

export const ACTOR_VIEW_PACKS: ActorViewPack[] = [
  {
    key: "three-view-casual",
    label: "休闲三视图",
    description: "白色 T 恤 + 蓝色牛仔裤，正面 / 侧面 / 背面全身三视图（单张合成图）。",
    aspectRatio: "16:9",
    costume: "plain white crew-neck T-shirt, classic blue straight jeans, clean white sneakers",
    sheetLayout: "three full-body views arranged side by side in a horizontal row: front view on the left, side profile view in the middle, back view on the right. Even spacing, same scale, same background.",
    sheetCells: [
      { key: "front", label: "正面全身" },
      { key: "side", label: "侧面全身" },
      { key: "back", label: "背面全身" },
    ],
    promptVariants: [
      "Character model sheet with three full-body views in a horizontal row.",
      "Character reference sheet showing the same person from three angles in a row.",
      "Studio character turnaround reference, three poses side by side.",
    ],
  },
  {
    key: "three-view-swimwear",
    label: "泳装三视图",
    description: "简约纯色泳装，正面 / 侧面 / 背面全身三视图，用于校准身体比例（单张合成图）。",
    aspectRatio: "16:9",
    costume: "simple solid-color modest swimwear without patterns (one-piece swimsuit or swim trunks, matching the actor's gender expression), barefoot",
    sheetLayout: "three full-body views arranged side by side in a horizontal row: front view on the left, side profile view in the middle, back view on the right. Even spacing, same scale, same background.",
    sheetCells: [
      { key: "front", label: "正面全身" },
      { key: "side", label: "侧面全身" },
      { key: "back", label: "背面全身" },
    ],
    // 泳装/内衣照容易被拒绝，准备 4 组措辞从直接到保守
    promptVariants: [
      "Character model sheet with three full-body views in a horizontal row, for body proportion reference.",
      "Character proportion reference sheet showing the same person from three angles in a row, athletic studio study.",
      "Figure-study character sheet, three full-body poses side by side, modest athletic attire for proportion calibration.",
      "Anatomical proportion reference sheet for a virtual character, three standing poses in a row, minimal athletic wear.",
    ],
  },
  {
    key: "expressions",
    label: "表情组",
    description: "头肩特写表情组：微笑 / 愤怒 / 悲伤 / 惊讶（单张 2x2 合成图）。",
    aspectRatio: "1:1",
    costume: "simple neutral crew-neck top that keeps the face and neck clearly visible",
    sheetLayout: "head-and-shoulders close-up expressions arranged in a 2x2 grid: smile top-left, angry top-right, sad bottom-left, surprised bottom-right. Even spacing, same scale, same background, same lighting.",
    sheetCells: [
      { key: "smile", label: "微笑" },
      { key: "angry", label: "愤怒" },
      { key: "sad", label: "悲伤" },
      { key: "surprised", label: "惊讶" },
    ],
    promptVariants: [
      "Expression sheet with four head-and-shoulders close-ups in a 2x2 grid.",
      "Character expression reference, four facial expressions arranged in a square grid.",
      "Facial expression study sheet, four emotions in a 2x2 layout.",
    ],
  },
  {
    key: "body-details",
    label: "身体细节",
    description: "面部特写 / 手部细节 / 背面发型 / 全身比例（单张 2x2 合成图）。",
    aspectRatio: "1:1",
    costume: "simple neutral fitted clothing that does not hide body proportions",
    sheetLayout: "detail reference sheet arranged in a 2x2 grid: face close-up top-left, hands close-up top-right, back-of-head hairstyle bottom-left, full-body proportion bottom-right. Even spacing, same background, same lighting.",
    sheetCells: [
      { key: "face-close-up", label: "面部特写" },
      { key: "hands", label: "手部细节" },
      { key: "hair-back", label: "背面发型" },
      { key: "full-body", label: "全身比例" },
    ],
    promptVariants: [
      "Character detail reference sheet with four close-ups in a 2x2 grid.",
      "Body detail study sheet, four detail shots arranged in a square grid.",
      "Character anatomy reference, four detail views in a 2x2 layout.",
    ],
  },
];

/**
 * Resolve a pack by raw key. Accepts canonical key (three-view-casual) and
 * legacy underscore variants (three_view_casual / three_view_swim /
 * body_details) for backward compatibility with old cached UI / API calls.
 * Returns null for unknown keys (caller must 400).
 */
export function getActorViewPack(rawKey: string): ActorViewPack | null {
  const trimmed = String(rawKey || "").trim();
  // canonical match
  const canonical = ACTOR_VIEW_PACKS.find((pack) => pack.key === trimmed);
  if (canonical) return canonical;
  // legacy underscore normalization
  switch (trimmed) {
    case "three_view_casual":
      return ACTOR_VIEW_PACKS.find((p) => p.key === "three-view-casual") || null;
    case "three_view_swim":
    case "three_view_swimwear":
      return ACTOR_VIEW_PACKS.find((p) => p.key === "three-view-swimwear") || null;
    case "body_details":
      return ACTOR_VIEW_PACKS.find((p) => p.key === "body-details") || null;
    default:
      return null;
  }
}

/** 「白底正面特写肖像」头像提示词。 */
export function buildActorAvatarPrompt(basePrompt: string): string {
  return [
    "White background, front-facing close-up portrait, studio lighting.",
    "Single fictional virtual actor, head-and-shoulders framing, face centered, looking directly at the camera, calm confident expression.",
    "Seamless pure white background, soft even studio key light, sharp facial detail, high-end casting-photo quality.",
    "No text, no watermark, no logo, no sunglasses, no accessories covering the face, no extra people.",
    basePrompt.trim(),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * 构造合成图（character sheet）提示词。
 * @param pack 图组定义
 * @param promptVariantIndex promptVariants 索引（失败重试时切换）
 * @param actorBasePrompt 演员基础描述
 */
export function buildActorSheetPrompt(
  pack: ActorViewPack,
  promptVariantIndex: number,
  actorBasePrompt: string,
): string {
  const variant = pack.promptVariants[Math.min(promptVariantIndex, pack.promptVariants.length - 1)] || pack.promptVariants[0];
  return [
    "Professional character reference sheet for a fictional virtual actor asset library.",
    IDENTITY_NOTE,
    `Costume: ${pack.costume}.`,
    `Layout: ${pack.sheetLayout}.`,
    `Composition: ${variant}`,
    SHEET_QUALITY_NOTE,
    actorBasePrompt.trim() ? `Actor base description:\n${actorBasePrompt.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 文生图请求（task "concept"，模型走 catalog 默认）。 */
export function buildActorTextToImageRequest(input: {
  prompt: string;
  negativePrompt?: string;
  aspectRatio: ActorImageAspectRatio;
  count?: ArtCandidateCount;
  seed?: number;
}): ArtImageRequest {
  return {
    task: "concept",
    prompt: input.prompt,
    negativePrompt: input.negativePrompt || "",
    referenceUrls: [],
    aspectRatio: input.aspectRatio,
    count: input.count ?? 1,
    seed: input.seed,
    // Actor/concept generation is Atlas-only; do not silently fall back to FLUX.
    selection: "atlas",
  };
}

/** 参考图驱动请求（images 参考输入，路由到图生图 / 多参考模型）。 */
export function buildActorReferenceImageRequest(input: {
  prompt: string;
  negativePrompt?: string;
  referenceUrls: string[];
  aspectRatio: ActorImageAspectRatio;
  count?: ArtCandidateCount;
  seed?: number;
}): ArtImageRequest {
  return {
    ...buildActorTextToImageRequest(input),
    referenceUrls: sanitizeReferenceUrls(input.referenceUrls),
  };
}

/** 仅保留可远程抓取的 http(s) 图片 URL（data URL / 空值会被丢弃）。 */
export function sanitizeReferenceUrls(urls: Array<string | null | undefined>): string[] {
  return urls.filter((url): url is string => typeof url === "string" && /^https?:\/\//i.test(url.trim()));
}

/** 取第一张生成结果；空结果显式报错，不静默。 */
export function firstArtImageResult(results: ArtImageProviderResult[]): ArtImageProviderResult {
  const first = results[0];
  if (!first || !first.imageUrl) throw new Error("EMPTY_ART_IMAGE_OUTPUT");
  return first;
}

/**
 * 生成单张合成图的重试策略配置。
 * - attempt 1: promptVariants[0] + 随机 seed A
 * - attempt 2: promptVariants[0] + 随机 seed B（同 prompt 换 seed）
 * - attempt 3: promptVariants[1] + 随机 seed C（切换措辞）
 * - attempt 4: promptVariants[2] + 随机 seed D（更保守措辞）
 * - attempt 5: promptVariants[last] + 随机 seed E（最保守措辞）
 * 全部失败后由调用方返回 502。
 */
export const SHEET_RETRY_PLAN = [
  { promptVariantIndex: 0, seedStrategy: "random" as const },
  { promptVariantIndex: 0, seedStrategy: "random" as const },
  { promptVariantIndex: 1, seedStrategy: "random" as const },
  { promptVariantIndex: 2, seedStrategy: "random" as const },
  { promptVariantIndex: -1, seedStrategy: "random" as const }, // -1 = 最后一个 variant
];

/** 生成随机 seed（0 ~ 2^31 - 1）。 */
export function randomSheetSeed(): number {
  return Math.floor(Math.random() * 2147483647);
}
