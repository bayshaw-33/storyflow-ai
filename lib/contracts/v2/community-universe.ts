export type UniverseCommunityAccess = "public" | "owner";
export type UniverseCommunityObjectStatus = "canon" | "alternative" | "draft" | "deprecated";
export type UniverseCommunityVisibility = "public" | "owner";

export interface UniverseCommunityUniverse {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly description: string;
  readonly genre: string;
  readonly language: string;
  readonly targetMarkets: readonly string[];
  readonly tone: string;
  readonly tags: readonly string[];
  readonly status: string;
  readonly updatedAt: string;
  readonly publicationId: string | null;
}

export interface UniverseCommunityWork {
  readonly id: string;
  readonly projectId: string;
  readonly primaryWorkId: string | null;
  readonly publicationId: string | null;
  readonly title: string;
  readonly workType: string;
  readonly projectRole: string;
  readonly status: string;
  readonly updatedAt: string;
  readonly visibility: UniverseCommunityVisibility;
}

export interface UniverseCommunityEntity {
  readonly id: string;
  readonly kind: "character" | "location" | "organization" | "object" | "rule" | "concept";
  readonly name: string;
  readonly summary: string;
  readonly status: UniverseCommunityObjectStatus;
  readonly updatedAt: string;
  readonly visibility: UniverseCommunityVisibility;
}

export interface UniverseCommunityActor {
  readonly id: string;
  readonly entityId: string | null;
  readonly publicationId: string | null;
  readonly name: string;
  readonly status: string;
  readonly updatedAt: string;
  readonly visibility: UniverseCommunityVisibility;
}

export interface UniverseCommunityVoice {
  readonly id: string;
  readonly entityId: string | null;
  readonly actorId: string | null;
  readonly label: string;
  readonly language: string;
  readonly provider: string;
  readonly status: string;
  readonly updatedAt: string;
  readonly visibility: UniverseCommunityVisibility;
}

export interface UniverseCommunityAsset {
  readonly id: string;
  readonly entityId: string | null;
  readonly publicationId: string | null;
  readonly kind: string;
  readonly name: string;
  readonly summary: string;
  readonly status: string;
  readonly updatedAt: string;
  readonly visibility: UniverseCommunityVisibility;
}

export interface UniverseCommunityTimelineEvent {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly dateLabel: string;
  readonly status: UniverseCommunityObjectStatus;
  readonly updatedAt: string;
  readonly visibility: UniverseCommunityVisibility;
}

export interface UniverseCommunityVersion {
  readonly id: string;
  readonly versionNo: number;
  readonly contentHash: string;
  readonly createdAt: string;
}

export interface UniverseCommunityLocalOverlay {
  readonly id: string;
  readonly workId: string;
  readonly projectId: string | null;
  readonly entityType: string;
  readonly entityId: string;
  readonly revision: number;
  readonly status: string;
  readonly updatedAt: string;
}

export interface UniverseCommunityCandidate {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly confidence: number;
  readonly status: string;
  readonly updatedAt: string;
}

export interface UniverseCommunityData {
  readonly access: UniverseCommunityAccess;
  readonly isOwner: boolean;
  readonly universe: UniverseCommunityUniverse;
  readonly works: readonly UniverseCommunityWork[];
  readonly entities: readonly UniverseCommunityEntity[];
  readonly actors: readonly UniverseCommunityActor[];
  readonly voices: readonly UniverseCommunityVoice[];
  readonly assets: readonly UniverseCommunityAsset[];
  readonly timeline: readonly UniverseCommunityTimelineEvent[];
  readonly versions: readonly UniverseCommunityVersion[];
  readonly localOverlays: readonly UniverseCommunityLocalOverlay[];
  readonly candidates: readonly UniverseCommunityCandidate[];
  readonly degraded: boolean;
  readonly degradedSources: readonly string[];
}
