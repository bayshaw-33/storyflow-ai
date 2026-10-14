import type { ProjectLibrarySource } from "../../../client/v2/project-library/types.ts";
import type { ProjectLibraryFetcher } from "./index.ts";
import { projectLibraryTable } from "./lifecycle.ts";

export const TEST_CLEANUP_EMAIL = "bayshaw33@gmail.com";

const TEST_CLEANUP_SOURCES = new Set<ProjectLibrarySource>([
  "project",
  "production",
  "art",
  "viral",
]);

export type TestCleanupSelection = {
  source: ProjectLibrarySource;
  sourceId: string;
};

export type TestCleanupFailure = TestCleanupSelection & {
  error: string;
};

export type TestCleanupResult = {
  deleted: TestCleanupSelection[];
  failed: TestCleanupFailure[];
  deletedUniverseIds: string[];
  storageWarnings: string[];
};

export type TestCleanupStorageObject = {
  bucket: string;
  path: string;
};

export type TestCleanupStorageDeleter = (
  objects: TestCleanupStorageObject[],
) => Promise<void>;

type Row = Record<string, unknown>;

const PROJECT_SCOPED_TABLES = [
  { table: "storyflow_generation_jobs", owner: "owner_id" },
  { table: "storyflow_generations", owner: "user_id" },
  { table: "storyflow_versions", owner: "user_id" },
  { table: "storyflow_exports", owner: "user_id" },
  { table: "storyflow_assets", owner: "user_id" },
] as const;

const UNIVERSE_CONTENT_TABLES = [
  "storyflow_universe_project_links",
  "storyflow_projects",
  "storyflow_universe_entities",
  "storyflow_universe_inbox_items",
  "storyflow_universe_relationships",
  "storyflow_universe_timeline_events",
  "storyflow_canon_facts",
  "storyflow_canon_check_reports",
  "storyflow_canon_state_snapshots",
  "storyflow_character_appearance_variants",
  "storyflow_art_projects",
  "storyflow_art_publications",
  "storyflow_song_universe_links",
] as const;

export function isTestCleanupEmail(email: string) {
  return email.trim().toLowerCase() === TEST_CLEANUP_EMAIL;
}

export function normalizeTestCleanupSelections(value: unknown): TestCleanupSelection[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 200) {
    throw new Error("INVALID_TEST_CLEANUP_SELECTIONS");
  }

  const selections = new Map<string, TestCleanupSelection>();
  for (const item of value) {
    const row = item && typeof item === "object"
      ? item as Record<string, unknown>
      : {};
    const source = row.source as ProjectLibrarySource;
    const sourceId = typeof row.sourceId === "string" ? row.sourceId.trim() : "";
    if (!TEST_CLEANUP_SOURCES.has(source) || !sourceId || sourceId.length > 200) {
      throw new Error("INVALID_TEST_CLEANUP_SELECTIONS");
    }
    selections.set(`${source}:${sourceId}`, { source, sourceId });
  }

  return [...selections.values()];
}

export async function deleteTestAccountProjects(
  fetcher: ProjectLibraryFetcher,
  ownerId: string,
  selections: TestCleanupSelection[],
  deleteStorageObjects: TestCleanupStorageDeleter,
): Promise<TestCleanupResult> {
  if (!ownerId) throw new Error("TEST_CLEANUP_OWNER_REQUIRED");

  const deleted: TestCleanupSelection[] = [];
  const failed: TestCleanupFailure[] = [];
  const universeIds = new Set<string>();
  const storageWarnings = new Set<string>();

  for (const selection of selections) {
    try {
      if (selection.source === "project") {
        const result = await deletePrimaryProject(fetcher, ownerId, selection.sourceId, deleteStorageObjects);
        if (!result.deleted) throw new Error("PROJECT_NOT_FOUND_OR_FORBIDDEN");
        result.universeIds.forEach((id) => universeIds.add(id));
        result.storagePaths.forEach((path) => storageWarnings.add(path));
      } else {
        const wasDeleted = await deleteChildProject(fetcher, ownerId, selection, deleteStorageObjects);
        if (!wasDeleted) throw new Error("PROJECT_NOT_FOUND_OR_FORBIDDEN");
      }
      deleted.push(selection);
    } catch (error) {
      failed.push({
        ...selection,
        error: error instanceof Error ? error.message : "TEST_PROJECT_DELETE_FAILED",
      });
    }
  }

  const deletedUniverseIds: string[] = [];
  for (const universeId of universeIds) {
    if (await deleteUniverseIfEmpty(fetcher, ownerId, universeId)) {
      deletedUniverseIds.push(universeId);
    }
  }

  return {
    deleted,
    failed,
    deletedUniverseIds,
    storageWarnings: [...storageWarnings],
  };
}

