import {
  CommunityServiceError,
  type CommunityFetcher,
} from "./publications.ts";
import type {
  UniverseCommunityActor,
  UniverseCommunityAsset,
  UniverseCommunityCandidate,
  UniverseCommunityData,
  UniverseCommunityEntity,
  UniverseCommunityLocalOverlay,
  UniverseCommunityTimelineEvent,
  UniverseCommunityVersion,
  UniverseCommunityVoice,
  UniverseCommunityWork,
} from "../../../contracts/v2/community-universe.ts";

type UniverseRow = {
  id: string;
  user_id: string | null;
  team_id: string | null;
  name: string;
  description: string | null;
  card_summary: string | null;
  genre: string | null;
  default_language: string | null;
  target_markets: unknown;
  tone: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  updated_at: string;
};

type PublicationRef = {
  id: string;
  source_id: string;
  source_version: string | null;
};

type LinkRow = {
  id: string;
  project_id: string;
  project_role: string | null;
  updated_at: string;
};

type ProjectRow = {
  id: string;
  title: string | null;
  workflow_type: string | null;
  status: string | null;
  updated_at: string;
};

type PrimaryWorkRow = {
  id: string;
  project_id: string;
  work_type: string;
  status: string;
  updated_at: string;
};

type EntityRow = {
  id: string;
  type: string;
  name: string;
  summary: string | null;
  status: string;
  updated_at: string;
};

type VersionRow = {
  id: string;
  version_no: number;
  content_hash: string;
  created_at: string;
};

type VoiceRow = {
  id: string;
  universe_entity_id: string | null;
  actor_profile_id: string | null;
  voice_label: string | null;
  voice_provider: string | null;
  language: string | null;
  status: string;
  updated_at: string;
};

type ActorRow = {
  id: string;
  name: string;
  status: string;
  updated_at: string;
};

type AssetRow = {
  id: string;
  universe_entity_id: string | null;
  kind: string;
  name: string;
  description: string | null;
  status: string;
  updated_at: string;
};

type TimelineRow = {
  id: string;
  title: string;
  description: string | null;
  date_label: string | null;
  status: string;
  is_canon: boolean | null;
  updated_at: string;
};

type OverlayRow = {
  id: string;
  work_id: string;
  entity_type: string;
  entity_id: string;
  revision: number;
  status: string;
  updated_at: string;
};

type CandidateRow = {
  id: string;
  item_type: string;
  title: string;
  confidence: number | null;
  status: string;
  updated_at: string;
};

interface QueryState {
  degradedSources: string[];
}

