/**
 * Storyboard prompt templates (image prompts, 即梦 video prompts, art prompts).
 *
 * Task card: KIIKIS-P1-KIMI-002 §2/§3
 *
 * Rules encoded here:
 *   - Character appearance is SINGLE-SOURCE: callers pass the approved
 *     version's appearance summary when one exists, otherwise the asset
 *     description — never both concatenated (no conflicting descriptions).
 *   - Dialogue is inserted VERBATIM in its original language (never
 *     translated), as 台词：“<original>” / Dialogue: "<original>".
 *   - 即梦 (jimeng) prompts follow the exact memo structure:
 *     主体 + 动作 + 表情情绪 + 场景 + 景别/机位 + 镜头运动 + 光线与画面质感
 *     + 时长感 + 画幅 + 连贯性限制 + 负面限制
 *     with natural Chinese and no leftover placeholders/brackets.
 *
 * ERASABLE SYNTAX ONLY (Node type-stripping).
 */

import { canonicalJson, sha256Hex } from "../../compliance/manifest.ts";

export const PROMPT_TEMPLATE_VERSION = "sb-prompts/1";

export const SHARED_NEGATIVE_PROMPT =
  "watermark, logo, subtitle, text overlay, extra fingers, deformed hands, distorted face, duplicated character, inconsistent outfit, lowres, blurry, jpeg artifacts";

/** 即梦负面限制（中文版，与 SHARED_NEGATIVE_PROMPT 语义一致） */
export const JIMENG_NEGATIVE_ZH =
  "不要水印、不要 logo、不要字幕、不要文字叠加、不要多余手指、不要手部畸形、不要脸部扭曲、不要人物重复、不要服装不一致、不要低分辨率、不要模糊";

export const JIMENG_NEGATIVE_EN =
  "no watermark, no logo, no subtitles, no text overlay, no extra fingers, no deformed hands, no distorted face, no duplicated character, no inconsistent outfit, no lowres, no blur";

// ---------------------------------------------------------------------------
// Asset reference-image prompts (used by assets/extract.ts)
// ---------------------------------------------------------------------------

export type ArtPromptAssetInput = {
  name: string;
  description: string;
  visualKeywords: string[];
  scriptBasis?: string;
};

function keywordLine(visualKeywords: string[]): string {
  const keywords = visualKeywords.filter((kw) => kw.trim().length > 0);
  return keywords.length > 0 ? keywords.join("、") : "写实、影视级、高一致性";
}

function described(description: string, name: string): string {
  const text = description.trim();
  return text.length > 0 ? text : `${name}（剧本中未给出更详细外貌描写，按短剧常见形象合理发挥）`;
}

/** 角色参考图提示词：年龄文化背景/五官发型体型/服装/气质/自然表情/全身半身/光线/背景/画幅/一致性关键词 */
export function buildCharacterArtPrompt(asset: ArtPromptAssetInput, aspectRatio = "9:16"): string {
  return [
    `影视级角色设定参考图：${asset.name}。`,
    `年龄与文化背景、五官、发型、体型、服装、气质：${described(asset.description, asset.name)}。`,
    "自然表情（放松、直视镜头），全身像一张、半身像一张的设定稿构图。",
    "柔和均匀的摄影棚光线，简洁纯色背景，无场景道具干扰。",
    `画幅 ${aspectRatio}。`,
    `一致性关键词：${keywordLine(asset.visualKeywords)}。`,
    asset.scriptBasis ? `剧本依据：${asset.scriptBasis}。` : "",
  ]
    .filter(Boolean)
    .join("");
}

/** 场景参考图提示词：地点类型/城市风格/建筑室内/时间/光线/氛围/色彩/视角/无人物版 */
export function buildLocationArtPrompt(asset: ArtPromptAssetInput, aspectRatio = "9:16"): string {
  return [
    `影视级场景概念图：${asset.name}。`,
    `地点类型、城市风格、建筑与室内结构、时间、光线、氛围、色彩倾向：${described(asset.description, asset.name)}。`,
    "视角：广角全景，展现空间层次。",
    "无人物版本（画面中不出现任何人物）。",
    `画幅 ${aspectRatio}。`,
    `一致性关键词：${keywordLine(asset.visualKeywords)}。`,
    asset.scriptBasis ? `剧本依据：${asset.scriptBasis}。` : "",
  ]
    .filter(Boolean)
    .join("");
}

