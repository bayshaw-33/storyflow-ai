/**
 * KIIKIS V2.2 Screenplay Studio contracts — Phase 3 Task 3.1.
 *
 * Structured Screenplay Document for the V2.2 “最好用的剧本室”:
 * world / character / outline / episode / scene units with free navigation
 * (no forced linear gates), per-unit readiness, and upstream/downstream
 * dependency states.
 *
 * contract_version = 2.2.0-alpha.1 (additive; legacy V2 contracts untouched).
 *
 * Persistence-agnostic DTOs: DB row names, storage paths and provider metadata
 * stay in server adapters and never cross the v2.2 API boundary.
 *
 * NOTE: no `node:crypto` here — this module is imported by client bundles.
 * Hash helpers live in server-only modules.
 */

import { KIIKIS_22_CONTRACT_VERSION } from "./work-history.ts";

export { KIIKIS_22_CONTRACT_VERSION };

// ---------------------------------------------------------------------------
// Schemas & enums
// ---------------------------------------------------------------------------

export const SCREENPLAY_DOCUMENT_V1_SCHEMA = "kiikis.screenplay/1" as const;

export const SCREENPLAY_UNIT_TYPES = [
  "world",
  "character",
  "outline",
  "episode",
  "scene",
] as const;
export type ScreenplayUnitType = (typeof SCREENPLAY_UNIT_TYPES)[number];

export const UNIT_READINESS = ["empty", "draft", "checkpoint", "finalized"] as const;
export type UnitReadiness = (typeof UNIT_READINESS)[number];

export const DEPENDENCY_STATES = ["current", "stale", "conflict"] as const;
export type DependencyState = (typeof DEPENDENCY_STATES)[number];

/**
 * Stable document ordering: type groups first (world → character → outline →
 * episode → scene), then `order` ascending, then `id` as final tiebreaker so
 * the canonical serialization is deterministic regardless of input order.
 */
export const SCREENPLAY_UNIT_TYPE_ORDER: Record<ScreenplayUnitType, number> = {
  world: 0,
  character: 1,
  outline: 2,
  episode: 3,
  scene: 4,
};

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface ScreenplayUnitRef {
  id: string;
  type: ScreenplayUnitType;
  parentId: string | null;
  order: number;
  title: string;
  readiness: UnitReadiness;
  dependencyState: DependencyState;
  currentVersionId: string | null;
  /** Owning work id; must match the document's workId. */
  workId: string;
}

export interface ScreenplayDocumentV1 {
  schemaVersion: typeof SCREENPLAY_DOCUMENT_V1_SCHEMA;
  workId: string;
  units: ScreenplayUnitRef[];
}

// ---------------------------------------------------------------------------
// Errors & guards
// ---------------------------------------------------------------------------

export class ScreenplayStudioContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScreenplayStudioContractError";
  }
}

export function isScreenplayUnitType(value: unknown): value is ScreenplayUnitType {
  return typeof value === "string" && (SCREENPLAY_UNIT_TYPES as readonly string[]).includes(value);
}

export function isUnitReadiness(value: unknown): value is UnitReadiness {
  return typeof value === "string" && (UNIT_READINESS as readonly string[]).includes(value);
}

export function isDependencyState(value: unknown): value is DependencyState {
  return typeof value === "string" && (DEPENDENCY_STATES as readonly string[]).includes(value);
}

/** Parent rules per unit type: allowed parent types; empty = must be root. */
const ALLOWED_PARENT_TYPES: Record<ScreenplayUnitType, readonly ScreenplayUnitType[]> = {
  world: [],
  character: [],
  outline: [],
  episode: ["outline"],
  scene: ["episode"],
};

function fail(message: string): never {
  throw new ScreenplayStudioContractError(message);
}