export async function readCommunityUniverse(
  fetcher: CommunityFetcher,
  options: { universeId: string; viewerId?: string | null },
): Promise<UniverseCommunityData> {
  if (!options.universeId) {
    throw new CommunityServiceError("validation_failed", "universeId is required", 400);
  }

  const state: QueryState = { degradedSources: [] };
  const universe = await requiredQuery<UniverseRow[]>(
    fetcher,
    `/rest/v1/storyflow_universes?id=eq.${encodeURIComponent(options.universeId)}&select=id,user_id,team_id,name,description,card_summary,genre,default_language,target_markets,tone,status,metadata,updated_at&limit=1`,
    "failed to fetch Universe",
  ).then((rows) => rows[0] ?? null);
  if (!universe) {
    throw new CommunityServiceError("not_found", "Universe not found", 404);
  }

  const viewerId = options.viewerId ?? null;
  const isOwner = await isUniverseOwner(fetcher, universe, viewerId, state);
  const universePublication = await requiredQuery<PublicationRef[]>(
    fetcher,
    `/rest/v1/storyflow_publications?source_type=eq.universe&source_id=eq.${encodeURIComponent(options.universeId)}&visibility=eq.public&status=eq.active&select=id,source_id,source_version&order=created_at.desc&limit=1`,
    "failed to fetch Universe publication",
  ).then((rows) => rows[0] ?? null);

  if (!isOwner && !universePublication) {
    throw new CommunityServiceError("forbidden", "Universe is not publicly available", 403);
  }

  const entityRows = await optionalQuery<EntityRow[]>(
    fetcher,
    `/rest/v1/storyflow_universe_entities?universe_id=eq.${encodeURIComponent(options.universeId)}&select=id,type,name,summary,status,updated_at&order=updated_at.desc&limit=500`,
    "entities",
    state,
  );
  const visibleEntities = entityRows.filter((row) => isVisibleStatus(row.status, isOwner));
  const entityIds = visibleEntities.map((row) => row.id);

  const [links, versions, timeline] = await Promise.all([
    optionalQuery<LinkRow[]>(
      fetcher,
      `/rest/v1/storyflow_universe_project_links?universe_id=eq.${encodeURIComponent(options.universeId)}&select=id,project_id,project_role,updated_at&order=updated_at.desc&limit=500`,
      "project_links",
      state,
    ),
    optionalQuery<VersionRow[]>(
      fetcher,
      `/rest/v1/storyflow_universe_versions?universe_id=eq.${encodeURIComponent(options.universeId)}&select=id,version_no,content_hash,created_at&order=version_no.desc&limit=100`,
      "versions",
      state,
    ),
    optionalQuery<TimelineRow[]>(
      fetcher,
      `/rest/v1/storyflow_universe_timeline_events?universe_id=eq.${encodeURIComponent(options.universeId)}&select=id,title,description,date_label,status,is_canon,updated_at&order=updated_at.desc&limit=200`,
      "timeline",
      state,
    ),
  ]);

  const projectIds = links.map((link) => link.project_id).filter(Boolean);
  const [projects, primaryWorks, projectPublications] = await Promise.all([
    projectIds.length
      ? optionalQuery<ProjectRow[]>(
          fetcher,
          `/rest/v1/storyflow_projects?id=in.${inFilter(projectIds)}&select=id,title,workflow_type,status,updated_at`,
          "projects",
          state,
        )
      : Promise.resolve([] as ProjectRow[]),
    projectIds.length
      ? optionalQuery<PrimaryWorkRow[]>(
          fetcher,
          `/rest/v1/storyflow_works?project_id=in.${inFilter(projectIds)}&is_primary=eq.true&select=id,project_id,work_type,status,updated_at&order=updated_at.desc&limit=500`,
          "primary_works",
          state,
        )
      : Promise.resolve([] as PrimaryWorkRow[]),
    publicRefs(fetcher, "project", projectIds, state),
  ]);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const primaryWorkByProject = new Map(primaryWorks.map((work) => [work.project_id, work]));
  const projectPublicationBySource = new Map(projectPublications.map((publication) => [publication.source_id, publication]));
  const works: UniverseCommunityWork[] = links
    .map((link) => {
      const project = projectById.get(link.project_id);
      const primaryWork = primaryWorkByProject.get(link.project_id);
      const publication = projectPublicationBySource.get(link.project_id);
      if (!isOwner && !publication) return null;
      return {
        id: publication?.id ?? link.project_id,
        projectId: link.project_id,
        primaryWorkId: primaryWork?.id ?? null,
        publicationId: publication?.id ?? null,
        title: publication?.source_id ? project?.title || publication.source_id : project?.title || link.project_id,
        workType: primaryWork?.work_type || project?.workflow_type || "other",
        projectRole: link.project_role || "main_season",
        status: primaryWork?.status || project?.status || "draft",
        updatedAt: primaryWork?.updated_at || project?.updated_at || link.updated_at,
        visibility: publication ? "public" : "owner",
      } satisfies UniverseCommunityWork;
    })
    .filter((item): item is UniverseCommunityWork => item !== null);

  const voiceRows = entityIds.length
    ? await optionalQuery<VoiceRow[]>(
        fetcher,
        `/rest/v1/storyflow_character_voice_profiles?universe_entity_id=in.${inFilter(entityIds)}&select=id,universe_entity_id,actor_profile_id,voice_label,voice_provider,language,status,updated_at&order=updated_at.desc&limit=500`,
        "voice_profiles",
        state,
      )
    : [];
  const actorIds = Array.from(new Set(voiceRows.map((row) => row.actor_profile_id).filter((id): id is string => Boolean(id))));
  const appearanceRows = entityIds.length
    ? await optionalQuery<Array<{ actor_id: string }>>(
        fetcher,
        `/rest/v1/storyflow_character_appearance_variants?universe_entity_id=in.${inFilter(entityIds)}&select=actor_id&status=eq.approved&limit=500`,
        "appearance_variants",
        state,
      )
    : [];
  const allActorIds = Array.from(new Set([...actorIds, ...appearanceRows.map((row) => row.actor_id).filter(Boolean)]));
  const [actors, actorPublications] = await Promise.all([
    allActorIds.length
      ? optionalQuery<ActorRow[]>(
          fetcher,
          `/rest/v1/storyflow_actor_profiles?id=in.${inFilter(allActorIds)}&select=id,name,status,updated_at&order=updated_at.desc&limit=500`,
          "actors",
          state,
        )
      : Promise.resolve([] as ActorRow[]),
    publicRefs(fetcher, "actor", allActorIds, state),
  ]);
  const actorPublicationBySource = new Map(actorPublications.map((publication) => [publication.source_id, publication]));
  const actorById = new Map(actors.map((actor) => [actor.id, actor]));
  const visibleActorIds = new Set(
    allActorIds.filter((id) => isOwner || actorPublicationBySource.has(id)),
  );
  const universeActors: UniverseCommunityActor[] = allActorIds
    .filter((id) => visibleActorIds.has(id))
    .map((id) => {
      const actor = actorById.get(id);
      const publication = actorPublicationBySource.get(id);
      const voice = voiceRows.find((row) => row.actor_profile_id === id);
      return {
        id,
        entityId: voice?.universe_entity_id ?? null,
        publicationId: publication?.id ?? null,
        name: actor?.name || id,
        status: actor?.status || "ready",
        updatedAt: actor?.updated_at || universe.updated_at,
        visibility: publication ? "public" : "owner",
      };
    });

  const voices: UniverseCommunityVoice[] = voiceRows
    .filter((row) => isOwner || row.status === "ready")
    .filter((row) => isOwner || !row.actor_profile_id || visibleActorIds.has(row.actor_profile_id))
    .map((row) => ({
      id: row.id,
      entityId: row.universe_entity_id,
      actorId: row.actor_profile_id,
      label: row.voice_label || "未命名声音",
      language: row.language || "unknown",
      provider: row.voice_provider || "unknown",
      status: row.status,
      updatedAt: row.updated_at,
      visibility: isOwner ? "owner" : "public",
    }));

  const assetRows = entityIds.length
    ? await optionalQuery<AssetRow[]>(
        fetcher,
        `/rest/v1/storyflow_art_assets?universe_entity_id=in.${inFilter(entityIds)}&status=not.eq.archived&select=id,universe_entity_id,kind,name,description,status,updated_at&order=updated_at.desc&limit=500`,
        "art_assets",
        state,
      )
    : [];
  const assetIds = assetRows.map((row) => row.id);
  const assetPublications = await publicRefs(fetcher, "asset", assetIds, state);
  const assetPublicationBySource = new Map(assetPublications.map((publication) => [publication.source_id, publication]));
  const assets: UniverseCommunityAsset[] = assetRows
    .filter((row) => isOwner || assetPublicationBySource.has(row.id))
    .map((row) => {
      const publication = assetPublicationBySource.get(row.id);
      return {
        id: row.id,
        entityId: row.universe_entity_id,
        publicationId: publication?.id ?? null,
        kind: row.kind,
        name: row.name,
        summary: row.description || "",
        status: row.status,
        updatedAt: row.updated_at,
        visibility: publication ? "public" : "owner",
      };
    });

  const primaryWorkIds = primaryWorks.map((work) => work.id);
  const projectIdByWork = new Map(primaryWorks.map((work) => [work.id, work.project_id]));
  const overlays = isOwner && primaryWorkIds.length
    ? await optionalQuery<OverlayRow[]>(
        fetcher,
        `/rest/v1/storyflow_work_local_states?work_id=in.${inFilter(primaryWorkIds)}&status=eq.active&select=id,work_id,entity_type,entity_id,revision,status,updated_at&order=updated_at.desc&limit=500`,
        "local_overlays",
        state,
      )
    : [];
  const candidates = isOwner
    ? await optionalQuery<CandidateRow[]>(
        fetcher,
        `/rest/v1/storyflow_universe_inbox_items?universe_id=eq.${encodeURIComponent(options.universeId)}&status=eq.pending&select=id,item_type,title,confidence,status,updated_at&order=updated_at.desc&limit=200`,
        "draft_candidates",
        state,
      )
    : [];

  const visibleVersions = isOwner ? versions : versions.slice(0, 1);
  const visibleTimeline = timeline.filter((row) => isOwner || row.status === "canon" || row.is_canon === true);

  return {
    access: isOwner ? "owner" : "public",
    isOwner,
    universe: {
      id: universe.id,
      name: universe.name,
      summary: cleanText(universe.card_summary || universe.description || ""),
      description: cleanText(universe.description || ""),
      genre: universe.genre || "",
      language: universe.default_language || "",
      targetMarkets: asStringArray(universe.target_markets),
      tone: universe.tone || "",
      tags: readTags(universe.metadata),
      status: universe.status,
      updatedAt: universe.updated_at,
      publicationId: universePublication?.id ?? null,
    },
    works,
    entities: visibleEntities.map(toEntity),
    actors: universeActors,
    voices,
    assets,
    timeline: visibleTimeline.map(toTimeline),
    versions: visibleVersions.map(toVersion),
    localOverlays: overlays.map((row) => ({
      id: row.id,
      workId: row.work_id,
      projectId: projectIdByWork.get(row.work_id) ?? null,
      entityType: row.entity_type,
      entityId: row.entity_id,
      revision: Number(row.revision) || 0,
      status: row.status,
      updatedAt: row.updated_at,
    })),
    candidates: candidates.map((row) => ({
      id: row.id,
      type: row.item_type,
      title: row.title,
      confidence: Number(row.confidence) || 0,
      status: row.status,
      updatedAt: row.updated_at,
    })),
    degraded: state.degradedSources.length > 0,
    degradedSources: Array.from(new Set(state.degradedSources)),
  };
}

