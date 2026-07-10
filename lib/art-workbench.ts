import type { DramaProject } from "@/lib/projects";

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
      project.finalScript || project.chineseScript || project.importedScript
        ? `【剧本】\n${project.finalScript || project.chineseScript || project.importedScript}`
        : "",
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
    scenes: ["核心室内场景", "关键冲突场景"].map((name) => ({
      name,
      role: "主要拍摄空间",
      description: firstSentence,
      prompt: `${name}, cinematic environment concept, clear spatial layout, dramatic lighting, production-ready short drama scene`,
      negativePrompt: "low quality, blurry, watermark, logo, text, cluttered composition",
    })),
    props: ["关键道具"].map((name) => ({
      name,
      role: "剧情推动道具",
      description: firstSentence,
      prompt: `${name}, key prop concept art, clear material, readable silhouette, cinematic product-style lighting`,
      negativePrompt: "low quality, blurry, watermark, logo, text",
    })),
  };
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
