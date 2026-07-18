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
  owner_id?: string | null;
  team_id?: string | null;
};

// GET /api/actors/:actorId → { actor: ActorDetail, requestId }
// imagePackCompleteness + portrayalCount 由详情端点附加；列表端点可能为 undefined。
export type ImagePackCompleteness = {
  avatar: boolean;
  threeViewCasual: boolean;
  threeViewSwimwear: boolean;
  expressions: boolean;
  bodyDetails: boolean;
};

export type ActorDetail = ActorLike & {
  imagePackCompleteness?: ImagePackCompleteness;
  portrayalCount?: number;
};

// POST /api/actors/generate-views {actorId, pack} → {versions:[{versionId,previewUrl,pack,shotKey,isPrimary}]}
// 每条版本必须明确返回 pack + shotKey，前端不再自行补 pack。
export type ViewVersion = {
  versionId: string;
  previewUrl: string;
  pack: string;
  shotKey?: string;
  createdAt?: string | null;
  isPrimary?: boolean;
};

/**
 * Canonical ActorViewPackKey — UI / API / 状态 / 导出 / 完整度统计全部使用该 key。
 * 旧 underscore key 由 normalizePackKey 兼容归一化（向后兼容旧页面缓存）。
 */
export type ActorViewPackKey = "three-view-casual" | "three-view-swimwear" | "expressions" | "body-details";

export const ACTOR_VIEW_PACKS = [
  { id: "three-view-casual", zh: "三视图 · 白T牛仔", en: "Three-view · White tee & jeans" },
  { id: "three-view-swimwear", zh: "三视图 · 泳装", en: "Three-view · Swimwear" },
  { id: "expressions", zh: "表情组", en: "Expression set" },
  { id: "body-details", zh: "身体细节", en: "Body details" },
] as const;

export type ViewPackId = (typeof ACTOR_VIEW_PACKS)[number]["id"];

/**
 * 旧 underscore pack key 归一化为 canonical key。
 * 兼容旧前端缓存 / 旧 API 调用：
 *   three_view_casual → three-view-casual
 *   three_view_swim / three_view_swimwear → three-view-swimwear
 *   body_details → body-details
 * 未知值原样返回（让上层校验拒绝）。
 */
export function normalizePackKey(raw: unknown): ActorViewPackKey | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  switch (trimmed) {
    case "three-view-casual":
    case "three_view_casual":
      return "three-view-casual";
    case "three-view-swimwear":
    case "three_view_swim":
    case "three_view_swimwear":
      return "three-view-swimwear";
    case "expressions":
      return "expressions";
    case "body-details":
    case "body_details":
      return "body-details";
    default:
      return null;
  }
}

// PortrayalLike 兼容两种来源：
// 1. 旧 raw 行（snake_case 字段，来自直查 portrayal 表）
// 2. 新 API PortrayalCard（camelCase 字段，含 workTitle / universeName / characterName）
// UI 层用 toPortrayalCard 取统一字段，禁止裸 project_id 暴露给用户。
export type PortrayalLike = {
  id: string;
  // legacy raw fields
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
  // new API PortrayalCard fields
  workTitle?: string | null;
  universeName?: string | null;
  characterName?: string | null;
  costumeDirection?: string | null;
  visualPrompt?: string | null;
  referenceImageUrl?: string | null;
  isReusable?: boolean | null;
};

// 统一对外暴露的参演作品视图模型：禁止 project_id。
export type PortrayalCard = {
  id: string;
  workTitle: string;
  universeName: string;
  characterName: string;
  costumeDirection: string;
  visualPrompt: string;
  referenceImageUrl: string;
  isReusable: boolean;
  updatedAt: string;
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
  portrayalCount: number;
  updatedAt: string;
};

export type ActorStatusFilter = "all" | "ready" | "draft";

