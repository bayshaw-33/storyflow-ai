import type { ArtAssetKind, ArtAssetStatus, ArtCandidateCount, ArtProject } from "./types.ts";

const STATUS_TRANSITIONS: Record<ArtAssetStatus, ReadonlySet<ArtAssetStatus>> = {
  draft: new Set(["generating", "candidate", "archived", "error"]),
  generating: new Set(["candidate", "error"]),
  candidate: new Set(["generating", "approved", "archived", "error"]),
  approved: new Set(["generating", "published", "archived"]),
  published: new Set(["archived"]),
  archived: new Set([]),
  error: new Set(["draft", "generating", "archived"]),
};

export function createEmptyArtProject(input: {
  id: string;
  name: string;
  ownerId: string;
  universeId?: string | null;
  teamId?: string | null;
}): ArtProject {
  const now = new Date().toISOString();
  return {
    id: input.id,
    ownerId: input.ownerId,
    teamId: input.teamId || null,
    universeId: input.universeId || null,
    sourceProjectId: null,
    name: input.name.trim() || "未命名美术项目",
    visualStyle: "cinematic short drama, consistent production design",
    providerSelection: "smart",
    createdAt: now,
    updatedAt: now,
  };
}

export function groupAssetsByKind<T extends { kind: ArtAssetKind }>(assets: T[]) {
  const grouped: Record<ArtAssetKind, T[]> = { character: [], scene: [], prop: [] };
  for (const asset of assets) grouped[asset.kind].push(asset);
  return grouped;
}

export function canTransitionArtStatus(from: ArtAssetStatus, to: ArtAssetStatus) {
  return from === to || STATUS_TRANSITIONS[from].has(to);
}

export function normalizeCandidateCount(value: unknown): ArtCandidateCount {
  return value === 2 || value === 4 ? value : 1;
}
