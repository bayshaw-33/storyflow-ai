export type ArtAssetKind = "character" | "scene" | "prop";
export type ArtAssetStatus = "draft" | "generating" | "candidate" | "approved" | "published" | "archived" | "error";
export type ArtVariantType = "master" | "appearance" | "state";
export type ArtProviderSelection = "smart" | "atlas" | "flux";
export type ArtCandidateCount = 1 | 2 | 4;

export type ArtProject = {
  id: string;
  ownerId: string;
  teamId?: string | null;
  universeId?: string | null;
  sourceProjectId?: string | null;
  name: string;
  visualStyle: string;
  providerSelection: ArtProviderSelection;
  createdAt: string;
  updatedAt: string;
};

export type ArtAsset = {
  id: string;
  projectId: string;
  kind: ArtAssetKind;
  name: string;
  narrativeRole: string;
  description: string;
  identityAnchor: string;
  masterVariantId?: string | null;
  status: ArtAssetStatus;
  actorId?: string | null;
  universeEntityId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ArtAssetVariant = {
  id: string;
  assetId: string;
  name: string;
  variantType: ArtVariantType;
  prompt: string;
  negativePrompt: string;
  approvedVersionId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ArtAssetVersion = {
  id: string;
  variantId: string;
  storagePath: string;
  previewUrl?: string;
  source: "generated" | "uploaded";
  provider?: string;
  model?: string;
  providerTaskId?: string;
  prompt: string;
  negativePrompt: string;
  seed?: number;
  width?: number;
  height?: number;
  createdBy: string;
  createdAt: string;
};

export type ArtChatMessage = {
  id: string;
  projectId: string;
  userId: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments: Array<{ id: string; name: string; kind: "source" | "image"; storagePath: string }>;
  createdAt: string;
};

export type ArtAction =
  | { type: "create_asset"; kind: ArtAssetKind; name: string; narrativeRole: string; description: string }
  | { type: "create_variant"; assetId: string; name: string; description: string }
  | { type: "update_asset"; assetId: string; patch: Partial<Pick<ArtAsset, "name" | "narrativeRole" | "description" | "identityAnchor">> }
  | { type: "attach_upload"; assetId?: string; uploadId: string; purpose: "master" | "candidate" | "reference" }
  | { type: "request_confirmation"; reason: string; pendingAction: Record<string, unknown> };

export type ArtGenerationJob = {
  id: string;
  projectId: string;
  assetId: string;
  variantId: string;
  provider: string;
  model: string;
  status: "queued" | "running" | "completed" | "failed" | "persist_failed";
  requestedCount: ArtCandidateCount;
  prompt: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
};