export type ActorSortKey = "updated" | "name" | "portrayals";

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
  const detail = actor as ActorDetail;
  const portrayalCount = typeof detail.portrayalCount === "number" && detail.portrayalCount >= 0 ? detail.portrayalCount : 0;
  return {
    id: String(actor.id || ""),
    name: cleanText(actor.name) || "未命名演员",
    initials: actorInitials(actor.name),
    avatarUrl: cleanText(actor.avatar_url),
    tags: tags.slice(0, Math.max(0, maxTags)),
    status: cleanText(actor.status) || "draft",
    visibility: actor.visibility === "team" ? "team" : "private",
    subtitle: subtitleParts.join(" · "),
    portrayalCount,
    updatedAt: cleanText(actor.updated_at),
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

export function filterByStatus<T extends ActorLike>(actors: T[], status: ActorStatusFilter): T[] {
  if (status === "all") return actors;
  return actors.filter((actor) => {
    const current = cleanText(actor.status) || "draft";
    return current === status;
  });
}

export function filterByTag<T extends ActorLike>(actors: T[], tag: string): T[] {
  const needle = cleanText(tag).toLowerCase();
  if (!needle) return actors;
  return actors.filter((actor) => {
    const tags = [...normalizeTagList(actor.temperament), ...normalizeTagList(actor.playable_roles)].map((tag) => tag.toLowerCase());
    return tags.includes(needle);
  });
}

// 收集所有 actors 的气质/角色标签，按出现频次倒序，最多 maxCount 个。
export function collectActorTags<T extends ActorLike>(actors: T[], maxCount = 12): string[] {
  const counter = new Map<string, number>();
  for (const actor of actors) {
    for (const tag of [...normalizeTagList(actor.temperament), ...normalizeTagList(actor.playable_roles)]) {
      const key = tag.toLowerCase();
      counter.set(key, (counter.get(key) || 0) + 1);
    }
  }
  return Array.from(counter.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxCount)
    .map(([key]) => key);
}

export function sortActors<T extends ActorLike>(actors: T[], key: ActorSortKey): T[] {
  const list = [...actors];
  if (key === "name") {
    list.sort((a, b) => cleanText(a.name).localeCompare(cleanText(b.name), "zh-Hans"));
  } else if (key === "portrayals") {
    list.sort((a, b) => {
      const aCount = (a as ActorDetail).portrayalCount || 0;
      const bCount = (b as ActorDetail).portrayalCount || 0;
      if (bCount !== aCount) return bCount - aCount;
      return cleanText(b.updated_at).localeCompare(cleanText(a.updated_at));
    });
  } else {
    // 默认按最近更新倒序
    list.sort((a, b) => cleanText(b.updated_at).localeCompare(cleanText(a.updated_at)));
  }
  return list;
}

function normalizeOneVersion(raw: unknown): ViewVersion | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const versionId = cleanText(record.versionId ?? record.version_id ?? record.id);
  const previewUrl = cleanText(record.previewUrl ?? record.preview_url ?? record.url);
  const pack = cleanText(record.pack);
  if (!previewUrl) return null;
  const isPrimary = typeof record.isPrimary === "boolean"
    ? record.isPrimary
    : typeof record.is_primary === "boolean"
      ? record.is_primary
      : false;
  const shotKey = cleanText(record.shotKey ?? record.shot_key);
  return {
    versionId: versionId || `v-${previewUrl.slice(-24)}`,
    previewUrl,
    pack,
    shotKey: shotKey || undefined,
    createdAt: cleanText(record.createdAt ?? record.created_at) || null,
    isPrimary,
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
// 旧 isPrimary 标记保留；incoming 显式 isPrimary=true 时清掉旧主版本。
export function mergeVersions(existing: ViewVersion[], incoming: ViewVersion[]): ViewVersion[] {
  let promoted = false;
  for (const v of incoming) {
    if (v.isPrimary) promoted = true;
  }
  const seen = new Set<string>();
  const merged: ViewVersion[] = [];
  // promoted 时：incoming 里的 isPrimary 保持，existing 的所有 isPrimary 清零（让 incoming 接管）。
  // 未 promoted 时：保留各自原有 isPrimary 状态。
  const push = (version: ViewVersion, fromIncoming: boolean) => {
    if (!version.previewUrl || seen.has(version.versionId)) return;
    seen.add(version.versionId);
    const effectiveIsPrimary = promoted
      ? (fromIncoming ? version.isPrimary : false)
      : version.isPrimary;
    merged.push({ ...version, isPrimary: effectiveIsPrimary });
  };
  for (const version of incoming) push(version, true);
  for (const version of existing) push(version, false);
  // 若没有任何 isPrimary，自动把第一条标记为主版本以便 UI 高亮。
  if (merged.length && !merged.some((v) => v.isPrimary)) {
    merged[0] = { ...merged[0], isPrimary: true };
  }
  return merged;
}

// 单独把某个 versionId 标记为主版本，并清掉其他主版本标记。
export function markVersionPrimary(versions: ViewVersion[], versionId: string): ViewVersion[] {
  let found = false;
  const next = versions.map((version) => {
    if (version.versionId === versionId) {
      found = true;
      return { ...version, isPrimary: true };
    }
    return { ...version, isPrimary: false };
  });
  if (!found && versions.length) {
    next[0] = { ...next[0], isPrimary: true };
  }
  return next;
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

// 宽松解析 /api/actors/portrayals 响应：兼容新 PortrayalCard（camelCase）与旧 raw 行（snake_case）。
// 旧测试只检查 portrayal_name 字段保留，新 UI 用 toPortrayalCard 取统一字段。
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
      const isReusable = typeof item.isReusable === "boolean"
        ? item.isReusable
        : typeof item.is_reusable === "boolean"
          ? item.is_reusable
          : null;
      return {
        id,
        actor_profile_id: cleanText(item.actor_profile_id) || null,
        character_id: cleanText(item.character_id) || null,
        project_id: cleanText(item.project_id) || null,
        portrayal_name: cleanText(item.portrayal_name) || null,
        visual_prompt: cleanText(item.visual_prompt) || null,
        costume_direction: cleanText(item.costume_direction) || null,
        reference_image_url: cleanText(item.reference_image_url) || null,
        is_reusable: isReusable,
        updated_at: cleanText(item.updated_at) || null,
        created_at: cleanText(item.created_at) || null,
        workTitle: cleanText(item.workTitle) || null,
        universeName: cleanText(item.universeName) || null,
        characterName: cleanText(item.characterName) || null,
        costumeDirection: cleanText(item.costumeDirection) || null,
        visualPrompt: cleanText(item.visualPrompt) || null,
        referenceImageUrl: cleanText(item.referenceImageUrl) || null,
        isReusable,
      } satisfies PortrayalLike;
    })
    .filter((item): item is PortrayalLike => Boolean(item));
}

