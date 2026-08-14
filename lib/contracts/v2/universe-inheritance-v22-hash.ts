/**
 * KIIKIS V2.2 Universe Version content hash — server-safe module.
 *
 * Split from `universe-inheritance-v22.ts` (Phase 2 Task 2.1) so that the
 * main contract module stays free of `node:crypto` and can be safely imported
 * by client bundles. Hash computation depends on the compliance manifest
 * helpers (`canonicalJson` / `sha256Hex` / `utf8Bytes`) and therefore must
 * only be imported from server-side code or Node test runners.
 *
 * contract_version = 2.2.0-alpha.1 (same as KIIKIS_22_CONTRACT_VERSION).
 */

import {
  canonicalJson,
  sha256Hex,
  utf8Bytes,
} from "../../compliance/manifest.ts";
import {
  UniverseInheritanceContractError,
  type CanonObjectInput,
} from "./universe-inheritance-v22.ts";

// ---------------------------------------------------------------------------
// Universe Version content hash
// ---------------------------------------------------------------------------

const CANON_TYPE_ORDER: readonly CanonObjectInput["type"][] = [
  "entity",
  "fact",
  "relationship",
  "timeline_event",
  "asset",
];

/**
 * Compute a deterministic SHA-256 content hash for a set of Canon objects.
 *
 * Rules (PRD Task 2.1 Step 2):
 *   - Objects are grouped by type, then sorted by stable `id` within each group.
 *   - Groups are concatenated in CANON_TYPE_ORDER.
 *   - Only `id`, `versionId`, and `content` fields contribute to the hash;
 *     `updatedAt` and other non-content metadata are excluded.
 *   - The same object set and version order always produces the same hash,
 *     regardless of input order or timestamp.
 */
export function computeUniverseVersionContentHash(
  objects: readonly CanonObjectInput[],
): string {
  if (!Array.isArray(objects)) {
    throw new UniverseInheritanceContractError(
      "validation_failed",
      "objects must be an array",
      "objects",
    );
  }

  const groups = new Map<CanonObjectInput["type"], CanonObjectInput[]>();
  for (const obj of objects) {
    if (!obj || typeof obj !== "object") {
      throw new UniverseInheritanceContractError(
        "validation_failed",
        "each object must be a non-null object",
        "objects",
      );
    }
    if (!obj.id || typeof obj.id !== "string") {
      throw new UniverseInheritanceContractError(
        "validation_failed",
        "object id must be a non-empty string",
        "objects",
      );
    }
    if (!obj.versionId || typeof obj.versionId !== "string") {
      throw new UniverseInheritanceContractError(
        "validation_failed",
        "object versionId must be a non-empty string",
        "objects",
      );
    }
    if (!CANON_TYPE_ORDER.includes(obj.type)) {
      throw new UniverseInheritanceContractError(
        "validation_failed",
        `Unsupported object type: ${String(obj.type)}`,
        "type",
      );
    }
    const list = groups.get(obj.type) || [];
    list.push(obj);
    groups.set(obj.type, list);
  }

  // Sort each group by stable id, then build canonical payload.
  const orderedGroups = CANON_TYPE_ORDER.map((type) => {
    const list = (groups.get(type) || []).slice().sort((a, b) =>
      a.id.localeCompare(b.id)
    );
    return { type, items: list.map((o) => ({ id: o.id, versionId: o.versionId, content: o.content })) };
  });

  return sha256Hex(utf8Bytes(canonicalJson(orderedGroups)));
}
