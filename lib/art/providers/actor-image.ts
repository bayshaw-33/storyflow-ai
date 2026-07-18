/**
 * Actor image helpers — shared prompt builders and ArtImageRequest factories
 * for the actor image routes (generate-avatar / generate-reference-sheet /
 * generate-views) and other reference-driven image endpoints.
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

export type ActorViewShot = {
  key: string;
  label: string;
  brief: string;
};

export type ActorViewPack = {
  key: ActorViewPackKey;
  label: string;
  description: string;
  aspectRatio: ActorImageAspectRatio;
  costume: string;
  shots: ActorViewShot[];
};

const IDENTITY_NOTE =
  "Use the person in the reference image(s) as the exact same fictional virtual actor: identical face, identical hairstyle, identical body proportions, identical skin tone. Single person only.";

const QUALITY_NOTE =
  "Clean seamless studio background, even soft studio lighting, sharp focus, production-ready character reference quality. No text, no watermark, no logo, no collage, no extra people.";

export const ACTOR_VIEW_PACKS: ActorViewPack[] = [
  {
    key: "three-view-casual",
    label: "休闲三视图",
    description: "白色 T 恤 + 蓝色牛仔裤，正面 / 侧面 / 背面全身三视图。",
    aspectRatio: "9:16",
    costume: "plain white crew-neck T-shirt, classic blue straight jeans, clean white sneakers",
    shots: [
      { key: "front", label: "正面全身", brief: "full-body front view, standing straight, arms relaxed at sides, facing the camera" },
      { key: "side", label: "侧面全身", brief: "full-body side profile view, standing straight, arms relaxed at sides, facing sideways" },
      { key: "back", label: "背面全身", brief: "full-body back view, standing straight, arms relaxed at sides, back to the camera" },
    ],
  },
  {
    key: "three-view-swimwear",
    label: "泳装三视图",
    description: "简约纯色泳装，正面 / 侧面 / 背面全身三视图，用于校准身体比例。",
    aspectRatio: "9:16",
    costume: "simple solid-color modest swimwear without patterns (one-piece swimsuit or swim trunks, matching the actor's gender expression), barefoot",
    shots: [
      { key: "front", label: "正面全身", brief: "full-body front view, standing straight, arms relaxed at sides, facing the camera" },
      { key: "side", label: "侧面全身", brief: "full-body side profile view, standing straight, arms relaxed at sides, facing sideways" },
      { key: "back", label: "背面全身", brief: "full-body back view, standing straight, arms relaxed at sides, back to the camera" },
    ],
  },
  {
    key: "expressions",
    label: "表情组",
    description: "头肩特写表情组：微笑 / 愤怒 / 悲伤 / 惊讶。",
    aspectRatio: "1:1",
    costume: "simple neutral crew-neck top that keeps the face and neck clearly visible",
    shots: [
      { key: "smile", label: "微笑", brief: "head-and-shoulders close-up, warm genuine smile, eyes engaged with the camera" },
      { key: "angry", label: "愤怒", brief: "head-and-shoulders close-up, restrained angry expression, furrowed brows, tense jaw" },
      { key: "sad", label: "悲伤", brief: "head-and-shoulders close-up, quiet sad expression, lowered eyelids, subtle frown" },
      { key: "surprised", label: "惊讶", brief: "head-and-shoulders close-up, surprised expression, raised eyebrows, slightly open mouth" },
    ],
  },
  {
    key: "body-details",
    label: "身体细节",
    description: "面部特写 / 手部细节 / 背面发型 / 全身比例，用于细化资产一致性。",
    aspectRatio: "3:4",
    costume: "simple neutral fitted clothing that does not hide body proportions",
    shots: [
      { key: "face-close-up", label: "面部特写", brief: "extreme close-up of the face, front-facing, neutral relaxed expression, every facial feature sharply visible" },
      { key: "hands", label: "手部细节", brief: "close-up of both hands held naturally in front of the torso, palms and fingers clearly visible, correct finger count" },
      { key: "hair-back", label: "背面发型", brief: "back-of-head close-up showing the full hairstyle from behind, shoulders slightly visible" },
      { key: "full-body", label: "全身比例", brief: "full-body front view, standing straight, arms relaxed at sides, head-to-toe body proportions clearly visible" },
    ],
  },
];

export function getActorViewPack(key: string): ActorViewPack | null {
  return ACTOR_VIEW_PACKS.find((pack) => pack.key === key) || null;
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

/** 图组单张提示词：参考图身份锁定 + 服装 + 镜头描述 + 演员基础描述。 */
export function buildActorViewShotPrompt(pack: ActorViewPack, shot: ActorViewShot, actorBasePrompt: string): string {
  return [
    "Professional character reference photography for a fictional virtual actor asset library.",
    IDENTITY_NOTE,
    `Costume: ${pack.costume}.`,
    `Shot: ${shot.brief}.`,
    QUALITY_NOTE,
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
}): ArtImageRequest {
  return {
    task: "concept",
    prompt: input.prompt,
    negativePrompt: input.negativePrompt || "",
    referenceUrls: [],
    aspectRatio: input.aspectRatio,
    count: input.count ?? 1,
    selection: "smart",
  };
}

/** 参考图驱动请求（images 参考输入，路由到图生图 / 多参考模型）。 */
export function buildActorReferenceImageRequest(input: {
  prompt: string;
  negativePrompt?: string;
  referenceUrls: string[];
  aspectRatio: ActorImageAspectRatio;
  count?: ArtCandidateCount;
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
