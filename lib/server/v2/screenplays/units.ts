/**
 * KIIKIS V2.2 Screenplay units service — Phase 3 Task 3.2.
 *
 * Unit identity (type/parent/order/title/readiness) is mutable; unit CONTENT
 * lives exclusively in immutable, append-only unit versions:
 *   - createUnit / updateUnitIdentity / markFinalized — identity ops
 *   - saveUnitContent — append a version (CAS via baseVersionId → 409)
 *   - adaptLegacyProject — map legacy story_bible/episodes/scenes into units
 *     with stable legacy ids; never batch-overwrites legacy fields
 */

import { canonicalJson, sha256Hex, utf8Bytes } from "../../../compliance/manifest.ts";
import {
  isScreenplayUnitType,
  type ScreenplayUnitType,
} from "../../../contracts/v2/screenplay-studio.ts";

export type UnitsFetcher = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

export class ScreenplayUnitsError extends Error {
  readonly code:
    | "unauthenticated"
    | "forbidden"
    | "not_found"
    | "conflict"
    | "validation_failed"
    | "service_unavailable";
  readonly currentVersionId?: string;

  constructor(code: ScreenplayUnitsError["code"], message: string, options?: { currentVersionId?: string }) {
    super(`${code}: ${message}`);
    this.name = "ScreenplayUnitsError";
    this.code = code;
    if (options?.currentVersionId) this.currentVersionId = options.currentVersionId;
  }
}

interface WorkRow { id: string; owner_id: string }
interface UnitRow {
  id: string;
  work_id: string;
  type: ScreenplayUnitType;
  parent_id: string | null;
  order_index: number;
  title: string;
  readiness: string;
  current_version_id: string | null;
  finalized_version_id: string | null;
  legacy_id: string | null;
}
interface UnitVersionRow {
  id: string;
  work_id: string;
  unit_id: string;
  parent_version_id: string | null;
  content_schema: string;
  content_json: unknown;
  content_hash: string;
  source: string;
  source_message_ids: string[];
  created_at: string;
}
export interface UnitReference { unitId: string | null; unitVersionId: string | null }

export interface ScreenplayUnitDto {
  id: string;
  workId: string;
  type: ScreenplayUnitType;
  parentId: string | null;
  order: number;
  title: string;
  readiness: string;
  currentVersionId: string | null;
  finalizedVersionId: string | null;
  legacyId: string | null;
}

export interface UnitVersionDto {
  id: string;
  unitId: string;
  parentVersionId: string | null;
  contentHash: string;
  createdAt: string;
}

const UNIT_COLUMNS = "id,work_id,type,parent_id,order_index,title,readiness,current_version_id,finalized_version_id,legacy_id";
const VERSION_COLUMNS = "id,work_id,unit_id,parent_version_id,content_schema,content_json,content_hash,source,source_message_ids,created_at";

export class ScreenplayUnitsService {
  private readonly fetcher: UnitsFetcher;

  constructor(fetcher: UnitsFetcher) {
    this.fetcher = fetcher;
  }

  // ---------------------------------------------------------
  // Identity ops
  // ---------------------------------------------------------

  async createUnit(params: {
    ownerId: string;
    workId: string;
    type: string;
    title: string;
    parentId: string | null;
    order: number;
    legacyId?: string;
  }): Promise<{ unit: ScreenplayUnitDto }> {
    await this.assertWorkOwner(params.ownerId, params.workId);
    if (!isScreenplayUnitType(params.type)) {
      throw new ScreenplayUnitsError("validation_failed", `Unknown unit type: ${params.type}.`);
    }
    if (typeof params.order !== "number" || !Number.isInteger(params.order) || params.order < 0) {
      throw new ScreenplayUnitsError("validation_failed", "order must be a non-negative integer.");
    }
    if (params.parentId) {
      const parent = await this.readUnit(params.workId, params.parentId);
      void parent;
    }
    const rows = await post<UnitRow[]>(this.fetcher, "/rest/v1/storyflow_screenplay_units", {
      work_id: params.workId,
      type: params.type,
      parent_id: params.parentId,
      order_index: params.order,
      title: params.title,
      readiness: "empty",
      legacy_id: params.legacyId ?? null,
      created_by: params.ownerId,
    });
    const row = rows?.[0];
    if (!row) throw new ScreenplayUnitsError("service_unavailable", "Unable to create unit.");
    return { unit: toUnitDto(row) };
  }

