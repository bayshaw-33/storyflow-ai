/**
 * 宇宙分享权限（阶段 B）
 *
 * share_permissions 结构：
 * - sections: 勾选哪些类别可被访客查看（true=可见，false=隐藏）
 * - allow_edit: 是否允许访客编辑（本期只存储不实现）
 * - edit_permissions: 细化每个类别的编辑权限（本期只存储不实现）
 *
 * 设计文档：docs/superpowers/specs/2026-07-25-universe-share-design.md §2.2
 */

/** 可分享的内容类别（7 个） */
export const SECTION_KEYS = [
  "overview",
  "characters",
  "scenes",
  "rules",
  "actors",
  "chapters",
  "timeline",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

/** sections 勾选状态：true=访客可见，false=隐藏 */
export type ShareSections = Record<SectionKey, boolean>;

/** 完整权限配置 */
export type SharePermissions = {
  sections: ShareSections;
  allow_edit: boolean;
  edit_permissions: Partial<Record<SectionKey, boolean>>;
};

/** 默认权限：所有 sections 可见，不允许编辑 */
export const DEFAULT_SHARE_PERMISSIONS: SharePermissions = {
  sections: {
    overview: true,
    characters: true,
    scenes: true,
    rules: true,
    actors: true,
    chapters: true,
    timeline: true,
  },
  allow_edit: false,
  edit_permissions: {},
};

const SECTION_KEY_SET = new Set<string>(SECTION_KEYS);

/**
 * 校验并规范化输入的 share_permissions。
 *
 * 规则：
 * - sections 必须是对象（缺失则所有 section 默认 false）
 * - 每个 key 必须在白名单内，值为 boolean
 * - 缺失的 section 默认 false
 * - allow_edit 默认 false
 * - edit_permissions 默认空对象
 *
 * 任何结构错误都返回 DEFAULT_SHARE_PERMISSIONS，避免脏数据进入存储。
 */
export function validateSharePermissions(input: unknown): SharePermissions {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return cloneDefault();
  }

  const raw = input as Record<string, unknown>;

  const sections = normalizeSections(raw.sections);
  const allow_edit = typeof raw.allow_edit === "boolean" ? raw.allow_edit : false;
  const edit_permissions = normalizeEditPermissions(raw.edit_permissions);

  return { sections, allow_edit, edit_permissions };
}

/**
 * 根据权限过滤宇宙内容，返回可见与隐藏的 section 列表。
 * 用于访客视图决定渲染哪些 Tab。
 */
export function filterUniverseSections(
  _universe: unknown,
  permissions: SharePermissions,
): { visibleSections: SectionKey[]; hiddenSections: SectionKey[] } {
  const visibleSections: SectionKey[] = [];
  const hiddenSections: SectionKey[] = [];
  for (const key of SECTION_KEYS) {
    if (permissions.sections[key]) {
      visibleSections.push(key);
    } else {
      hiddenSections.push(key);
    }
  }
  return { visibleSections, hiddenSections };
}

function normalizeSections(input: unknown): ShareSections {
  const result: ShareSections = {
    overview: false,
    characters: false,
    scenes: false,
    rules: false,
    actors: false,
    chapters: false,
    timeline: false,
  };

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return result;
  }

  const raw = input as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (SECTION_KEY_SET.has(key) && typeof raw[key] === "boolean") {
      result[key as SectionKey] = raw[key] as boolean;
    }
  }
  return result;
}

function normalizeEditPermissions(input: unknown): Partial<Record<SectionKey, boolean>> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const raw = input as Record<string, unknown>;
  const result: Partial<Record<SectionKey, boolean>> = {};
  for (const key of Object.keys(raw)) {
    if (SECTION_KEY_SET.has(key) && typeof raw[key] === "boolean") {
      result[key as SectionKey] = raw[key] as boolean;
    }
  }
  return result;
}

function cloneDefault(): SharePermissions {
  return {
    sections: { ...DEFAULT_SHARE_PERMISSIONS.sections },
    allow_edit: DEFAULT_SHARE_PERMISSIONS.allow_edit,
    edit_permissions: {},
  };
}
