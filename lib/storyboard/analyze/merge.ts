/**
 * Storyboard analyze — merge of AI proposals with persisted user state.
 *
 * Task card: KIIKIS-P1-KIMI-002 §1
 *
 * Merge rule (mode="full"):
 *   - existing scenes are matched to proposal scenes BY ORDER;
 *   - inside a matched scene, existing shots with locked || userEdited are
 *     PRESERVED VERBATIM (server id + all fields, idSource "server") at
 *     their original order positions;
 *   - AI proposal shots are re-sequenced around the preserved ones;
 *   - non-locked / non-edited existing shots are superseded (dropped).
 *
 * Merge rule (mode="scene"):
 *   - only the target scene is merged (same preserve rule);
 *   - the response contains ONLY the merged target scene proposal.
 *
 * ERASABLE SYNTAX ONLY (Node type-stripping).
 */

import type {
  PersistedStoryboardScene,
  PersistedStoryboardShot,
  StoryboardScene,
  StoryboardShot,
} from "../contracts.ts";

function isPreserved(shot: PersistedStoryboardShot): boolean {
  return shot.locked || shot.userEdited;
}

/**
 * Insert preserved shots at their original order positions and re-sequence
 * AI shots around them. Preserved shots whose order exceeds the merged
 * length are appended at the end (keeping relative order) — positions are
 * clamped because a 1-based slot cannot exist beyond the list length.
 */
export function mergeSceneShots(
  existingShots: PersistedStoryboardShot[],
  proposalShots: StoryboardShot[],
): StoryboardShot[] {
  const preserved = existingShots.filter(isPreserved).sort((a, b) => a.order - b.order);
  const preservedByOrder = new Map<number, PersistedStoryboardShot>();
  const overflow: PersistedStoryboardShot[] = [];
  const total = preserved.length + proposalShots.length;

  for (const shot of preserved) {
    if (shot.order >= 1 && shot.order <= total && !preservedByOrder.has(shot.order)) {
      preservedByOrder.set(shot.order, shot);
    } else {
      overflow.push(shot);
    }
  }

  const merged: StoryboardShot[] = [];
  const aiQueue = [...proposalShots];
  let overflowIndex = 0;

  for (let position = 1; position <= total; position += 1) {
    const pinned = preservedByOrder.get(position);
    if (pinned) {
      merged.push(pinned);
      continue;
    }
    const nextAi = aiQueue.shift();
    if (nextAi) {
      merged.push({ ...nextAi, order: position });
    } else {
      // Defensive: should not happen since total = preserved + ai counts.
      const extra = overflow[overflowIndex];
      if (extra) {
        overflowIndex += 1;
        merged.push({ ...extra, order: position });
      }
    }
  }

  // Any overflow preserved shots not yet placed keep relative order at the end.
  for (let i = overflowIndex; i < overflow.length; i += 1) {
    merged.push({ ...overflow[i], order: total + (i - overflowIndex) + 1 });
  }

  return merged.sort((a, b) => a.order - b.order);
}

/** Merge one proposal scene with its matched existing scene. */
export function mergeScene(
  existing: PersistedStoryboardScene | null,
  proposal: StoryboardScene,
): StoryboardScene {
  if (!existing) return proposal;
  return {
    ...proposal,
    shots: mergeSceneShots(existing.shots, proposal.shots),
  };
}

/**
 * Full-mode merge: match by order; scenes without an existing counterpart
 * pass through unchanged; existing scenes beyond the proposal range are
 * superseded (the AI re-analyzed the full script).
 */
export function mergeFullProposal(
  existingScenes: PersistedStoryboardScene[],
  proposalScenes: StoryboardScene[],
): StoryboardScene[] {
  const existingByOrder = new Map<number, PersistedStoryboardScene>();
  for (const scene of existingScenes) {
    if (!existingByOrder.has(scene.order)) existingByOrder.set(scene.order, scene);
  }
  return proposalScenes.map((proposal) =>
    mergeScene(existingByOrder.get(proposal.order) ?? null, proposal),
  );
}

/**
 * Scene-mode merge: exactly one proposal scene against the target existing
 * scene. The proposal keeps the target's server-side ORDER so the client
 * can slot it back into place.
 */
export function mergeSceneProposal(
  target: PersistedStoryboardScene,
  proposalScenes: StoryboardScene[],
): StoryboardScene {
  const base = proposalScenes[0];
  const proposal: StoryboardScene = base ? { ...base, order: target.order } : emptyProposalFor(target);
  return mergeScene(target, proposal);
}

function emptyProposalFor(target: PersistedStoryboardScene): StoryboardScene {
  // Defensive fallback — analyze guarantees ≥1 scene, so this is unreachable
  // in the normal flow. Kept to make the merge total.
  return {
    clientId: target.clientId ?? target.id,
    idSource: "client",
    order: target.order,
    heading: target.heading,
    location: target.location,
    timeOfDay: target.timeOfDay,
    summary: target.summary,
    sourceText: target.sourceText,
    characterAssetIds: [...target.characterAssetIds],
    propAssetIds: [...target.propAssetIds],
    shots: [],
    locked: false,
    userEdited: false,
    confirmed: false,
    revision: target.revision,
    analysisVersion: target.analysisVersion,
    sourceHash: target.sourceHash,
  };
}

/** Find a persisted scene by server id, clientId, or (stringified) order. */
export function findPersistedScene(
  scenes: PersistedStoryboardScene[],
  sceneId: string,
): PersistedStoryboardScene | null {
  const needle = sceneId.trim();
  for (const scene of scenes) {
    if (scene.id === needle) return scene;
    if (scene.clientId === needle) return scene;
    if (String(scene.order) === needle) return scene;
  }
  return null;
}