  async updateUnitIdentity(params: {
    ownerId: string;
    workId: string;
    unitId: string;
    title?: string;
    order?: number;
    parentId?: string | null;
  }): Promise<{ unit: ScreenplayUnitDto }> {
    await this.assertWorkOwner(params.ownerId, params.workId);
    const existing = await this.readUnit(params.workId, params.unitId);
    void existing;
    const patchBody: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (params.title !== undefined) patchBody.title = params.title;
    if (params.order !== undefined) {
      if (!Number.isInteger(params.order) || params.order < 0) {
        throw new ScreenplayUnitsError("validation_failed", "order must be a non-negative integer.");
      }
      patchBody.order_index = params.order;
    }
    if (params.parentId !== undefined) patchBody.parent_id = params.parentId;
    const rows = await patch<UnitRow[]>(
      this.fetcher,
      `/rest/v1/storyflow_screenplay_units?id=eq.${encodeURIComponent(params.unitId)}`,
      patchBody,
    );
    const row = rows?.[0];
    if (!row) throw new ScreenplayUnitsError("service_unavailable", "Unable to update unit.");
    return { unit: toUnitDto(row) };
  }

  async markFinalized(params: {
    ownerId: string;
    workId: string;
    unitId: string;
    versionId: string;
  }): Promise<{ unit: ScreenplayUnitDto }> {
    await this.assertWorkOwner(params.ownerId, params.workId);
    const version = await this.readVersion(params.workId, params.unitId, params.versionId);
    const rows = await patch<UnitRow[]>(
      this.fetcher,
      `/rest/v1/storyflow_screenplay_units?id=eq.${encodeURIComponent(params.unitId)}`,
      { readiness: "finalized", finalized_version_id: version.id, current_version_id: version.id, updated_at: new Date().toISOString() },
    );
    const row = rows?.[0];
    if (!row) throw new ScreenplayUnitsError("service_unavailable", "Unable to finalize unit.");
    return { unit: toUnitDto(row) };
  }

  // ---------------------------------------------------------
  // Immutable content versions
  // ---------------------------------------------------------

  async saveUnitContent(params: {
    ownerId: string;
    workId: string;
    unitId: string;
    content: Record<string, unknown>;
    baseVersionId: string | null;
    source?: string;
    sourceMessageIds?: string[];
    references?: UnitReference[];
    idempotencyKey?: string;
  }): Promise<{ version: UnitVersionDto; references: UnitReference[] }> {
    await this.assertWorkOwner(params.ownerId, params.workId);
    const unit = await this.readUnit(params.workId, params.unitId);

    // Idempotent replay: same key → return existing version.
    if (params.idempotencyKey) {
      const existing = await get<UnitVersionRow[]>(
        this.fetcher,
        `/rest/v1/storyflow_screenplay_unit_versions?unit_id=eq.${encodeURIComponent(params.unitId)}&idempotency_key=eq.${encodeURIComponent(params.idempotencyKey)}&select=${VERSION_COLUMNS}&limit=1`,
      );
      if (existing?.[0]) return { version: toVersionDto(existing[0]), references: params.references ?? [] };
    }

    // CAS on baseVersionId: latest version for this unit must equal base.
    const latest = await get<UnitVersionRow[]>(
      this.fetcher,
      `/rest/v1/storyflow_screenplay_unit_versions?unit_id=eq.${encodeURIComponent(params.unitId)}&order=created_at.desc&select=${VERSION_COLUMNS}&limit=1`,
    );
    const latestId = latest?.[0]?.id ?? null;
    if ((params.baseVersionId ?? null) !== latestId) {
      throw new ScreenplayUnitsError("conflict", "Unit was modified by someone else.", { currentVersionId: latestId ?? undefined });
    }

    const contentHash = sha256Hex(utf8Bytes(canonicalJson(params.content)));
    const rows = await post<UnitVersionRow[]>(this.fetcher, "/rest/v1/storyflow_screenplay_unit_versions", {
      work_id: params.workId,
      unit_id: params.unitId,
      parent_version_id: params.baseVersionId,
      content_schema: "kiikis.screenplay-unit/1",
      content_json: params.content,
      content_hash: contentHash,
      source: params.source ?? "manual",
      source_message_ids: params.sourceMessageIds ?? [],
      ...(params.idempotencyKey ? { idempotency_key: params.idempotencyKey } : {}),
      created_by: params.ownerId,
    });
    const row = rows?.[0];
    if (!row) throw new ScreenplayUnitsError("service_unavailable", "Unable to save unit version.");

    // Record dependency edges for explicit upstream references.
    for (const ref of params.references ?? []) {
      if (!ref.unitId || !ref.unitVersionId) continue;
      await post(this.fetcher, "/rest/v1/storyflow_screenplay_dependency_edges", {
        work_id: params.workId,
        source_unit_id: ref.unitId,
        source_unit_version_id: ref.unitVersionId,
        target_unit_id: params.unitId,
        target_unit_version_id: row.id,
        state: "current",
        created_by: params.ownerId,
      });
    }

    // Bump unit readiness draft + current version pointer (identity, not content).
    await patch(
      this.fetcher,
      `/rest/v1/storyflow_screenplay_units?id=eq.${encodeURIComponent(params.unitId)}`,
      {
        current_version_id: row.id,
        readiness: unit.readiness === "finalized" ? "draft" : unit.readiness === "empty" ? "draft" : unit.readiness,
        updated_at: new Date().toISOString(),
      },
    );
    void unit;

    return { version: toVersionDto(row), references: params.references ?? [] };
  }