async function isUniverseOwner(
  fetcher: CommunityFetcher,
  universe: UniverseRow,
  viewerId: string | null,
  state: QueryState,
): Promise<boolean> {
  if (!viewerId) return false;
  if (viewerId === universe.user_id) return true;
  if (!universe.team_id) return false;
  const memberships = await optionalQuery<Array<{ team_id: string }>>(
    fetcher,
    `/rest/v1/storyflow_team_members?team_id=eq.${encodeURIComponent(universe.team_id)}&user_id=eq.${encodeURIComponent(viewerId)}&status=eq.active&select=team_id&limit=1`,
    "team_memberships",
    state,
  );
  return memberships.length > 0;
}

async function publicRefs(
  fetcher: CommunityFetcher,
  sourceType: "project" | "actor" | "asset",
  sourceIds: string[],
  state: QueryState,
): Promise<PublicationRef[]> {
  if (!sourceIds.length) return [];
  return optionalQuery<PublicationRef[]>(
    fetcher,
    `/rest/v1/storyflow_publications?source_type=eq.${sourceType}&source_id=in.${inFilter(sourceIds)}&visibility=eq.public&status=eq.active&select=id,source_id,source_version&order=created_at.desc&limit=500`,
    `${sourceType}_publications`,
    state,
  );
}

