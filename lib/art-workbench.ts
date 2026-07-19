import type { DramaProject } from "@/lib/projects";
import { getSelectedFinalScript } from "@/lib/projects";
import { assembleScreenplay, assembleNovel } from "@/lib/creation/assembly";

/**
 * 美术工作台本地草稿的 localStorage key 工具。
 *
 * PRD §7.2 / §4.1：嵌入美术台必须按 projectId + sourceUnitId 进行作用域隔离，
 * 不得使用全局 key，否则跨项目/跨集会串资产。资产详情页必须使用与嵌入工作台
 * 完全相同的 scoped key，避免"找不到资产"。
 */
export const ART_WORKBENCH_STORAGE_KEY = "kiikis_art_workbench_state";

/**
 * 派生美术工作台的 localStorage key。
 * - 两参都给：`kiikis_art_workbench_state:<projectId>:<sourceUnitId>`（嵌入模式 / 制作工作台美术 Tab）
 * - 仅 projectId：`kiikis_art_workbench_state:<projectId>`（旧独立美术台兼容）
 * - 都不给：`kiikis_art_workbench_state`（全局 fallback，不推荐）
 */
export function getArtWorkbenchStorageKey(projectId?: string, sourceUnitId?: string): string {
  if (projectId && sourceUnitId) return `${ART_WORKBENCH_STORAGE_KEY}:${projectId}:${sourceUnitId}`;
  if (projectId) return `${ART_WORKBENCH_STORAGE_KEY}:${projectId}`;
  return ART_WORKBENCH_STORAGE_KEY;
}

export type ArtAssetKind = "character" | "scene" | "prop";
export type ArtCharacterPriority = "lead" | "supporting" | "minor";
export type ArtAssetStatus = "draft" | "generating" | "ready" | "error";

export type ArtAsset = {
  id: string;
  kind: ArtAssetKind;
  name: string;
  priority?: ArtCharacterPriority;
  role: string;
  description: string;
  prompt: string;
  negativePrompt: string;
  identityAnchor?: string;
  variants?: ArtAssetVariant[];
  versions?: ArtAssetVersion[];
  approvedVersionId?: string;
  publishedVersionId?: string;
  referenceSheetUrl?: string;
  threeViewUrl?: string;
  conceptUrl?: string;
  provider?: string;
  model?: string;
  status: ArtAssetStatus;
  error?: string;
  updatedAt: string;
};

export type ArtAssetVersion = {
  id: string;
  imageUrl: string;
  storagePath?: string;
  source: "generated" | "uploaded";
  provider?: string;
  model?: string;
  prompt: string;
  createdAt: string;
};

export type ArtAssetVariant = {
  id: string;
  name: string;
  type: "master" | "appearance" | "state";
  prompt: string;
  versions: ArtAssetVersion[];
  approvedVersionId?: string;
};

export type ArtSourceFile = {
  id: string;
  name: string;
  text: string;
  addedAt: string;
};

export type ArtWorkbenchState = {
  id: string;
  title: string;
  projectId?: string;
  projectTitle?: string;
  visualStyle: string;
  sourceText: string;
  sourceFiles: ArtSourceFile[];
  assets: ArtAsset[];
  selectedAssetId?: string;
  updatedAt: string;
};

export type ExtractedArtAssets = {
  title?: string;
  visualStyle?: string;
  characters: Array<Omit<ArtAsset, "id" | "kind" | "status" | "updatedAt">>;
  scenes: Array<Omit<ArtAsset, "id" | "kind" | "status" | "updatedAt">>;
  props: Array<Omit<ArtAsset, "id" | "kind" | "status" | "updatedAt">>;
};

export function createArtId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyArtWorkbenchState(): ArtWorkbenchState {
  const now = new Date().toISOString();
  return {
    id: createArtId("art-project"),
    title: "未命名美术项目",
    visualStyle: "cinematic short drama, production-ready character and environment design, consistent visual bible",
    sourceText: "",
    sourceFiles: [],
    assets: [],
    updatedAt: now,
  };
}