async function readOwnedRow(
  fetcher: ProjectLibraryFetcher,
  ownerId: string,
  selection: TestCleanupSelection,
): Promise<Row | null> {
  const owner = encodeURIComponent(ownerId);
  const sourceId = encodeURIComponent(selection.sourceId);
  const table = projectLibraryTable(selection.source);
  const ownerFilter = selection.source === "project"
    ? `or=(owner_id.eq.${owner},user_id.eq.${owner})`
    : `${selection.source === "viral" ? "user_id" : "owner_id"}=eq.${owner}`;
  const rows = await fetcher<Row[]>(
    `/rest/v1/${table}?id=eq.${sourceId}&${ownerFilter}&select=*&limit=1`,
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function deletePrimaryProject(
  fetcher: ProjectLibraryFetcher,
  ownerId: string,
  sourceId: string,
  deleteStorageObjects: TestCleanupStorageDeleter,
): Promise<{ deleted: boolean; universeIds: string[]; storagePaths: string[] }> {
  const selection: TestCleanupSelection = { source: "project", sourceId };
  const row = await readOwnedRow(fetcher, ownerId, selection);
  if (!row) return { deleted: false, universeIds: [], storagePaths: [] };

  const owner = encodeURIComponent(ownerId);
  const project = encodeURIComponent(sourceId);
  const links = await fetcher<Row[]>(
    `/rest/v1/storyflow_universe_project_links?project_id=eq.${project}&user_id=eq.${owner}&select=universe_id`,
  );
  const assets = await fetcher<Row[]>(
    `/rest/v1/storyflow_assets?project_id=eq.${project}&user_id=eq.${owner}&select=asset_type,storage_path,metadata`,
  );
  const universeIds = new Set<string>();
  const directUniverseId = stringValue(row.universe_id);
  if (directUniverseId) universeIds.add(directUniverseId);
  for (const link of Array.isArray(links) ? links : []) {
    const universeId = stringValue(link.universe_id);
    if (universeId) universeIds.add(universeId);
  }
  const storageObjects = (Array.isArray(assets) ? assets : [])
    .map(storageObjectForAsset)
    .filter((item): item is TestCleanupStorageObject => Boolean(item));
  const mappedPaths = new Set(storageObjects.map((item) => item.path));
  const storagePaths = (Array.isArray(assets) ? assets : [])
    .map((asset) => stringValue(asset.storage_path))
    .filter((path) => Boolean(path) && !mappedPaths.has(path));

  if (storageObjects.length > 0) await deleteStorageObjects(storageObjects);

  for (const scoped of PROJECT_SCOPED_TABLES) {
    await fetcher(
      `/rest/v1/${scoped.table}?project_id=eq.${project}&${scoped.owner}=eq.${owner}`,
      { method: "DELETE" },
    );
  }
  await fetcher(
    `/rest/v1/storyflow_generation_tasks?or=(project_id.eq.${project},project_ref.eq.${project})&user_id=eq.${owner}`,
    { method: "DELETE" },
  );

  const rows = await fetcher<Row[]>(
    `/rest/v1/storyflow_projects?id=eq.${project}&or=(owner_id.eq.${owner},user_id.eq.${owner})`,
    { method: "DELETE", headers: { Prefer: "return=representation" } },
  );
  return {
    deleted: Array.isArray(rows) && rows.length === 1,
    universeIds: [...universeIds],
    storagePaths,
  };
}

async function deleteChildProject(
  fetcher: ProjectLibraryFetcher,
  ownerId: string,
  selection: TestCleanupSelection,
  deleteStorageObjects: TestCleanupStorageDeleter,
) {
  const row = await readOwnedRow(fetcher, ownerId, selection);
  if (!row) return false;
  const storageObjects = await readChildStorageObjects(fetcher, selection, row);
  if (storageObjects.length > 0) await deleteStorageObjects(storageObjects);
  const owner = encodeURIComponent(ownerId);
  const sourceId = encodeURIComponent(selection.sourceId);
  const ownerColumn = selection.source === "viral" ? "user_id" : "owner_id";
  const rows = await fetcher<Row[]>(
    `/rest/v1/${projectLibraryTable(selection.source)}?id=eq.${sourceId}&${ownerColumn}=eq.${owner}`,
    { method: "DELETE", headers: { Prefer: "return=representation" } },
  );
  return Array.isArray(rows) && rows.length === 1;
}

async function readChildStorageObjects(
  fetcher: ProjectLibraryFetcher,
  selection: TestCleanupSelection,
  row: Row,
): Promise<TestCleanupStorageObject[]> {
  if (selection.source === "viral") {
    const path = stringValue(row.source_video_path);
    return path ? [{ bucket: "viral-assets", path }] : [];
  }
  if (selection.source !== "art") return [];

  const project = encodeURIComponent(selection.sourceId);
  const assets = await fetcher<Row[]>(
    `/rest/v1/storyflow_art_assets?project_id=eq.${project}&select=id`,
  );
  const assetIds = idsFromRows(assets);
  if (assetIds.length === 0) return [];
  const variants = await fetcher<Row[]>(
    `/rest/v1/storyflow_art_asset_variants?asset_id=in.(${assetIds.map(encodeURIComponent).join(",")})&select=id`,
  );
  const variantIds = idsFromRows(variants);
  if (variantIds.length === 0) return [];
  const versions = await fetcher<Row[]>(
    `/rest/v1/storyflow_art_asset_versions?variant_id=in.(${variantIds.map(encodeURIComponent).join(",")})&select=storage_path`,
  );
  return (Array.isArray(versions) ? versions : [])
    .map((version) => stringValue(version.storage_path))
    .filter(Boolean)
    .map((path) => ({ bucket: "art-assets", path }));
}

function storageObjectForAsset(asset: Row): TestCleanupStorageObject | null {
  const path = stringValue(asset.storage_path);
  if (!path) return null;
  const metadata = objectValue(asset.metadata);
  const explicitBucket = stringValue(metadata.storage_bucket) || stringValue(metadata.storageBucket);
  if (explicitBucket) return { bucket: explicitBucket, path };
  const assetType = stringValue(asset.asset_type);
  if (assetType === "audio") return { bucket: "audio-assets", path };
  if (assetType === "image" || assetType.startsWith("actor_avatar")) return { bucket: "art-assets", path };
  if (assetType === "video") return { bucket: "storyboard-videos", path };
  return null;
}

function idsFromRows(rows: Row[]) {
  return (Array.isArray(rows) ? rows : []).map((row) => stringValue(row.id)).filter(Boolean);
}

async function deleteUniverseIfEmpty(
  fetcher: ProjectLibraryFetcher,
  ownerId: string,
  universeId: string,
) {
  const owner = encodeURIComponent(ownerId);
  const universe = encodeURIComponent(universeId);
  try {
    const universes = await fetcher<Row[]>(
      `/rest/v1/storyflow_universes?id=eq.${universe}&user_id=eq.${owner}&select=id,user_id,share_status,status&limit=1`,
    );
    const row = Array.isArray(universes) ? universes[0] : null;
    if (!row || row.share_status === "shared" || row.status === "published") return false;

    for (const table of UNIVERSE_CONTENT_TABLES) {
      const rows = await fetcher<Row[]>(
        `/rest/v1/${table}?universe_id=eq.${universe}&select=id&limit=1`,
      );
      if (Array.isArray(rows) && rows.length > 0) return false;
    }

    const deleted = await fetcher<Row[]>(
      `/rest/v1/storyflow_universes?id=eq.${universe}&user_id=eq.${owner}`,
      { method: "DELETE", headers: { Prefer: "return=representation" } },
    );
    return Array.isArray(deleted) && deleted.length === 1;
  } catch {
    return false;
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function objectValue(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}