async function requiredQuery<T>(fetcher: CommunityFetcher, path: string, message: string): Promise<T> {
  try {
    return await fetcher<T>(path);
  } catch (cause) {
    throw new CommunityServiceError("service_unavailable", message, 503, cause);
  }
}

async function optionalQuery<T>(
  fetcher: CommunityFetcher,
  path: string,
  source: string,
  state: QueryState,
): Promise<T> {
  try {
    return (await fetcher<T>(path)) || ([] as unknown as T);
  } catch {
    state.degradedSources.push(source);
    return [] as unknown as T;
  }
}

function inFilter(ids: string[]): string {
  return `(${ids.slice(0, 500).map((id) => encodeURIComponent(id)).join(",")})`;
}

function isVisibleStatus(status: string, isOwner: boolean): boolean {
  return isOwner ? status !== "deprecated" : status === "canon";
}

function toEntity(row: EntityRow): UniverseCommunityEntity {
  const kinds = ["character", "location", "organization", "object", "rule", "concept"] as const;
  return {
    id: row.id,
    kind: kinds.includes(row.type as (typeof kinds)[number]) ? row.type as (typeof kinds)[number] : "concept",
    name: row.name,
    summary: row.summary || "",
    status: isObjectStatus(row.status) ? row.status : "draft",
    updatedAt: row.updated_at,
    visibility: row.status === "canon" ? "public" : "owner",
  };
}

function toTimeline(row: TimelineRow): UniverseCommunityTimelineEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    dateLabel: row.date_label || "",
    status: isObjectStatus(row.status) ? row.status : "draft",
    updatedAt: row.updated_at,
    visibility: row.status === "canon" ? "public" : "owner",
  };
}

function toVersion(row: VersionRow): UniverseCommunityVersion {
  return {
    id: row.id,
    versionNo: Number(row.version_no) || 0,
    contentHash: row.content_hash,
    createdAt: row.created_at,
  };
}

function isObjectStatus(value: string): value is "canon" | "alternative" | "draft" | "deprecated" {
  return value === "canon" || value === "alternative" || value === "draft" || value === "deprecated";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean).slice(0, 20) : [];
}

function readTags(metadata: Record<string, unknown> | null): string[] {
  return asStringArray(metadata?.tags).slice(0, 10);
}

function cleanText(value: string): string {
  return value.replace(/^#{1,6}\s+/gm, "").replace(/\*\*(.+?)\*\*/g, "$1").trim();
}
