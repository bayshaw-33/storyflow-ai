/**
 * Character Passport 类型定义（TRAE-V2-02）
 *
 * Passport 是组合视图 DTO，不新建重复总表。聚合以下 5 张表 + V2-03 Voice 预留：
 * - storyflow_universe_entities        → 角色身份（Universe 级）
 * - storyflow_actor_profiles           → 演员身份与默认 passport
 * - storyflow_character_portrayals     → 项目内角色形象
 * - storyflow_character_appearance_variants → 造型变化版本
 * - storyflow_identity_passports       → 三层 Prompt（按 actor/project/scene 维度）
 * - storyflow_character_voice_profiles → V2-03 预留（null）
 *
 * 设计文档：Kiikis-V2.0-TRAE-80%-执行PRD.md §TRAE-V2-02
 */
import type { CanonStatus } from "@/lib/universe";

// ============================================================
// Passport 子结构
// ============================================================

/** 角色身份（来自 storyflow_universe_entities type='character'） */
export type PassportIdentity = {
  entityId: string;
  universeId: string;
  name: string;
  summary: string;
  details: {
    age?: string;
    nationality?: string;
    role_function?: string;
    identity?: string;
    goal?: string;
    trauma?: string;
    secret?: string;
    forbidden_changes?: string;
    [key: string]: unknown;
  };
  canonStatus: CanonStatus;
  tags: string[];
  updatedAt: string;
};

/** 演员层（来自 storyflow_actor_profiles） */
export type PassportActor = {
  actorId: string;
  name: string;
  bio: string;
  ageRange: string;
  genderExpression: string;
  ethnicityStyle: string;
  faceDescription: string;
  hairDescription: string;
  bodyDescription: string;
  temperament: string[];
  playableRoles: string[];
  basePrompt: string;
  negativePrompt: string;
  avatarUrl: string | null;
  referenceSheetUrl: string | null;
  visibility: string;
  status: string;
  updatedAt: string;
};

/** 项目形象（来自 storyflow_character_portrayals） */
export type PassportPortrayal = {
  id: string;
  actorProfileId: string;
  actorName: string;
  characterId: string;
  projectId: string | null;
  portrayalName: string;
  visualPrompt: string;
  costumeDirection: string;
  referenceImageUrl: string | null;
  isReusable: boolean;
  updatedAt: string;
};

/** 造型变化版本（来自 storyflow_character_appearance_variants） */
export type PassportAppearanceVariant = {
  id: string;
  projectId: string;
  actorId: string;
  characterName: string;
  projectStyle: string;
  costumeDirection: string;
  promptPack: Record<string, string>;
  frontAssetUrl: string | null;
  threeViewAssetUrl: string | null;
  referenceSheetAssetUrl: string | null;
  status: string;
  updatedAt: string;
};

/** 三层 Prompt 来源标签 */
export type PassportPromptSource =
  | "scene_override"
  | "project_override"
  | "actor_default"
  | "empty";

/** 三层 Prompt（来自 storyflow_identity_passports 或 actor.metadata.identity_passport） */
export type PassportPrompt = {
  identityCorePrompt: string;
  currentAppearancePrompt: string;
  sceneOverridePrompt: string;
  coreIdentityLocked: boolean;
  appearanceLockedByDefault: boolean;
  projectOverrideAllowed: boolean;
  /** 实际命中的来源（scene > project > actor_default > empty） */
  source: PassportPromptSource;
  /** 命中的 passport 行 ID（独立表），null 表示来自 actor.metadata 嵌套 */
  passportRowId: string | null;
};

/** Voice Profile 占位（V2-03 实施） */
export type PassportVoiceProfilePlaceholder = null;

// ============================================================
// Passport DTO（聚合根）
// ============================================================

export type CharacterPassportDTO = {
  identity: PassportIdentity;
  actors: PassportActor[];
  portrayals: PassportPortrayal[];
  appearanceVariants: PassportAppearanceVariant[];
  prompt: PassportPrompt;
  /** V2-03 预留，始终为 null */
  voiceProfile: PassportVoiceProfilePlaceholder;
};

// ============================================================
// 写入输入
// ============================================================

/** 更新角色身份（写入 universe_entities.details_json + name/summary） */
export type PassportIdentityInput = {
  name?: string;
  summary?: string;
  details?: {
    age?: string;
    nationality?: string;
    role_function?: string;
    identity?: string;
    goal?: string;
    trauma?: string;
    secret?: string;
    forbidden_changes?: string;
    [key: string]: unknown;
  };
  tags?: string[];
  canonStatus?: CanonStatus;
};

/** 更新三层 Prompt */
export type PassportPromptInput = {
  identityCorePrompt?: string;
  currentAppearancePrompt?: string;
  sceneOverridePrompt?: string;
  /** 锁定开关（仅所有者可改） */
  coreIdentityLocked?: boolean;
  appearanceLockedByDefault?: boolean;
  projectOverrideAllowed?: boolean;
  /**
   * 写入维度：
   * - "actor_default"  → 写入 actor_profiles.metadata.identity_passport（默认）
   * - "project_override" → 写入 storyflow_identity_passports（actor_id + project_id）
   * - "scene_override" → 写入 storyflow_identity_passports（actor_id + project_id + scene_id）
   */
  scope?: "actor_default" | "project_override" | "scene_override";
  /** scope 非 actor_default 时必填 */
  actorProfileId?: string;
  projectId?: string;
  sceneId?: string;
};

// ============================================================
// 查询参数
// ============================================================

export type FetchPassportParams = {
  universeId: string;
  entityId: string;
  /** 限定到某个项目维度（影响 passport 读取顺序） */
  projectId?: string;
  /** 限定到某个场景维度 */
  sceneId?: string;
};