export function createArtAsset(kind: ArtAssetKind, overrides: Partial<ArtAsset> = {}): ArtAsset {
  const now = new Date().toISOString();
  const name = overrides.name?.trim() || (kind === "character" ? "新角色" : kind === "scene" ? "新场景" : "新道具");
  return {
    id: overrides.id || createArtId(`art-${kind}`),
    kind,
    name,
    priority: overrides.priority || (kind === "character" ? "supporting" : undefined),
    role: overrides.role || "",
    description: overrides.description || "",
    prompt: overrides.prompt || buildDefaultAssetPrompt(kind, name, overrides.description || ""),
    negativePrompt: overrides.negativePrompt || "low quality, blurry, inconsistent face, extra limbs, watermark, logo, unreadable text, collage",
    referenceSheetUrl: overrides.referenceSheetUrl,
    threeViewUrl: overrides.threeViewUrl,
    conceptUrl: overrides.conceptUrl,
    provider: overrides.provider,
    model: overrides.model,
    status: overrides.status || "draft",
    error: overrides.error,
    updatedAt: now,
  };
}

export function artStateFromProject(project: DramaProject): Partial<ArtWorkbenchState> {
  return {
    projectId: project.id,
    projectTitle: project.title,
    title: `${project.title || "未命名项目"} 美术设定`,
    visualStyle: project.storyBible?.languageStyle || project.genre || "cinematic short drama, premium vertical series visual style",
    sourceText: [
      project.idea ? `【项目创意】\n${project.idea}` : "",
      project.brief ? `【项目背景】\n${project.brief}` : "",
      project.storyBible ? `【故事圣经】\n${JSON.stringify(project.storyBible, null, 2)}` : "",
      project.characters ? `【角色资料】\n${project.characters}` : "",
      project.characterCards?.length ? `【角色卡】\n${JSON.stringify(project.characterCards, null, 2)}` : "",
      // 剧本正文：优先从 creationWorkspace（创作工作台编辑的剧本）assemble，
      // 再兜底 getSelectedFinalScript / chineseScript / importedScript / finalScriptForeign 等。
      // 修复"美术台解析与剧本无关"根本原因：创作工作台剧本存在 creationWorkspace.screenplay.units 里，
      // 之前 artStateFromProject 完全没读 creationWorkspace，导致 sourceText 只有 idea/brief 元数据。
      (() => {
        let script = "";
        // 1. 优先从 creationWorkspace assemble 剧本（创作工作台编辑的剧本在这里）
        if (project.creationWorkspace?.screenplay?.units?.length) {
          try {
            script = assembleScreenplay(
              project.creationWorkspace,
              "original",
              project.creationWorkspace.settings?.screenplayFormat || "hollywood",
              project.title || "未命名项目",
            ).markdown;
          } catch { /* ignore */ }
        }
        // 2. 如果 screenplay 没有，尝试 novel（小说项目）
        if (!script && project.creationWorkspace?.novel?.units?.length) {
          try {
            script = assembleNovel(
              project.creationWorkspace,
              "original",
              project.title || "未命名项目",
            ).markdown;
          } catch { /* ignore */ }
        }
        // 3. 兜底：从 finalScript 系列字段读取
        if (!script) {
          script = getSelectedFinalScript(project)
            || project.chineseScript
            || project.importedScript
            || project.finalScriptForeign
            || project.finalScriptChinese
            || project.finalScriptBilingual
            || project.finalScript
            || "";
        }
        return script ? `【剧本】\n${script}` : "";
      })(),
    ].filter(Boolean).join("\n\n"),
  };
}

export function assetsFromExtraction(result: ExtractedArtAssets): ArtAsset[] {
  return [
    ...result.characters.map((asset) => createArtAsset("character", asset)),
    ...result.scenes.map((asset) => createArtAsset("scene", asset)),
    ...result.props.map((asset) => createArtAsset("prop", asset)),
  ];
}