  // ---------------------------------------------------------
  // Reads
  // ---------------------------------------------------------

  async listUnits(params: { ownerId: string; workId: string }): Promise<{ units: ScreenplayUnitDto[] }> {
    await this.assertWorkOwner(params.ownerId, params.workId);
    const rows = await get<UnitRow[]>(
      this.fetcher,
      `/rest/v1/storyflow_screenplay_units?work_id=eq.${encodeURIComponent(params.workId)}&order=order_index.asc&select=${UNIT_COLUMNS}&limit=2000`,
    );
    return { units: (rows ?? []).map(toUnitDto) };
  }

  async getUnit(params: { ownerId: string; workId: string; unitId: string }): Promise<{ unit: ScreenplayUnitDto; content: unknown }> {
    await this.assertWorkOwner(params.ownerId, params.workId);
    const unit = await this.readUnit(params.workId, params.unitId);
    let content: unknown = null;
    if (unit.current_version_id) {
      const versions = await get<UnitVersionRow[]>(
        this.fetcher,
        `/rest/v1/storyflow_screenplay_unit_versions?id=eq.${encodeURIComponent(unit.current_version_id)}&select=${VERSION_COLUMNS}&limit=1`,
      );
      content = versions?.[0]?.content_json ?? null;
    }
    return { unit: toUnitDto(unit), content };
  }

  // ---------------------------------------------------------
  // Legacy project adaptation (Step 4)
  // ---------------------------------------------------------

  async adaptLegacyProject(params: {
    ownerId: string;
    workId: string;
    projectId: string;
  }): Promise<{ units: ScreenplayUnitDto[]; created: number }> {
    await this.assertWorkOwner(params.ownerId, params.workId);
    const projects = await get<Array<Record<string, unknown>>>(
      this.fetcher,
      `/rest/v1/storyflow_projects?id=eq.${encodeURIComponent(params.projectId)}&select=id,owner_id,work_id,story_bible,episodes&limit=1`,
    );
    const project = projects?.[0];
    if (!project) throw new ScreenplayUnitsError("not_found", "Legacy project not found.");
    if (String(project.owner_id) !== params.ownerId) {
      throw new ScreenplayUnitsError("forbidden", "Legacy project access denied.");
    }

    // Read existing adapted units (idempotency by legacy_id).
    const existing = await this.listUnits({ ownerId: params.ownerId, workId: params.workId });
    const existingLegacyIds = new Set(existing.units.map((u) => u.legacyId).filter(Boolean));

    const toCreate: Array<{ type: ScreenplayUnitType; title: string; parentId: string | null; order: number; legacyId: string; content?: Record<string, unknown> }> = [];

    const bible = (project.story_bible ?? {}) as Record<string, unknown>;
    if (bible.worldview && !existingLegacyIds.has(`${params.projectId}:world`)) {
      toCreate.push({ type: "world", title: "世界观", parentId: null, order: 1, legacyId: `${params.projectId}:world`, content: { body: String(bible.worldview) } });
    }
    const characters = Array.isArray(bible.characters) ? (bible.characters as Array<Record<string, unknown>>) : [];
    characters.forEach((c, i) => {
      const legacyId = `${params.projectId}:character:${String(c.name)}`;
      if (!existingLegacyIds.has(legacyId)) {
        toCreate.push({ type: "character", title: String(c.name), parentId: null, order: i + 1, legacyId, content: { role: c.role ?? null } });
      }
    });
    const episodes = Array.isArray(project.episodes) ? (project.episodes as Array<Record<string, unknown>>) : [];
    for (const ep of episodes) {
      const epLegacyId = String(ep.id);
      if (!existingLegacyIds.has(epLegacyId)) {
        toCreate.push({ type: "episode", title: String(ep.title ?? ""), parentId: null, order: Number(ep.order ?? 1), legacyId: epLegacyId, content: { body: String(ep.summary ?? "") } });
      }
      const scenes = Array.isArray(ep.scenes) ? (ep.scenes as Array<Record<string, unknown>>) : [];
      scenes.forEach((sc, i) => {
        const scLegacyId = String(sc.id);
        if (!existingLegacyIds.has(scLegacyId)) {
          toCreate.push({ type: "scene", title: String(sc.title ?? ""), parentId: null, order: Number(sc.order ?? i + 1), legacyId: scLegacyId, content: { body: String(sc.content ?? "") } });
        }
      });
    }

    // Materialize: create units + first versions; never touch legacy fields.
    const idByLegacy = new Map(existing.units.map((u) => [u.legacyId, u.id]));
    const created: ScreenplayUnitDto[] = [];
    let createdCount = 0;
    for (const item of toCreate) {
      // Resolve parent lazily: scenes attach to their episode unit.
      let parentId: string | null = null;
      if (item.type === "scene") {
        const ownerEp = episodes.find((ep) =>
          Array.isArray(ep.scenes) && (ep.scenes as Array<Record<string, unknown>>).some((sc) => String(sc.id) === item.legacyId),
        );
        if (ownerEp) parentId = idByLegacy.get(String(ownerEp.id)) ?? null;
      }
      const { unit } = await this.createUnit({
        ownerId: params.ownerId,
        workId: params.workId,
        type: item.type,
        title: item.title,
        parentId,
        order: item.order,
        legacyId: item.legacyId,
      });
      idByLegacy.set(item.legacyId, unit.id);
      createdCount += 1;
      if (item.content) {
        await this.saveUnitContent({
          ownerId: params.ownerId,
          workId: params.workId,
          unitId: unit.id,
          content: item.content,
          baseVersionId: null,
        });
      }
      created.push(unit);
    }

    const all = await this.listUnits({ ownerId: params.ownerId, workId: params.workId });
    return { units: all.units, created: createdCount };
  }