// 把 PortrayalLike 映射为 UI 卡片模型：禁止 project_id 暴露。
export function toPortrayalCard(input: PortrayalLike, fallbacks: { untitledWork: string; untitledCharacter: string }): PortrayalCard {
  const workTitle = cleanText(input.workTitle) || cleanText(input.portrayal_name) || fallbacks.untitledWork;
  const characterName = cleanText(input.characterName) || cleanText(input.portrayal_name) || cleanText(input.character_id) || fallbacks.untitledCharacter;
  const costumeDirection = cleanText(input.costumeDirection) || cleanText(input.costume_direction);
  const visualPrompt = cleanText(input.visualPrompt) || cleanText(input.visual_prompt);
  const referenceImageUrl = cleanText(input.referenceImageUrl) || cleanText(input.reference_image_url);
  const isReusable = typeof input.isReusable === "boolean" ? input.isReusable : typeof input.is_reusable === "boolean" ? input.is_reusable : true;
  const universeName = cleanText(input.universeName);
  const updatedAt = cleanText(input.updated_at) || cleanText(input.created_at);
  return {
    id: input.id,
    workTitle,
    universeName,
    characterName,
    costumeDirection,
    visualPrompt,
    referenceImageUrl,
    isReusable,
    updatedAt,
  };
}