/** 道具参考图提示词：材质/年代/品牌档次/细节/使用痕迹/单品展示背景 */
export function buildPropArtPrompt(asset: ArtPromptAssetInput, aspectRatio = "1:1"): string {
  return [
    `影视级道具单品图：${asset.name}。`,
    `材质、年代感、品牌档次、细节、使用痕迹：${described(asset.description, asset.name)}。`,
    "单品展示，居中构图，简洁纯色背景，产品级打光，特写细节清晰。",
    `画幅 ${aspectRatio}。`,
    `一致性关键词：${keywordLine(asset.visualKeywords)}。`,
    asset.scriptBasis ? `剧本依据：${asset.scriptBasis}。` : "",
  ]
    .filter(Boolean)
    .join("");
}

// ---------------------------------------------------------------------------
// Shot image prompt (English, single-source character appearance)
// ---------------------------------------------------------------------------

export type PromptCharacterInput = {
  name: string;
  /** Single-source appearance: approved version summary OR asset description. */
  appearance: string;
};

export type ShotImagePromptInput = {
  visualStyle: string;
  shotSize: string;
  angle: string;
  cameraMovement: string;
  visualDescription: string;
  characters: PromptCharacterInput[];
  location: PromptCharacterInput | null;
  props: PromptCharacterInput[];
  aspectRatio: string;
  continuity: string;
};

function joinCharacters(characters: PromptCharacterInput[]): string {
  if (characters.length === 0) return "no characters";
  return characters
    .map((character) =>
      character.appearance.trim().length > 0
        ? `${character.name} (${character.appearance})`
        : character.name,
    )
    .join("; ");
}