export function assertScreenplayDocumentV1(input: unknown): asserts input is ScreenplayDocumentV1 {
  if (!input || typeof input !== "object") fail("Screenplay document must be an object.");
  const doc = input as Record<string, unknown>;
  if (doc.schemaVersion !== SCREENPLAY_DOCUMENT_V1_SCHEMA) {
    fail(`schemaVersion must be ${SCREENPLAY_DOCUMENT_V1_SCHEMA}.`);
  }
  if (typeof doc.workId !== "string" || !doc.workId) fail("workId must be a non-empty string.");
  if (!Array.isArray(doc.units)) fail("units must be an array.");

  const byId = new Map<string, Record<string, unknown>>();
  for (const raw of doc.units) {
    if (!raw || typeof raw !== "object") fail("Each unit must be an object.");
    const u = raw as Record<string, unknown>;
    if (typeof u.id !== "string" || !u.id) fail("Unit id must be a non-empty string.");
    if (byId.has(u.id)) fail(`Duplicate unit id: ${u.id}.`);
    if (!isScreenplayUnitType(u.type)) fail(`Unit ${u.id}: unknown type ${String(u.type)}.`);
    if (u.parentId !== null && typeof u.parentId !== "string") {
      fail(`Unit ${u.id}: parentId must be a string or null.`);
    }
    if (typeof u.order !== "number" || !Number.isInteger(u.order) || u.order < 0) {
      fail(`Unit ${u.id}: order must be a non-negative integer.`);
    }
    if (typeof u.title !== "string") fail(`Unit ${u.id}: title must be a string.`);
    if (!isUnitReadiness(u.readiness)) fail(`Unit ${u.id}: unknown readiness ${String(u.readiness)}.`);
    if (!isDependencyState(u.dependencyState)) {
      fail(`Unit ${u.id}: unknown dependencyState ${String(u.dependencyState)}.`);
    }
    if (u.currentVersionId !== null && typeof u.currentVersionId !== "string") {
      fail(`Unit ${u.id}: currentVersionId must be a string or null.`);
    }
    if (typeof u.workId !== "string" || u.workId !== doc.workId) {
      fail(`Unit ${u.id}: workId must match the document workId.`);
    }
    byId.set(u.id, u);
  }

  // Parent references, per-type parent rules, order uniqueness, cycles.
  // Order is unique among siblings sharing the same parent AND type (root-level
  // world/character/outline groups each keep their own sequence).
  const ordersByKey = new Map<string, Set<number>>();
  for (const [id, u] of byId) {
    const type = u.type as ScreenplayUnitType;
    const allowed = ALLOWED_PARENT_TYPES[type];
    if (u.parentId === null) {
      if (allowed.length > 0 && type === "scene") {
        fail(`Unit ${id}: scene units require an episode parent.`);
      }
    } else {
      const parent = byId.get(u.parentId as string);
      if (!parent) fail(`Unit ${id}: unknown parent ${u.parentId}.`);
      const parentType = parent.type as ScreenplayUnitType;
      if (!(ALLOWED_PARENT_TYPES[type] as readonly string[]).includes(parentType)) {
        fail(`Unit ${id}: ${type} parent must be one of [${ALLOWED_PARENT_TYPES[type].join(", ")}], got ${parentType}.`);
      }
    }
    const parentKey = `${(u.parentId as string | null) ?? "__root__"}::${type}`;
    let orders = ordersByKey.get(parentKey);
    if (!orders) {
      orders = new Set<number>();
      ordersByKey.set(parentKey, orders);
    }
    if (orders.has(u.order as number)) {
      fail(`Unit ${id}: duplicate order ${u.order} under the same parent.`);
    }
    orders.add(u.order as number);

    // Cycle check: walk ancestors with a visited set.
    const seen = new Set<string>([id]);
    let cursor = u.parentId as string | null;
    while (cursor) {
      if (seen.has(cursor)) fail(`Unit ${id}: parent cycle detected at ${cursor}.`);
      seen.add(cursor);
      const node = byId.get(cursor);
      if (!node) break;
      cursor = node.parentId as string | null;
    }
  }
}

export function isScreenplayDocumentV1(input: unknown): input is ScreenplayDocumentV1 {
  try {
    assertScreenplayDocumentV1(input);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Canonical serialization (stable content identity)
// ---------------------------------------------------------------------------

/**
 * Deterministic serialization used for content hashing: units sorted by
 * (type group, parent chain root, order, id) with fixed field order. Input
 * array order never affects the output.
 */
export function canonicalScreenplayDocumentJson(doc: ScreenplayDocumentV1): string {
  const sorted = sortUnitsCanonically(doc.units);
  const stripped = sorted.map((u) => ({
    id: u.id,
    type: u.type,
    parentId: u.parentId,
    order: u.order,
    title: u.title,
    readiness: u.readiness,
    dependencyState: u.dependencyState,
    currentVersionId: u.currentVersionId,
    workId: u.workId,
  }));
  return JSON.stringify({
    schemaVersion: SCREENPLAY_DOCUMENT_V1_SCHEMA,
    workId: doc.workId,
    units: stripped,
  });
}

function sortUnitsCanonically(units: ScreenplayUnitRef[]): ScreenplayUnitRef[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const rootKey = (u: ScreenplayUnitRef): string => {
    let cursor: ScreenplayUnitRef | undefined = u;
    const guard = new Set<string>();
    while (cursor?.parentId) {
      if (guard.has(cursor.id)) break;
      guard.add(cursor.id);
      const parent = byId.get(cursor.parentId);
      if (!parent) break;
      cursor = parent;
    }
    return cursor?.id ?? u.id;
  };
  return [...units].sort((a, b) => {
    const ta = SCREENPLAY_UNIT_TYPE_ORDER[a.type];
    const tb = SCREENPLAY_UNIT_TYPE_ORDER[b.type];
    if (ta !== tb) return ta - tb;
    const ra = rootKey(a);
    const rb = rootKey(b);
    if (ra !== rb) return ra < rb ? -1 : 1;
    if (a.order !== b.order) return a.order - b.order;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
