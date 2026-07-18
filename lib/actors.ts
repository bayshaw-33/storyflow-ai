export type TeamRole = "owner" | "admin" | "editor" | "viewer";
export type TeamMemberStatus = "active" | "invited" | "removed";
export type ActorVisibility = "private" | "team";
export type ActorStatus = "draft" | "ready" | "archived";
export type AppearanceVariantStatus = "draft" | "approved" | "archived";

export type Team = {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type TeamMember = {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamRole;
  status: TeamMemberStatus;
  created_at: string;
  updated_at: string;
};

export type ActorProfile = {
  id: string;
  owner_id: string;
  team_id?: string | null;
  visibility: ActorVisibility;
  name: string;
  bio: string;
  age_range: string;
  gender_expression: string;
  ethnicity_style: string;
  face_description: string;
  hair_description: string;
  body_description: string;
  temperament: string[];
  playable_roles: string[];
  base_prompt: string;
  negative_prompt: string;
  avatar_asset_id?: string | null;
  reference_sheet_asset_id?: string | null;
  status: ActorStatus;
  created_at: string;
  updated_at: string;
  avatar_url?: string | null;
  reference_sheet_url?: string | null;
  storage_source?: "structured" | "project_snapshot";
  metadata?: {
    identity_passport?: {
      identity_core_prompt?: string;
      current_appearance_prompt?: string;
      scene_override_prompt?: string;
    };
    [key: string]: unknown;
  };
};

export type ActorProfileInput = {
  team_id?: string | null;
  visibility?: ActorVisibility;
  name?: string;
  bio?: string;
  age_range?: string;
  gender_expression?: string;
  ethnicity_style?: string;
  face_description?: string;
  hair_description?: string;
  body_description?: string;
  temperament?: string[] | string;
  playable_roles?: string[] | string;
  base_prompt?: string;
  negative_prompt?: string;
  uploaded_avatar_data_url?: string;
  metadata?: {
    identity_passport?: {
      identity_core_prompt?: string;
      current_appearance_prompt?: string;
      scene_override_prompt?: string;
    };
    [key: string]: unknown;
  };
};

export type CharacterAppearanceVariant = {
  id: string;
  user_id: string;
  project_id: string;
  universe_id?: string | null;
  actor_id: string;
  universe_entity_id?: string | null;
  character_name: string;
  project_style: string;
  costume_direction: string;
  prompt_pack: Record<string, string>;
  front_asset_id?: string | null;
  three_view_asset_id?: string | null;
  reference_sheet_asset_id?: string | null;
  status: AppearanceVariantStatus;
  created_at: string;
  updated_at: string;
};

export const ACTOR_REFERENCE_SHEET_PROMPT_TEMPLATE = `为图1生成专业完整角色参考表，
纯白色无缝背景上干净整洁的网格布局，
该表包括：
主全身体态转面图（正面、3/4 视角、侧面、背面），
左侧有主体身份+比例尺（最大），右上角有6-8 色调色板，
8 帧情绪进阶，5 帧微表情，多角度头部细节表，
中性站姿，姿态变化，1 张特写，
底部一排为服装和配饰特写细节（头发质地、外套面料、鞋子、配饰细节），
多种手势参考，角色轮廓指南。
所有画面中人物的脸部和身体比例一致，
4:3 横版，完美布局对齐。

演员基础信息：
{actorProfile}

头像参考：
{avatarReference}

项目画风：
{projectStyle}

角色设定：
{characterRole}

服装与妆造：
{costumeDirection}

必须保持：
- 同一张脸
- 同一身体比例
- 同一发型和关键识别点
- 参考表排版整齐
- 不生成多个人物`;

export function normalizeActorInput(input: ActorProfileInput) {
  return {
    team_id: input.team_id || null,
    visibility: input.visibility === "team" ? "team" : "private" as ActorVisibility,
    name: cleanText(input.name),
    bio: cleanText(input.bio),
    age_range: cleanText(input.age_range),
    gender_expression: cleanText(input.gender_expression),
    ethnicity_style: cleanText(input.ethnicity_style),
    face_description: cleanText(input.face_description),
    hair_description: cleanText(input.hair_description),
    body_description: cleanText(input.body_description),
    temperament: normalizeTags(input.temperament),
    playable_roles: normalizeTags(input.playable_roles),
    base_prompt: cleanText(input.base_prompt),
    negative_prompt: cleanText(input.negative_prompt),
    metadata: input.metadata ?? undefined,
  };
}

/**
 * 生成提示词专用合并：输入字段为空时保留已有演员数据，避免只传 actorId 的
 * 重新生成请求把已有 name/face_description 等字段覆盖为空（数据损毁 bug）。
 * 非空输入字段仍然覆盖已有值。
 */
export function mergeActorPromptInput(existing: Partial<ActorProfile>, input: ActorProfileInput): ActorProfileInput {
  const normalized = normalizeActorInput(input);
  const keepText = (incoming: string, fallback: unknown) => incoming || cleanText(fallback);
  const keepTags = (incoming: string[], fallback: unknown) => (incoming.length ? incoming : normalizeTags(fallback));

  return {
    team_id: normalized.team_id || existing.team_id || null,
    visibility: input.visibility ? normalized.visibility : existing.visibility === "team" ? "team" : "private",
    name: keepText(normalized.name, existing.name),
    bio: keepText(normalized.bio, existing.bio),
    age_range: keepText(normalized.age_range, existing.age_range),
    gender_expression: keepText(normalized.gender_expression, existing.gender_expression),
    ethnicity_style: keepText(normalized.ethnicity_style, existing.ethnicity_style),
    face_description: keepText(normalized.face_description, existing.face_description),
    hair_description: keepText(normalized.hair_description, existing.hair_description),
    body_description: keepText(normalized.body_description, existing.body_description),
    temperament: keepTags(normalized.temperament, existing.temperament),
    playable_roles: keepTags(normalized.playable_roles, existing.playable_roles),
    base_prompt: keepText(normalized.base_prompt, existing.base_prompt),
    negative_prompt: keepText(normalized.negative_prompt, existing.negative_prompt),
    metadata: input.metadata ?? existing.metadata ?? undefined,
  };
}

export function buildActorBasePrompt(actor: Partial<ActorProfile | ActorProfileInput>) {
  const parts = [
    "Virtual actor portrait, original fictional performer, not a real person.",
    actor.name ? `Name: ${actor.name}.` : "",
    actor.age_range ? `Age impression: ${actor.age_range}.` : "",
    actor.gender_expression ? `Gender expression: ${actor.gender_expression}.` : "",
    actor.ethnicity_style ? `Ethnicity and regional visual tone: ${actor.ethnicity_style}.` : "",
    actor.face_description ? `Face: ${actor.face_description}.` : "",
    actor.hair_description ? `Hair: ${actor.hair_description}.` : "",
    actor.body_description ? `Body proportion: ${actor.body_description}.` : "",
    tagsToText(actor.temperament, "Temperament"),
    tagsToText(actor.playable_roles, "Playable roles"),
    actor.bio ? `Creative note: ${actor.bio}.` : "",
    "Consistent identity, clean production-ready character asset, high fidelity facial consistency.",
  ];

  return parts.filter(Boolean).join("\n");
}

export function buildActorNegativePrompt(actor: Partial<ActorProfile | ActorProfileInput>) {
  const base = [
    "real celebrity",
    "public figure",
    "inconsistent face",
    "extra limbs",
    "multiple people",
    "distorted hands",
    "text artifacts",
    "watermark",
    "logo",
    "low resolution",
  ];
  const custom = cleanText(actor.negative_prompt);
  return custom ? `${base.join(", ")}, ${custom}` : base.join(", ");
}

export function buildReferenceSheetPrompt(params: {
  actor: Partial<ActorProfile | ActorProfileInput>;
  avatarReference?: string;
  projectStyle?: string;
  characterRole?: string;
  costumeDirection?: string;
}) {
  return ACTOR_REFERENCE_SHEET_PROMPT_TEMPLATE
    .replace("{actorProfile}", buildActorBasePrompt(params.actor))
    .replace("{avatarReference}", params.avatarReference || "Use the uploaded or generated actor avatar as the primary facial identity reference.")
    .replace("{projectStyle}", params.projectStyle || "Kiikis cinematic vertical short drama style, production-ready, consistent design.")
    .replace("{characterRole}", params.characterRole || "Not specified. Keep this as the actor's neutral base reference sheet.")
    .replace("{costumeDirection}", params.costumeDirection || "Neutral modern costume, no story-specific canon override.");
}

export function createEmptyActorInput(): Required<Omit<ActorProfileInput, "uploaded_avatar_data_url">> {
  return {
    team_id: null,
    visibility: "private",
    name: "",
    bio: "",
    age_range: "",
    gender_expression: "",
    ethnicity_style: "",
    face_description: "",
    hair_description: "",
    body_description: "",
    temperament: [],
    playable_roles: [],
    base_prompt: "",
    negative_prompt: "",
    metadata: {
      identity_passport: {
        identity_core_prompt: "",
        current_appearance_prompt: "",
        scene_override_prompt: "",
      },
    },
  };
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeTags(value: unknown): string[] {
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

function tagsToText(value: unknown, label: string) {
  const tags = normalizeTags(value);
  return tags.length ? `${label}: ${tags.join(", ")}.` : "";
}