export function buildShotImagePrompt(input: ShotImagePromptInput): string {
  const style = input.visualStyle.trim() || "cinematic realistic short drama";
  const segments = [
    `${style} — ${input.shotSize}, ${input.angle}, ${input.cameraMovement}.`,
    `${input.visualDescription}.`,
    `Characters: ${joinCharacters(input.characters)}.`,
    input.location
      ? `Location: ${input.location.name}${input.location.appearance.trim() ? ` (${input.location.appearance})` : ""}.`
      : "",
    input.props.length > 0
      ? `Props: ${input.props.map((prop) => (prop.appearance.trim() ? `${prop.name} (${prop.appearance})` : prop.name)).join("; ")}.`
      : "",
    `Lighting & mood consistent with ${style}.`,
    `Aspect ratio ${input.aspectRatio}.`,
    input.continuity.trim() ? `Continuity: ${input.continuity}.` : "",
  ];
  return segments.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// 即梦 video prompt (zh memo format / en equivalent)
// ---------------------------------------------------------------------------

export type JimengPromptInput = {
  characters: PromptCharacterInput[];
  storyBeat: string;
  visualDescription: string;
  emotion: string;
  location: PromptCharacterInput | null;
  shotSize: string;
  angle: string;
  cameraMovement: string;
  visualStyle: string;
  durationSeconds: number;
  aspectRatio: string;
  continuity: string;
  /** VERBATIM dialogue in its original language; never translated. */
  dialogue: string;
};

function subjectNames(characters: PromptCharacterInput[]): string[] {
  return characters.map((character) => character.name);
}

/** zh: 主体 + 动作 + 表情情绪 + 场景 + 景别/机位 + 镜头运动 + 光线与画面质感 + 时长感 + 画幅 + 连贯性限制 + 负面限制 */
export function buildJimengVideoPromptZh(input: JimengPromptInput): string {
  const subjects =
    input.characters.length > 0
      ? input.characters
          .map((character) =>
            character.appearance.trim().length > 0 ? `${character.name}（${character.appearance}）` : character.name,
          )
          .join("、")
      : "空镜头（无人物）";
  const action = input.visualDescription.trim() || input.storyBeat.trim() || "人物静止";
  const scene = input.location ? input.location.name : "剧本场景";
  const style = input.visualStyle.trim() || "写实短剧";
  const seconds = Number.isFinite(input.durationSeconds) ? input.durationSeconds : 4;
  const aspectText = input.aspectRatio === "16:9" ? "横屏" : input.aspectRatio === "1:1" ? "方形" : "竖屏";

  const segments = [
    `主体：${subjects}`,
    `动作：${action}`,
    `表情情绪：${input.emotion.trim() || "自然克制"}`,
    `场景：${scene}`,
    `景别/机位：${input.shotSize}，${input.angle}`,
    `镜头运动：${input.cameraMovement}`,
    `光线与画面质感：${style}，电影感光线，画面细腻`,
    `时长感：约${seconds}秒，短剧快节奏，单镜头`,
    `画幅：${input.aspectRatio} ${aspectText}`,
    `连贯性限制：${input.continuity.trim() || "保持角色服装、发型与场景陈设一致"}`,
    `负面限制：${JIMENG_NEGATIVE_ZH}`,
  ];
  if (input.dialogue.trim().length > 0) {
    segments.push(`台词：“${input.dialogue.trim()}”`);
  }
  return segments.join("；") + "。";
}

/** en: English equivalent of the same memo structure. Dialogue stays verbatim. */
export function buildJimengVideoPromptEn(input: JimengPromptInput): string {
  const subjects =
    input.characters.length > 0
      ? input.characters
          .map((character) =>
            character.appearance.trim().length > 0 ? `${character.name} (${character.appearance})` : character.name,
          )
          .join(", ")
      : "empty shot (no people)";
  const action = input.visualDescription.trim() || input.storyBeat.trim() || "static frame";
  const scene = input.location ? input.location.name : "script scene";
  const style = input.visualStyle.trim() || "realistic short drama";
  const seconds = Number.isFinite(input.durationSeconds) ? input.durationSeconds : 4;

  const segments = [
    `Subject: ${subjects}`,
    `Action: ${action}`,
    `Emotion: ${input.emotion.trim() || "natural, restrained"}`,
    `Scene: ${scene}`,
    `Shot size / angle: ${input.shotSize}, ${input.angle}`,
    `Camera movement: ${input.cameraMovement}`,
    `Lighting & texture: ${style}, cinematic lighting, fine detail`,
    `Duration feel: about ${seconds} seconds, fast-paced short drama, single shot`,
    `Aspect ratio: ${input.aspectRatio}`,
    `Continuity constraints: ${input.continuity.trim() || "keep outfits, hairstyles and set dressing consistent"}`,
    `Negative: ${JIMENG_NEGATIVE_EN}`,
  ];
  if (input.dialogue.trim().length > 0) {
    segments.push(`Dialogue: "${input.dialogue.trim()}"`);
  }
  return segments.join("; ") + ".";
}

export function buildJimengVideoPrompt(input: JimengPromptInput, language: "zh" | "en"): string {
  return language === "en" ? buildJimengVideoPromptEn(input) : buildJimengVideoPromptZh(input);
}

// ---------------------------------------------------------------------------
// inputHash — MUST change whenever any selectedVersionId changes
// ---------------------------------------------------------------------------

export type PromptInputHashPayload = {
  shotId: string;
  visualDescription: string;
  dialogue: string;
  continuity: string;
  shotSize: string;
  cameraMovement: string;
  angle: string;
  durationSeconds: number;
  referenceVersionIds: string[];
  visualStyle: string;
  aspectRatio: string;
  language: "zh" | "en";
  templateVersion: string;
};

export function computePromptInputHash(payload: PromptInputHashPayload): string {
  const canonical = canonicalJson({
    angle: payload.angle,
    aspectRatio: payload.aspectRatio,
    cameraMovement: payload.cameraMovement,
    continuity: payload.continuity,
    dialogue: payload.dialogue,
    durationSeconds: payload.durationSeconds,
    language: payload.language,
    referenceVersionIds: [...payload.referenceVersionIds].sort(),
    shotId: payload.shotId,
    shotSize: payload.shotSize,
    templateVersion: payload.templateVersion,
    visualDescription: payload.visualDescription,
    visualStyle: payload.visualStyle,
  });
  return `sha256:${sha256Hex(new TextEncoder().encode(canonical))}`;
}