// 把 GET /api/actors/:actorId 的响应宽松解析为 ActorDetail。
export function normalizeActorDetail(payload: unknown): ActorDetail | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const actor = record.actor;
  if (!actor || typeof actor !== "object") return null;
  const raw = actor as Record<string, unknown>;
  const id = cleanText(raw.id);
  if (!id) return null;
  const completeness = raw.imagePackCompleteness;
  const imagePackCompleteness: ImagePackCompleteness | undefined =
    completeness && typeof completeness === "object"
      ? {
          avatar: Boolean((completeness as Record<string, unknown>).avatar),
          threeViewCasual: Boolean((completeness as Record<string, unknown>).threeViewCasual),
          threeViewSwimwear: Boolean((completeness as Record<string, unknown>).threeViewSwimwear),
          expressions: Boolean((completeness as Record<string, unknown>).expressions),
          bodyDetails: Boolean((completeness as Record<string, unknown>).bodyDetails),
        }
      : undefined;
  const portrayalCountRaw = (raw as Record<string, unknown>).portrayalCount;
  const portrayalCount = typeof portrayalCountRaw === "number" && Number.isFinite(portrayalCountRaw) ? Math.max(0, Math.floor(portrayalCountRaw)) : undefined;
  return {
    id,
    name: cleanText(raw.name) || null,
    visibility: cleanText(raw.visibility) || null,
    status: cleanText(raw.status) || null,
    avatar_url: cleanText(raw.avatar_url) || null,
    age_range: cleanText(raw.age_range) || null,
    gender_expression: cleanText(raw.gender_expression) || null,
    ethnicity_style: cleanText(raw.ethnicity_style) || null,
    temperament: raw.temperament,
    playable_roles: raw.playable_roles,
    updated_at: cleanText(raw.updated_at) || null,
    owner_id: cleanText(raw.owner_id) || null,
    team_id: cleanText(raw.team_id) || null,
    imagePackCompleteness,
    portrayalCount,
  };
}

export function buildExportFileName(actorName: unknown): string {
  const base = cleanText(actorName)
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "actor"}-reference-sheet.png`;
}

// 计算身份资料完成度（0-100）。PRD §7.2 顶部身份区展示。
// 主头像 + 年龄 + 性别 + 族裔 + 脸型 + 发型 + 体型 + 气质 + 简介 + 至少一个图组 = 各占权重。
export function computeProfileCompleteness(actor: {
  avatar_url?: string | null;
  age_range?: string | null;
  gender_expression?: string | null;
  ethnicity_style?: string | null;
  face_description?: string | null;
  hair_description?: string | null;
  body_description?: string | null;
  temperament?: unknown;
  playable_roles?: unknown;
  bio?: string | null;
  base_prompt?: string | null;
  imagePackCompleteness?: ImagePackCompleteness;
}): { percent: number; filled: number; total: number } {
  const fields: Array<boolean> = [
    Boolean(cleanText(actor.avatar_url)),
    Boolean(cleanText(actor.age_range)),
    Boolean(cleanText(actor.gender_expression)),
    Boolean(cleanText(actor.ethnicity_style)),
    Boolean(cleanText(actor.face_description)),
    Boolean(cleanText(actor.hair_description)),
    Boolean(cleanText(actor.body_description)),
    normalizeTagList(actor.temperament).length > 0,
    normalizeTagList(actor.playable_roles).length > 0,
    Boolean(cleanText(actor.bio)),
  ];
  const total = fields.length;
  const filled = fields.filter(Boolean).length;
  const percent = total === 0 ? 0 : Math.round((filled / total) * 100);
  return { percent, filled, total };
}