export function buildArtImagePrompt(asset: ArtAsset, mode: "reference_sheet" | "three_view" | "concept", visualStyle: string) {
  const base = [
    "Create a high quality production art asset for an AIGC short drama project.",
    `Project visual style: ${visualStyle || "cinematic short drama, production-ready visual bible"}.`,
    `Asset name: ${asset.name}.`,
    asset.role ? `Narrative function: ${asset.role}.` : "",
    asset.description ? `Design description: ${asset.description}.` : "",
    asset.prompt ? `User editable prompt: ${asset.prompt}.` : "",
    asset.negativePrompt ? `Avoid: ${asset.negativePrompt}.` : "",
  ].filter(Boolean);

  if (mode === "reference_sheet") {
    return [
      ...base,
      "Generate a complete character reference sheet on a clean neutral background.",
      "Include full body front view, expressive portrait close-up, costume details, color/material notes through visual design only.",
      "Keep the same face, body proportion, hairstyle, wardrobe, and identity across the sheet.",
      "No labels, no text, no watermark.",
    ].join("\n");
  }

  if (mode === "three_view") {
    return [
      ...base,
      "Generate a professional three-view character turnaround sheet.",
      "Show front view, side view, and back view in one image, full body, same pose height and consistent proportions.",
      "Use a plain studio background. Keep face, hair, body, costume, silhouette, and accessories exactly consistent.",
      "No labels, no text, no watermark.",
    ].join("\n");
  }

  return [
    ...base,
    asset.kind === "scene"
      ? "Generate a production-ready environment concept image with clear spatial layout, lighting direction, props, mood, and camera-friendly composition."
      : asset.kind === "prop"
        ? "Generate a production-ready key prop concept image with scale, material, distinctive silhouette, and close-up readable details."
        : "Generate a production-ready character concept image with clear full-body identity, face, costume, silhouette, and cinematic lighting.",
    "No labels, no text, no watermark.",
  ].join("\n");
}

