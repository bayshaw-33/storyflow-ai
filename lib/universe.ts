import type { DramaProject, StoryBible } from "@/lib/projects";
import { getPlanEntitlement } from "@/lib/billing/plans";

export type UniverseAccessLevel = "studio_annual" | "enterprise";
export type UniverseStatus = "active" | "archived";
export type UniverseEntityType = "character" | "location" | "organization" | "object" | "rule" | "concept";
export type CanonStatus = "canon" | "draft" | "alternative" | "deprecated";
export type UniverseInboxStatus = "pending" | "accepted" | "rejected" | "edited";
export type UniverseInboxType =
  | "character"
  | "location"
  | "relationship"
  | "event"
  | "canon_fact"
  | "state_change"
  | "rule";
export type UniverseProjectRole = "main_season" | "spin_off" | "prequel" | "adaptation" | "localization" | "other";

export type Universe = {
  id: string;
  user_id?: string | null;
  name: string;
  description: string;
  genre: string;
  default_language: string;
  target_markets: string[];
  tone: string;
  status: UniverseStatus;
  access_level: UniverseAccessLevel;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type UniverseEntity = {
  id: string;
  universe_id: string;
  user_id?: string | null;
  type: UniverseEntityType;
  name: string;
  summary: string;
  details_json: Record<string, unknown>;
  status: CanonStatus;
  tags: string[];
  source_project_id?: string | null;
  source_step_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type UniverseRelationship = {
  id: string;
  universe_id: string;
  user_id?: string | null;
  source_entity_id?: string | null;
  target_entity_id?: string | null;
  relationship_type: string;
  relationship_status: string;
  summary: string;
  history_json: Record<string, unknown>;
  status: CanonStatus;
  source_project_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type UniverseTimelineEvent = {
  id: string;
  universe_id: string;
  user_id?: string | null;
  title: string;
  description: string;
  date_label: string;
  season_number?: number | null;
  episode_number?: number | null;
  order_index?: number | null;
  related_entity_ids: string[];
  is_canon: boolean;
  status: CanonStatus;
  source_project_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type CanonFact = {
  id: string;
  universe_id: string;
  user_id?: string | null;
  fact_text: string;
  category: "character" | "relationship" | "timeline" | "world_rule" | "location" | "secret" | "production_rule";
  importance: "low" | "medium" | "high" | "critical";
  status: CanonStatus;
  is_locked: boolean;
  source_project_id?: string | null;
  source_episode?: string | null;
  source_location_text?: string | null;
  confirmed_by_user: boolean;
  confirmed_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type CanonStateSnapshot = {
  id: string;
  universe_id: string;
  user_id?: string | null;
  project_id?: string | null;
  season_number?: number | null;
  title: string;
  summary: string;
  state_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type UniverseInboxItem = {
  id: string;
  universe_id: string;
  user_id?: string | null;
  project_id?: string | null;
  item_type: UniverseInboxType;
  title: string;
  proposed_payload: Record<string, unknown>;
  source_excerpt: string;
  confidence: number;
  status: UniverseInboxStatus;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type UniverseProjectLink = {
  id: string;
  universe_id: string;
  project_id: string;
  user_id?: string | null;
  project_role: UniverseProjectRole;
  season_number?: number | null;
  inheritance_settings: UniverseInheritanceSettings;
  created_at: string;
  updated_at: string;
};

export type UniverseInheritanceSettings = {
  core_world?: boolean;
  main_characters?: boolean;
  character_states?: boolean;
  relationships?: boolean;
  locations?: boolean;
  timeline?: boolean;
  locked_facts?: boolean;
  style_guide?: boolean;
  previous_state?: boolean;
};

export type CanonCheckIssue = {
  severity: "critical" | "warning" | "note";
  title: string;
  description: string;
  related_canon_fact_id?: string | null;
  source_excerpt?: string;
  suggested_fix?: string;
};

export type CanonCheckReport = {
  id: string;
  universe_id: string;
  project_id?: string | null;
  user_id?: string | null;
  target_scope: string;
  score: number;
  issues_json: CanonCheckIssue[];
  suggestions_json: Array<Record<string, unknown>>;
  created_at: string;
};

export type UniverseBundle = {
  universe: Universe;
  entities: UniverseEntity[];
  relationships: UniverseRelationship[];
  timeline: UniverseTimelineEvent[];
  canonFacts: CanonFact[];
  snapshots: CanonStateSnapshot[];
  inbox: UniverseInboxItem[];
  links: UniverseProjectLink[];
  reports: CanonCheckReport[];
};

export type UniverseEntitlement = {
  canUse: boolean;
  readOnly: boolean;
  plan: string;
  reason: string;
};

export const UNIVERSE_STORAGE_KEY = "storyflow-ai-universes-v1";
export const UNIVERSE_ENTITY_STORAGE_KEY = "storyflow-ai-universe-entities-v1";
export const UNIVERSE_RELATION_STORAGE_KEY = "storyflow-ai-universe-relationships-v1";
export const UNIVERSE_TIMELINE_STORAGE_KEY = "storyflow-ai-universe-timeline-v1";
export const CANON_FACT_STORAGE_KEY = "storyflow-ai-canon-facts-v1";
export const CANON_STATE_STORAGE_KEY = "storyflow-ai-canon-state-v1";
export const UNIVERSE_INBOX_STORAGE_KEY = "storyflow-ai-universe-inbox-v1";
export const UNIVERSE_LINK_STORAGE_KEY = "storyflow-ai-universe-links-v1";
export const CANON_REPORT_STORAGE_KEY = "storyflow-ai-canon-checks-v1";

export const DEFAULT_INHERITANCE_SETTINGS: UniverseInheritanceSettings = {
  core_world: true,
  main_characters: true,
  character_states: true,
  relationships: true,
  locations: true,
  timeline: true,
  locked_facts: true,
  style_guide: true,
  previous_state: true,
};

const TABLES = {
  universes: "storyflow_universes",
  entities: "storyflow_universe_entities",
  relationships: "storyflow_universe_relationships",
  timeline: "storyflow_universe_timeline_events",
  canonFacts: "storyflow_canon_facts",
  snapshots: "storyflow_canon_state_snapshots",
  inbox: "storyflow_universe_inbox_items",
  links: "storyflow_universe_project_links",
  reports: "storyflow_canon_check_reports",
};

type SupabaseOptions = {
  accessToken?: string | null;
};

export function canUseUniverseEngine(input?: { email?: string | null; plan?: string | null } | null): UniverseEntitlement {
  const plan = (input?.plan || "").toLowerCase();
  const email = (input?.email || "").toLowerCase();
  const enabledInDev = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_UNIVERSE_DEV_UNLOCK !== "false";
  const forceEnabled = process.env.NEXT_PUBLIC_UNIVERSE_ENGINE_ENABLED === "true";
  const allowlist = (process.env.NEXT_PUBLIC_UNIVERSE_ALLOWLIST_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  const canUse =
    enabledInDev ||
    forceEnabled ||
    allowlist.includes(email) ||
    getPlanEntitlement(plan).features.universe;

  return {
    canUse,
    readOnly: !canUse,
    plan: plan || "free",
    reason: canUse ? "Universe enabled" : "Universe plan required",
  };
}

export async function readCurrentProfile(options: SupabaseOptions = {}) {
  if (!options.accessToken || !isSupabaseConfigured()) return null;
  const userId = getUserIdFromAccessToken(options.accessToken);
  if (!userId) return null;
  const rows = await supabaseFetch<Array<{ plan?: string | null; email?: string | null }>>(
    `${tableUrl("storyflow_profiles")}?user_id=eq.${encodeURIComponent(userId)}&select=plan,email&limit=1`,
    {},
    options,
  ).catch(() => []);
  return rows[0] || null;
}

export async function readUniverseEntitlement(options: SupabaseOptions = {}) {
  const profile = await readCurrentProfile(options);
  return canUseUniverseEngine(profile);
}

export async function listUniverses(options: SupabaseOptions = {}): Promise<Universe[]> {
  if (isSupabaseConfigured() && options.accessToken) {
    const rows = await supabaseFetch<Universe[]>(
      `${tableUrl(TABLES.universes)}?select=*&order=updated_at.desc`,
      {},
      options,
    ).catch(() => null);
    if (rows) {
      saveLocalList(UNIVERSE_STORAGE_KEY, rows);
      return rows;
    }
  }

  return readLocalList<Universe>(UNIVERSE_STORAGE_KEY);
}

export async function getUniverseBundle(universeId: string, options: SupabaseOptions = {}): Promise<UniverseBundle | null> {
  const universes = await listUniverses(options);
  const universe = universes.find((item) => item.id === universeId);
  if (!universe) return null;

  const [entities, relationships, timeline, canonFacts, snapshots, inbox, links, reports] = await Promise.all([
    listByUniverse<UniverseEntity>(TABLES.entities, UNIVERSE_ENTITY_STORAGE_KEY, universeId, options),
    listByUniverse<UniverseRelationship>(TABLES.relationships, UNIVERSE_RELATION_STORAGE_KEY, universeId, options),
    listByUniverse<UniverseTimelineEvent>(TABLES.timeline, UNIVERSE_TIMELINE_STORAGE_KEY, universeId, options),
    listByUniverse<CanonFact>(TABLES.canonFacts, CANON_FACT_STORAGE_KEY, universeId, options),
    listByUniverse<CanonStateSnapshot>(TABLES.snapshots, CANON_STATE_STORAGE_KEY, universeId, options),
    listByUniverse<UniverseInboxItem>(TABLES.inbox, UNIVERSE_INBOX_STORAGE_KEY, universeId, options),
    listByUniverse<UniverseProjectLink>(TABLES.links, UNIVERSE_LINK_STORAGE_KEY, universeId, options),
    listByUniverse<CanonCheckReport>(TABLES.reports, CANON_REPORT_STORAGE_KEY, universeId, options),
  ]);

  return { universe, entities, relationships, timeline, canonFacts, snapshots, inbox, links: dedupeUniverseProjectLinks(links), reports };
}

export async function createUniverseFromProject(params: {
  project: DramaProject;
  form: Pick<Universe, "name" | "description" | "genre" | "default_language" | "target_markets" | "tone">;
  accessToken?: string | null;
}) {
  const now = new Date().toISOString();
  const userId = getUserIdFromAccessToken(params.accessToken);
  const universe: Universe = {
    id: createId(),
    user_id: userId || null,
    name: params.form.name.trim() || `${params.project.title} Universe`,
    description: params.form.description.trim(),
    genre: params.form.genre || params.project.genre,
    default_language: params.form.default_language || params.project.targetLanguage,
    target_markets: params.form.target_markets.length ? params.form.target_markets : [params.project.market].filter(Boolean),
    tone: params.form.tone || "",
    status: "active",
    access_level: "studio_annual",
    metadata: { source: "project_upgrade" },
    created_at: now,
    updated_at: now,
  };

  const link = buildProjectLink({
    universeId: universe.id,
    projectId: params.project.id,
    userId,
    projectRole: "main_season",
    seasonNumber: params.project.seasonNumber || 1,
    inheritanceSettings: params.project.inheritanceSettings || DEFAULT_INHERITANCE_SETTINGS,
  });

  await upsertUniverse(universe, { accessToken: params.accessToken });
  await upsertUniverseProjectLink(link, { accessToken: params.accessToken });
  return { universe, link };
}

export async function upsertUniverse(universe: Universe, options: SupabaseOptions = {}) {
  upsertLocalItem(UNIVERSE_STORAGE_KEY, universe);
  if (!isSupabaseConfigured() || !options.accessToken) return;
  await supabaseUpsert(TABLES.universes, universe, "id", options).catch(() => null);
}

export async function upsertUniverseProjectLink(link: UniverseProjectLink, options: SupabaseOptions = {}) {
  upsertLocalItem(UNIVERSE_LINK_STORAGE_KEY, link);
  if (!isSupabaseConfigured() || !options.accessToken) return;
  await supabaseUpsert(TABLES.links, link, "id", options).catch(() => null);
}

export async function saveInboxItems(items: UniverseInboxItem[], options: SupabaseOptions = {}) {
  for (const item of items) upsertLocalItem(UNIVERSE_INBOX_STORAGE_KEY, item);
  if (!isSupabaseConfigured() || !options.accessToken || !items.length) return;
  await supabaseFetch(`${tableUrl(TABLES.inbox)}?on_conflict=id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(items),
  }, options).catch(() => null);
}

export async function saveCanonCheckReport(report: CanonCheckReport, options: SupabaseOptions = {}) {
  upsertLocalItem(CANON_REPORT_STORAGE_KEY, report);
  if (!isSupabaseConfigured() || !options.accessToken) return;
  await supabaseUpsert(TABLES.reports, report, "id", options).catch(() => null);
}

export async function getProjectUniverseLink(projectId: string, options: SupabaseOptions = {}) {
  if (isSupabaseConfigured() && options.accessToken) {
    const rows = await supabaseFetch<UniverseProjectLink[]>(
      `${tableUrl(TABLES.links)}?project_id=eq.${encodeURIComponent(projectId)}&select=*&limit=1`,
      {},
      options,
    ).catch(() => null);
    if (rows?.[0]) return rows[0];
  }

  return readLocalList<UniverseProjectLink>(UNIVERSE_LINK_STORAGE_KEY).find((link) => link.project_id === projectId) || null;
}

export async function acceptInboxItem(item: UniverseInboxItem, editedPayload?: Record<string, unknown>, options: SupabaseOptions = {}) {
  const payload = editedPayload || item.proposed_payload || {};
  const now = new Date().toISOString();
  const userId = item.user_id || getUserIdFromAccessToken(options.accessToken) || null;

  if (item.item_type === "character" || item.item_type === "location" || item.item_type === "rule") {
    const entityName = stringValue(payload.name) || item.title;
    const existingCharacter = item.item_type === "character"
      ? await findExistingCharacterEntity(item.universe_id, entityName, options)
      : null;
    const nextDetails = item.item_type === "character"
      ? mergeCharacterVariant(existingCharacter?.details_json || {}, payload, item, now)
      : payload;
    const entity: UniverseEntity = {
      id: existingCharacter?.id || createId(),
      universe_id: item.universe_id,
      user_id: userId,
      type: item.item_type === "rule" ? "rule" : item.item_type,
      name: entityName,
      summary: stringValue(payload.summary) || stringValue(payload.description) || existingCharacter?.summary || item.source_excerpt,
      details_json: nextDetails,
      status: existingCharacter?.status || "canon",
      tags: Array.from(new Set([...(existingCharacter?.tags || []), ...arrayValue(payload.tags)])),
      source_project_id: existingCharacter?.source_project_id || item.project_id || null,
      source_step_id: stringValue(payload.source_step_id) || existingCharacter?.source_step_id || null,
      created_at: existingCharacter?.created_at || now,
      updated_at: now,
    };
    upsertLocalItem(UNIVERSE_ENTITY_STORAGE_KEY, entity);
    await supabaseUpsert(TABLES.entities, entity, "id", options).catch(() => null);
  } else if (item.item_type === "relationship") {
    const relationship: UniverseRelationship = {
      id: createId(),
      universe_id: item.universe_id,
      user_id: userId,
      source_entity_id: stringValue(payload.source_entity_id) || null,
      target_entity_id: stringValue(payload.target_entity_id) || null,
      relationship_type: stringValue(payload.relationship_type) || stringValue(payload.type) || "related",
      relationship_status: stringValue(payload.relationship_status) || "active",
      summary: stringValue(payload.summary) || item.title,
      history_json: payload,
      status: "canon",
      source_project_id: item.project_id || null,
      created_at: now,
      updated_at: now,
    };
    upsertLocalItem(UNIVERSE_RELATION_STORAGE_KEY, relationship);
    await supabaseUpsert(TABLES.relationships, relationship, "id", options).catch(() => null);
  } else if (item.item_type === "event") {
    const event: UniverseTimelineEvent = {
      id: createId(),
      universe_id: item.universe_id,
      user_id: userId,
      title: stringValue(payload.title) || item.title,
      description: stringValue(payload.description) || item.source_excerpt,
      date_label: stringValue(payload.date_label) || stringValue(payload.episode) || "",
      season_number: numberValue(payload.season_number),
      episode_number: numberValue(payload.episode_number),
      order_index: numberValue(payload.order_index),
      related_entity_ids: arrayValue(payload.related_entity_ids),
      is_canon: true,
      status: "canon",
      source_project_id: item.project_id || null,
      created_at: now,
      updated_at: now,
    };
    upsertLocalItem(UNIVERSE_TIMELINE_STORAGE_KEY, event);
    await supabaseUpsert(TABLES.timeline, event, "id", options).catch(() => null);
  } else if (item.item_type === "canon_fact") {
    const fact: CanonFact = {
      id: createId(),
      universe_id: item.universe_id,
      user_id: userId,
      fact_text: stringValue(payload.fact_text) || stringValue(payload.text) || item.title,
      category: normalizeCanonCategory(stringValue(payload.category)),
      importance: normalizeImportance(stringValue(payload.importance)),
      status: "canon",
      is_locked: Boolean(payload.is_locked ?? true),
      source_project_id: item.project_id || null,
      source_episode: stringValue(payload.source_episode) || null,
      source_location_text: item.source_excerpt,
      confirmed_by_user: true,
      confirmed_at: now,
      created_at: now,
      updated_at: now,
    };
    upsertLocalItem(CANON_FACT_STORAGE_KEY, fact);
    await supabaseUpsert(TABLES.canonFacts, fact, "id", options).catch(() => null);
  } else if (item.item_type === "state_change") {
    const snapshot: CanonStateSnapshot = {
      id: createId(),
      universe_id: item.universe_id,
      user_id: userId,
      project_id: item.project_id || null,
      season_number: numberValue(payload.season_number),
      title: stringValue(payload.title) || item.title,
      summary: stringValue(payload.summary) || item.source_excerpt,
      state_json: payload,
      created_at: now,
      updated_at: now,
    };
    upsertLocalItem(CANON_STATE_STORAGE_KEY, snapshot);
    await supabaseUpsert(TABLES.snapshots, snapshot, "id", options).catch(() => null);
  }

  const reviewed: UniverseInboxItem = {
    ...item,
    proposed_payload: payload,
    status: editedPayload ? "edited" : "accepted",
    reviewed_at: now,
    updated_at: now,
  };
  upsertLocalItem(UNIVERSE_INBOX_STORAGE_KEY, reviewed);
  await supabasePatch(TABLES.inbox, item.id, reviewed, options).catch(() => null);
  return reviewed;
}

export async function rejectInboxItem(item: UniverseInboxItem, options: SupabaseOptions = {}) {
  const reviewed: UniverseInboxItem = {
    ...item,
    status: "rejected",
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  upsertLocalItem(UNIVERSE_INBOX_STORAGE_KEY, reviewed);
  await supabasePatch(TABLES.inbox, item.id, reviewed, options).catch(() => null);
  return reviewed;
}

export function buildProjectLink(params: {
  universeId: string;
  projectId: string;
  userId?: string | null;
  projectRole: UniverseProjectRole;
  seasonNumber?: number | null;
  inheritanceSettings?: UniverseInheritanceSettings;
}): UniverseProjectLink {
  const now = new Date().toISOString();
  return {
    id: `universe-project-link-${stableIdSegment(params.universeId)}-${stableIdSegment(params.projectId)}`,
    universe_id: params.universeId,
    project_id: params.projectId,
    user_id: params.userId || null,
    project_role: params.projectRole,
    season_number: params.seasonNumber || null,
    inheritance_settings: params.inheritanceSettings || DEFAULT_INHERITANCE_SETTINGS,
    created_at: now,
    updated_at: now,
  };
}

function dedupeUniverseProjectLinks(links: UniverseProjectLink[]) {
  const byProject = new Map<string, UniverseProjectLink>();
  for (const link of links) {
    const existing = byProject.get(link.project_id);
    if (!existing || link.updated_at.localeCompare(existing.updated_at) > 0) {
      byProject.set(link.project_id, link);
    }
  }
  return Array.from(byProject.values()).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

function stableIdSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

async function findExistingCharacterEntity(universeId: string, name: string, options: SupabaseOptions = {}) {
  const normalizedName = name.trim().toLowerCase();
  if (!normalizedName) return null;

  const localMatch = readLocalList<UniverseEntity>(UNIVERSE_ENTITY_STORAGE_KEY).find(
    (entity) =>
      entity.universe_id === universeId &&
      entity.type === "character" &&
      entity.name.trim().toLowerCase() === normalizedName,
  );
  if (localMatch) return localMatch;

  if (isSupabaseConfigured() && options.accessToken) {
    const rows = await supabaseFetch<UniverseEntity[]>(
      `${tableUrl(TABLES.entities)}?universe_id=eq.${encodeURIComponent(universeId)}&type=eq.character&name=eq.${encodeURIComponent(name)}&select=*&limit=1`,
      {},
      options,
    ).catch(() => null);
    if (rows?.[0]) return rows[0];
  }

  return null;
}

function mergeCharacterVariant(
  existingDetails: Record<string, unknown>,
  payload: Record<string, unknown>,
  item: UniverseInboxItem,
  now: string,
) {
  const variant = buildCharacterAppearanceVariant(payload, item, now);
  const variants = arrayRecordValue(existingDetails.appearance_variants);
  const nextVariants = variant
    ? upsertVariant(variants, variant)
    : variants;

  return {
    ...existingDetails,
    ...payload,
    appearance_variants: nextVariants,
  };
}

function buildCharacterAppearanceVariant(payload: Record<string, unknown>, item: UniverseInboxItem, now: string) {
  const projectVariant = recordValue(payload.project_variant);
  const appearance = stringValue(payload.appearance) || stringValue(payload.visual_notes) || stringValue(projectVariant.appearance);
  const visualAssets = arrayRecordValue(payload.visual_assets).length
    ? arrayRecordValue(payload.visual_assets)
    : arrayRecordValue(projectVariant.visual_assets);
  const prompt = stringValue(projectVariant.prompt) || stringValue(payload.prompt) || stringValue(payload.style_prompt);
  const sourceWorkflow = stringValue(payload.source_workflow) || stringValue(projectVariant.source_workflow);
  const sourcePackageId = stringValue(payload.source_package_id) || stringValue(projectVariant.source_package_id);

  if (!appearance && !visualAssets.length && !prompt && !sourceWorkflow && !sourcePackageId && !item.project_id) return null;

  return {
    id: stringValue(projectVariant.id) || `variant-${item.id}`,
    source_project_id: item.project_id || stringValue(projectVariant.source_project_id) || null,
    source_workflow: sourceWorkflow || "project",
    source_package_id: sourcePackageId || null,
    title: stringValue(projectVariant.title) || `${item.title} project variant`,
    appearance,
    prompt,
    visual_assets: visualAssets,
    created_at: stringValue(projectVariant.created_at) || now,
    updated_at: now,
  };
}

function upsertVariant(variants: Array<Record<string, unknown>>, variant: Record<string, unknown>) {
  const variantId = stringValue(variant.id);
  const sourceProjectId = stringValue(variant.source_project_id);
  const sourceWorkflow = stringValue(variant.source_workflow);
  const index = variants.findIndex((item) => {
    if (variantId && stringValue(item.id) === variantId) return true;
    return Boolean(sourceProjectId && sourceWorkflow && stringValue(item.source_project_id) === sourceProjectId && stringValue(item.source_workflow) === sourceWorkflow);
  });

  if (index === -1) return [variant, ...variants];
  return variants.map((item, itemIndex) => (itemIndex === index ? { ...item, ...variant } : item));
}

export function buildInheritedStoryBible(bundle: UniverseBundle, settings: UniverseInheritanceSettings): StoryBible {
  const characters = settings.main_characters
    ? bundle.entities.filter((entity) => entity.type === "character").slice(0, 12)
    : [];
  const locations = settings.locations
    ? bundle.entities.filter((entity) => entity.type === "location").slice(0, 8)
    : [];
  const lockedFacts = settings.locked_facts
    ? bundle.canonFacts.filter((fact) => fact.is_locked || fact.importance === "critical").slice(0, 20)
    : [];
  const latestState = settings.previous_state ? bundle.snapshots[0] : null;

  return {
    logline: bundle.universe.description || "",
    sellingPoint: "Create once, expand forever. This project inherits the IP universe foundation.",
    targetMarket: bundle.universe.target_markets.join(", "),
    genreType: bundle.universe.genre,
    world: [
      settings.core_world ? bundle.universe.description : "",
      locations.map((item) => `- ${item.name}: ${item.summary}`).join("\n"),
    ].filter(Boolean).join("\n\n"),
    mainConflict: latestState?.summary || "",
    characterRelationships: [
      characters.map((item) => `- ${item.name}: ${item.summary}`).join("\n"),
      settings.relationships ? bundle.relationships.slice(0, 12).map((item) => `- ${item.summary}`).join("\n") : "",
    ].filter(Boolean).join("\n\n"),
    lockedCanon: lockedFacts.map((fact) => `- ${fact.fact_text}`).join("\n"),
    languageStyle: bundle.universe.tone || "",
    pacingRules: "Keep inherited canon visible. New conflicts may extend canon but cannot overwrite locked facts without review.",
    confirmedFacts: bundle.canonFacts.slice(0, 30).map((fact) => `- ${fact.fact_text}`).join("\n"),
  };
}

export function exportUniverseMarkdown(bundle: UniverseBundle) {
  const { universe } = bundle;
  return [
    `# ${universe.name}`,
    "",
    "## Universe Overview",
    universe.description || "No description yet.",
    "",
    `- Genre: ${universe.genre || "N/A"}`,
    `- Default language: ${universe.default_language || "N/A"}`,
    `- Target markets: ${universe.target_markets.join(", ") || "N/A"}`,
    `- Tone: ${universe.tone || "N/A"}`,
    "",
    "## Characters",
    markdownList(bundle.entities.filter((item) => item.type === "character"), (item) => `${item.name}: ${item.summary}`),
    "",
    "## Relationships",
    markdownList(bundle.relationships, (item) => item.summary || item.relationship_type),
    "",
    "## Timeline",
    markdownList(bundle.timeline, (item) => `${item.date_label ? `${item.date_label} - ` : ""}${item.title}: ${item.description}`),
    "",
    "## Canon Facts",
    markdownList(bundle.canonFacts, (item) => `${item.importance.toUpperCase()}: ${item.fact_text}`),
    "",
    "## Current Canon State",
    markdownList(bundle.snapshots, (item) => `${item.title}: ${item.summary}`),
    "",
    "## Linked Projects",
    markdownList(bundle.links, (item) => `${item.project_id} (${item.project_role}${item.season_number ? ` S${item.season_number}` : ""})`),
    "",
  ].join("\n");
}

export function createUniverseJsonExport(bundle: UniverseBundle) {
  return JSON.stringify(bundle, null, 2);
}

async function listByUniverse<T extends { id: string; universe_id: string }>(
  table: string,
  storageKey: string,
  universeId: string,
  options: SupabaseOptions,
): Promise<T[]> {
  if (isSupabaseConfigured() && options.accessToken) {
    const rows = await supabaseFetch<T[]>(
      `${tableUrl(table)}?universe_id=eq.${encodeURIComponent(universeId)}&select=*&order=created_at.desc`,
      {},
      options,
    ).catch(() => null);
    if (rows) {
      mergeLocalList(storageKey, rows);
      return rows;
    }
  }

  return readLocalList<T>(storageKey).filter((item) => item.universe_id === universeId);
}

function markdownList<T>(items: T[], render: (item: T) => string) {
  if (!items.length) return "_None yet._";
  return items.map((item) => `- ${render(item)}`).join("\n");
}

function readLocalList<T>(key: string): T[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]") as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalList<T>(key: string, items: T[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, JSON.stringify(items));
}

function mergeLocalList<T extends { id: string }>(key: string, items: T[]) {
  const merged = new Map(readLocalList<T>(key).map((item) => [item.id, item]));
  for (const item of items) merged.set(item.id, item);
  saveLocalList(key, Array.from(merged.values()));
}

function upsertLocalItem<T extends { id: string }>(key: string, item: T) {
  const items = readLocalList<T>(key);
  const exists = items.some((current) => current.id === item.id);
  saveLocalList(key, exists ? items.map((current) => (current.id === item.id ? item : current)) : [item, ...items]);
}

async function supabaseUpsert(table: string, row: unknown, conflictKey: string, options: SupabaseOptions) {
  if (!isSupabaseConfigured() || !options.accessToken) return;
  return supabaseFetch(`${tableUrl(table)}?on_conflict=${conflictKey}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(row),
  }, options);
}

async function supabasePatch(table: string, id: string, row: unknown, options: SupabaseOptions) {
  if (!isSupabaseConfigured() || !options.accessToken) return;
  return supabaseFetch(`${tableUrl(table)}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(row),
  }, options);
}

async function supabaseFetch<T = unknown>(url: string, init: RequestInit = {}, options: SupabaseOptions = {}): Promise<T> {
  const authToken = options.accessToken || getSupabaseAnonKey();
  const response = await fetch(url, {
    ...init,
    headers: {
      apikey: getSupabaseAnonKey(),
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase request failed: ${response.status}${text ? ` ${text.slice(0, 180)}` : ""}`);
  }

  if (response.status === 204) return null as T;
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (null as T);
}

function isSupabaseConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

function tableUrl(table: string) {
  return `${getSupabaseUrl()}/rest/v1/${table}`;
}

function getSupabaseUrl() {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
}

function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
}

function getUserIdFromAccessToken(accessToken?: string | null) {
  if (!accessToken) return undefined;
  try {
    const [, payload] = accessToken.split(".");
    if (!payload) return undefined;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded =
      typeof atob === "function"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("utf8");
    const claims = JSON.parse(decoded) as { sub?: string };
    return claims.sub;
  } catch {
    return undefined;
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayRecordValue(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function normalizeCanonCategory(value: string): CanonFact["category"] {
  const valid: CanonFact["category"][] = ["character", "relationship", "timeline", "world_rule", "location", "secret", "production_rule"];
  return valid.includes(value as CanonFact["category"]) ? value as CanonFact["category"] : "character";
}

function normalizeImportance(value: string): CanonFact["importance"] {
  const valid: CanonFact["importance"][] = ["low", "medium", "high", "critical"];
  return valid.includes(value as CanonFact["importance"]) ? value as CanonFact["importance"] : "medium";
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