  // ---------------------------------------------------------
  // Internals
  // ---------------------------------------------------------

  private async assertWorkOwner(ownerId: string, workId: string): Promise<WorkRow> {
    if (!ownerId) throw new ScreenplayUnitsError("unauthenticated", "Authentication is required.");
    if (!workId) throw new ScreenplayUnitsError("validation_failed", "workId is required.");
    const rows = await get<WorkRow[]>(
      this.fetcher,
      `/rest/v1/storyflow_works?id=eq.${encodeURIComponent(workId)}&select=id,owner_id&limit=1`,
    );
    const work = rows?.[0];
    if (!work) throw new ScreenplayUnitsError("not_found", "Work not found.");
    if (work.owner_id !== ownerId) throw new ScreenplayUnitsError("forbidden", "Work access denied.");
    return work;
  }

  private async readUnit(workId: string, unitId: string): Promise<UnitRow> {
    const rows = await get<UnitRow[]>(
      this.fetcher,
      `/rest/v1/storyflow_screenplay_units?id=eq.${encodeURIComponent(unitId)}&work_id=eq.${encodeURIComponent(workId)}&select=${UNIT_COLUMNS}&limit=1`,
    );
    const row = rows?.[0];
    if (!row) throw new ScreenplayUnitsError("not_found", "Screenplay unit not found.");
    return row;
  }

  private async readVersion(workId: string, unitId: string, versionId: string): Promise<UnitVersionRow> {
    const rows = await get<UnitVersionRow[]>(
      this.fetcher,
      `/rest/v1/storyflow_screenplay_unit_versions?id=eq.${encodeURIComponent(versionId)}&unit_id=eq.${encodeURIComponent(unitId)}&work_id=eq.${encodeURIComponent(workId)}&select=${VERSION_COLUMNS}&limit=1`,
    );
    const row = rows?.[0];
    if (!row) throw new ScreenplayUnitsError("not_found", "Unit version not found.");
    return row;
  }
}

function toUnitDto(row: UnitRow): ScreenplayUnitDto {
  return {
    id: row.id,
    workId: row.work_id,
    type: row.type,
    parentId: row.parent_id,
    order: row.order_index,
    title: row.title,
    readiness: row.readiness,
    currentVersionId: row.current_version_id,
    finalizedVersionId: row.finalized_version_id,
    legacyId: row.legacy_id,
  };
}

function toVersionDto(row: UnitVersionRow): UnitVersionDto {
  return {
    id: row.id,
    unitId: row.unit_id,
    parentVersionId: row.parent_version_id,
    contentHash: row.content_hash,
    createdAt: row.created_at,
  };
}

async function get<T>(fetcher: UnitsFetcher, path: string): Promise<T> {
  return fetcher<T>(path);
}

async function post<T>(fetcher: UnitsFetcher, path: string, body: unknown): Promise<T> {
  return fetcher<T>(path, {
    method: "POST",
    headers: { Prefer: "return=representation", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function patch<T>(fetcher: UnitsFetcher, path: string, body: unknown): Promise<T> {
  return fetcher<T>(path, {
    method: "PATCH",
    headers: { Prefer: "return=representation", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