export function fallbackExtractArtAssets(source: string): ExtractedArtAssets {
  const clean = source.replace(/\s+/g, " ").trim();
  const characterCandidates = extractCharacterCandidates(source);
  const names = characterCandidates.length
    ? characterCandidates.map((item) => item.name)
    : Array.from(new Set((clean.match(/\b[A-Z][A-Za-zÀ-ÿ'·-]{2,24}\b/g) || [])
      .filter((name) => !isBlockedFallbackName(name))
      .slice(0, 8)));
  const firstSentence = source.split(/[。！？.!?\n]/).map((item) => item.trim()).find(Boolean) || "根据项目资料生成的视觉资产。";
  const projectTitle = source.match(/《([^》]{2,40})》/)?.[1] || "美术资产拆解";

  // 从 sourceText 提取场景关键词（避免固定字符串与剧本无关）
  const sceneKeywords = extractSceneKeywords(source);
  const propKeywords = extractPropKeywords(source);

  return {
    title: `${projectTitle} 美术资产拆解`,
    visualStyle: "cinematic short drama, consistent production design, realistic streaming series quality",
    characters: (names.length ? names.slice(0, 4) : ["主角", "重要配角"]).map((name, index) => ({
      name,
      priority: index === 0 ? "lead" : "supporting",
      role: index === 0 ? "主角 / 核心叙事人物" : "重要配角",
      description: characterCandidates.find((item) => item.name === name)?.description || firstSentence,
      prompt: `Character design for ${name}, ${characterCandidates.find((item) => item.name === name)?.description || firstSentence}, cinematic short drama, consistent face, full body, production-ready costume`,
      negativePrompt: "low quality, blurry, inconsistent face, extra limbs, watermark, logo, text",
    })),
    scenes: (sceneKeywords.length ? sceneKeywords : ["主场景"]).map((name, index) => ({
      name,
      role: index === 0 ? "主要拍摄空间" : "次要场景",
      description: extractSceneDescription(source, name) || firstSentence,
      prompt: `${name}, cinematic environment concept, clear spatial layout, dramatic lighting, production-ready short drama scene`,
      negativePrompt: "low quality, blurry, watermark, logo, text, cluttered composition",
    })),
    props: (propKeywords.length ? propKeywords : ["关键道具"]).map((name) => ({
      name,
      role: "剧情推动道具",
      description: extractSceneDescription(source, name) || firstSentence,
      prompt: `${name}, key prop concept art, clear material, readable silhouette, cinematic product-style lighting`,
      negativePrompt: "low quality, blurry, watermark, logo, text",
    })),
  };
}

/**
 * 从 sourceText 提取场景关键词。
 * 匹配"场景：xxx"、"地点：xxx"、"在xxx"、"xxx里/中/内"等中文场景表达。
 */
function extractSceneKeywords(source: string): string[] {
  const keywords: string[] = [];
  // 匹配 "场景：xxx"、"地点：xxx"、"场景-xxx"
  const explicit = source.match(/(?:场景|地点|空间|环境)[：:\-——]\s*([^，,。.\n]{2,20})/g);
  if (explicit) {
    for (const m of explicit) {
      const k = m.replace(/(?:场景|地点|空间|环境)[：:\-——]\s*/, "").trim();
      if (k && !keywords.includes(k)) keywords.push(k);
    }
  }
  // 匹配 "在xxx里/中/内/前/后" 等
  const location = source.match(/在([\u4e00-\u9fa5]{2,8})(?:里|中|内|前|后|上|下)/g);
  if (location) {
    for (const m of location) {
      const k = m.replace(/在/, "").replace(/(?:里|中|内|前|后|上|下)$/, "").trim();
      if (k && k.length >= 2 && !keywords.includes(k)) keywords.push(k);
    }
  }
  return keywords.slice(0, 4);
}

/**
 * 从 sourceText 提取道具关键词。
 * 匹配"道具：xxx"、"xxx（道具）"、常见道具名词（信、戒指、刀、车等）。
 */
function extractPropKeywords(source: string): string[] {
  const keywords: string[] = [];
  // 匹配 "道具：xxx"
  const explicit = source.match(/(?:道具|物品|物件)[：:\-——]\s*([^，,。.\n]{2,20})/g);
  if (explicit) {
    for (const m of explicit) {
      const k = m.replace(/(?:道具|物品|物件)[：:\-——]\s*/, "").trim();
      if (k && !keywords.includes(k)) keywords.push(k);
    }
  }
  // 常见道具名词
  const commonProps = ["信", "信件", "戒指", "项链", "刀", "剑", "枪", "车", "钥匙", "手机", "日记本", "照片", "合同", "遗嘱", "地图", "宝箱"];
  for (const prop of commonProps) {
    if (source.includes(prop) && !keywords.includes(prop)) {
      keywords.push(prop);
    }
  }
  return keywords.slice(0, 3);
}

/**
 * 从 sourceText 提取包含关键词的句子作为描述。
 */
function extractSceneDescription(source: string, keyword: string): string {
  const sentences = source.split(/[。！？.!?\n]/).map((s) => s.trim()).filter(Boolean);
  const match = sentences.find((s) => s.includes(keyword));
  return match || "";
}

function extractCharacterCandidates(source: string) {
  const lines = source
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•\d.、\s]+/, "").trim())
    .filter(Boolean);
  const candidates: Array<{ name: string; description: string }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^([A-Z][A-Za-zÀ-ÿ'·-]{2,24}|[\u4e00-\u9fa5]{2,8})\s*(?:是|:|：|—|-)\s*(.{4,220})/);
    if (!match) continue;
    const name = match[1].trim();
    if (isBlockedFallbackName(name) || candidates.some((item) => item.name === name)) continue;
    const nextLine = lines[index + 1] && !lines[index + 1].match(/^([A-Z][A-Za-zÀ-ÿ'·-]{2,24}|[\u4e00-\u9fa5]{2,8})\s*(?:是|:|：|—|-)/)
      ? ` ${lines[index + 1].slice(0, 160)}`
      : "";
    candidates.push({
      name,
      description: `${match[2].trim()}${nextLine}`.slice(0, 360),
    });
  }

  return candidates.slice(0, 12);
}

function isBlockedFallbackName(name: string) {
  const lower = name.toLowerCase();
  return [
    "character",
    "bible",
    "final",
    "version",
    "project",
    "script",
    "角色",
    "场景",
    "剧本",
    "故事",
    "背景",
    "项目",
    "资料",
    "特别注意",
  ].includes(lower) || ["角色圣经", "契约之家", "characterbible"].includes(name);
}

function buildDefaultAssetPrompt(kind: ArtAssetKind, name: string, description: string) {
  const target = kind === "character" ? "character design" : kind === "scene" ? "environment concept" : "key prop concept";
  return `${target} for ${name}, ${description || "production-ready AIGC short drama visual bible"}, cinematic, consistent, high detail`;
}
