/**
 * Ranking for Context Packet selection — Phase 2 Task 2.3.
 *
 * Pure functions with no external dependencies. The main service
 * (index.ts) builds RankableObject instances from persisted Canon
 * objects, then uses these functions to order and budget them.
 *
 * Priority order (highest relevance first):
 *   1. Current scene characters / locations
 *   2. Relationships involving current scene entities
 *   3. Timeline neighbors
 *   4. Other included Canon objects
 */

export type EntityType = "entity" | "fact" | "relationship" | "timeline_event" | "asset";

export interface RankableObject {
  type: EntityType;
  id: string;
  versionId: string;
  relevanceScore: number;
  reason: string;
  content: Record<string, unknown>;
  byteSize: number;
}

/**
 * Rank objects by relevance score (descending), then by id (stable).
 *
 * Fixed input always produces the same output order, regardless of the
 * original array order — this is the determinism guarantee for the packet.
 */
export function rankByRelevance(objects: RankableObject[]): RankableObject[] {
  return [...objects].sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * Select objects within a byte budget, highest relevance first.
 *
 * Objects are processed in ranked order. If adding an object would exceed
 * the budget it is skipped and the next (smaller) candidate is considered.
 * This greedy approach maximizes the number of included objects while
 * respecting the budget — large irrelevant long-text is naturally excluded
 * because it sits at the bottom of the ranked list.
 *
 * Returns the selected objects and the total bytes consumed.
 */
export function selectWithinBudget(
  ranked: RankableObject[],
  tokenBudget: number,
): { selected: RankableObject[]; totalBytes: number } {
  const selected: RankableObject[] = [];
  let totalBytes = 0;
  for (const obj of ranked) {
    if (totalBytes + obj.byteSize > tokenBudget) {
      continue;
    }
    selected.push(obj);
    totalBytes += obj.byteSize;
  }
  return { selected, totalBytes };
}

/**
 * Estimate the byte size of a Canon object's content.
 *
 * Uses UTF-8 encoded JSON length. This is an estimate — the exact byte size
 * used for budget enforcement is the same value computed here, so the budget
 * check is internally consistent.
 *
 * Always returns a positive number (at least 2 for `{}`).
 */
export function estimateObjectByteSize(content: Record<string, unknown>): number {
  const json = JSON.stringify(content);
  return new TextEncoder().encode(json).byteLength;
}
