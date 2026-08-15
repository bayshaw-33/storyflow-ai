/**
 * KIIKIS V2.2 Screenplay Document structure tools — Phase 3 Task 3.1.
 *
 * Server-side structural helpers over ScreenplayDocumentV1. Pure functions;
 * persistence lives in ./units.ts and ./dependencies.ts.
 */

import {
  type ScreenplayDocumentV1,
  type ScreenplayUnitRef,
  ScreenplayStudioContractError,
  assertScreenplayDocumentV1,
  canonicalScreenplayDocumentJson,
  SCREENPLAY_UNIT_TYPE_ORDER,
} from "../../../contracts/v2/screenplay-studio.ts";

import { sha256Hex, utf8Bytes } from "../../../compliance/manifest.ts";

/**
 * Validate + normalize raw input into a ScreenplayDocumentV1.
 * Throws ScreenplayStudioContractError on invalid structure (duplicate ids,
 * scene without episode parent, illegal order, cycles, cross-work units …).
 */
export function parseScreenplayDocument(input: unknown): ScreenplayDocumentV1 {
  assertScreenplayDocumentV1(input);
  const doc = input as ScreenplayDocumentV1;
  return {
    schemaVersion: doc.schemaVersion,
    workId: doc.workId,
    units: doc.units.map((u) => ({ ...u })),
  };
}

/**
 * Stable document order for UI trees: type groups (world → character →
 * outline → episode → scene), then root chain, then `order`, then id.
 */
export function orderUnits(units: ScreenplayUnitRef[]): ScreenplayUnitRef[] {
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

/** Ancestor chain from root to the unit's direct parent (excluding the unit). */
export function findUnitAncestors(units: ScreenplayUnitRef[], unitId: string): ScreenplayUnitRef[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const chain: ScreenplayUnitRef[] = [];
  const seen = new Set<string>([unitId]);
  let cursor = byId.get(unitId)?.parentId ?? null;
  while (cursor) {
    if (seen.has(cursor)) throw new ScreenplayStudioContractError(`Parent cycle detected at ${cursor}.`);
    seen.add(cursor);
    const node = byId.get(cursor);
    if (!node) throw new ScreenplayStudioContractError(`Unknown parent ${cursor}.`);
    chain.unshift(node);
    cursor = node.parentId;
  }
  return chain;
}

/** Direct children of a unit (one level down), in stable document order. */
export function findDownstreamUnits(units: ScreenplayUnitRef[], unitId: string): ScreenplayUnitRef[] {
  return orderUnits(units.filter((u) => u.parentId === unitId));
}

/** Content hash over the canonical serialization (server-only). */
export function computeScreenplayDocumentHash(doc: ScreenplayDocumentV1): string {
  return sha256Hex(utf8Bytes(canonicalScreenplayDocumentJson(doc)));
}
