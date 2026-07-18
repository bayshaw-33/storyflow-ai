// 演员库 UI 纯逻辑：卡片视图模型、generate-views 契约解析、参演作品解析。
// 可擦除 TS（无 enum/namespace/参数属性），node:test 可直接 import。

export type ActorLike = {
  id: string;
  name?: string | null;
  visibility?: string | null;
  status?: string | null;
  avatar_url?: string | null;
  age_range?: string | null;
  gender_expression?: string | null;
  ethnicity_style?: string | null;
  temperament?: unknown;
  playable_roles?: unknown;
  updated_at?: string | null;
};

// POST /api/actors/generate-views {actorId, pack} → {versions:[{versionId,previewUrl,pack}]}
export type ViewVersion = {
  versionId: string;
  previewUrl: string;
  pack: string;
  createdAt?: string | null;
};

export const ACTOR_VIEW_PACKS = [
  { id: "three_view_casual", zh: "三视图 · 白T牛仔", en: "Three-view · White tee & jeans" },
  { id: "three_view_swim", zh: "三视图 · 泳装", en: "Three-view · Swimwear" },
  { id: "expressions", zh: "表情组", en: "Expression set" },
  { id: "body_details", zh: "身体细节", en: "Body details" },
] as const;

export type ViewPackId = (typeof ACTOR_VIEW_PACKS)[number]["id"];

export type PortrayalLike = {
  id: string;
  actor_profile_id?: string | null;
  character_id?: string | null;
  project_id?: string | null;
  portrayal_name?: string | null;
  visual_prompt?: string | null;
  costume_direction?: string | null;
  reference_image_url?: string | null;
  is_reusable?: boolean | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type ActorCardModel = {
  id: string;
  name: string;
  initials: string;
  avatarUrl: string;
  tags: string[];
  status: string;
  visibility: string;
  subtitle: string;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeTagList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,，、\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function actorInitials(name: unknown): string {
  const text = cleanText(name);
  if (!text) return "A";
  // 中文名取最后一个字（更像名片印章），其他语言取首字母。
  const chars = Array.from(text);
  const last = chars[chars.length - 1] || "A";
  if (/[一-鿿]/.test(last)) return last;
  return (chars[0] || "A").toUpperCase();
}

export function toActorCard(actor: ActorLike, maxTags = 4): ActorCardModel {
  const temperament = normalizeTagList(actor.temperament);
  const roles = normalizeTagList(actor.playable_roles);
  const tags = [...temperament, ...roles].filter((tag, index, list) => list.indexOf(tag) === index);
  const subtitleParts = [cleanText(actor.age_range), cleanText(actor.gender_expression)].filter(Boolean);
  return {
    id: String(actor.id || ""),
    name: cleanText(actor.name) || "未命名演员",
    initials: actorInitials(actor.name),
    avatarUrl: cleanText(actor.avatar_url),
    tags: tags.slice(0, Math.max(0, maxTags)),
    status: cleanText(actor.status) || "draft",
    visibility: actor.visibility === "team" ? "team" : "private",
    subtitle: subtitleParts.join(" · "),
  };
}

export function filterActors<T extends ActorLike>(actors: T[], query: unknown): T[] {
  const needle = cleanText(query).toLowerCase();
  if (!needle) return actors;
  return actors.filter((actor) => {
    const haystack = [
      cleanText(actor.name),
      ...normalizeTagList(actor.temperament),
      ...normalizeTagList(actor.playable_roles),
      cleanText(actor.age_range),
      cleanText(actor.gender_expression),
      cleanText(actor.ethnicity_style),
    ]
      .join("\n")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

function normalizeOneVersion(raw: unknown): ViewVersion | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const versionId = cleanText(record.versionId ?? record.version_id ?? record.id);
  const previewUrl = cleanText(record.previewUrl ?? record.preview_url ?? record.url);
  const pack = cleanText(record.pack);
  if (!previewUrl) return null;
  return {
    versionId: versionId || `v-${previewUrl.slice(-24)}`,
    previewUrl,
    pack,
    createdAt: cleanText(record.createdAt ?? record.created_at) || null,
  };
}

// 宽松解析 generate-views 响应：坏数据一律降级为空数组，绝不抛错。
export function normalizeViewVersions(payload: unknown): ViewVersion[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const list = Array.isArray(record.versions) ? record.versions : [];
  return list.map(normalizeOneVersion).filter((item): item is ViewVersion => Boolean(item));
}

// 合并同一 pack 的版本：按 versionId 去重，新版本在前，保持服务端顺序优先。
export function mergeVersions(existing: ViewVersion[], incoming: ViewVersion[]): ViewVersion[] {
  const seen = new Set<string>();
  const merged: ViewVersion[] = [];
  for (const version of [...incoming, ...existing]) {
    if (!version.previewUrl || seen.has(version.versionId)) continue;
    seen.add(version.versionId);
    merged.push(version);
  }
  return merged;
}

export function groupVersionsByPack(versions: ViewVersion[]): Record<string, ViewVersion[]> {
  const grouped: Record<string, ViewVersion[]> = {};
  for (const version of versions) {
    const key = version.pack || "unknown";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(version);
  }
  return grouped;
}

export function normalizePortrayals(payload: unknown): PortrayalLike[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const list = Array.isArray(record.portrayals) ? record.portrayals : [];
  return list
    .map((raw): PortrayalLike | null => {
      if (!raw || typeof raw !== "object") return null;
      const item = raw as Record<string, unknown>;
      const id = cleanText(item.id);
      if (!id) return null;
      return {
        id,
        actor_profile_id: cleanText(item.actor_profile_id) || null,
        character_id: cleanText(item.character_id) || null,
        project_id: cleanText(item.project_id) || null,
        portrayal_name: cleanText(item.portrayal_name) || null,
        visual_prompt: cleanText(item.visual_prompt) || null,
        costume_direction: cleanText(item.costume_direction) || null,
        reference_image_url: cleanText(item.reference_image_url) || null,
        is_reusable: typeof item.is_reusable === "boolean" ? item.is_reusable : null,
        updated_at: cleanText(item.updated_at) || null,
        created_at: cleanText(item.created_at) || null,
      } satisfies PortrayalLike;
    })
    .filter((item): item is PortrayalLike => Boolean(item));
}

export function buildExportFileName(actorName: unknown): string {
  const base = cleanText(actorName)
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "actor"}-reference-sheet.png`;
}
