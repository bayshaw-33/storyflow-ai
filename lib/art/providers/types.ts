import type { ArtCandidateCount, ArtProviderSelection } from "../types.ts";

export type ArtImageTask = "reference_sheet" | "variant" | "concept" | "edit";
export type ArtImageCapability = "text-to-image" | "image-edit" | "multi-reference";
export type ArtImageProvider = "atlas" | "flux";
export type AtlasModelProfile = "flux2-flex-text" | "flux2-flex-edit" | "gpt25-text" | "gpt25-edit" | "gpt-text" | "gpt-edit" | "seedream-text" | "seedream-edit" | "grok-edit" | "grok-text" | "banana21-text" | "banana21-edit" | "banana-ultra-text" | "banana-edit" | "hidream-text" | "hidream-edit" | "reve-text" | "reve-edit" | "reve-remix";

export type ArtModelDescriptor = {
  id: string;
  label: string;
  family: string;
  provider: ArtImageProvider;
  capabilities: ArtImageCapability[];
  recommendedFor: ArtImageTask[];
  maxReferences: number;
  aspectRatios: string[];
  atlasProfile?: AtlasModelProfile;
};

export type ArtImageRequest = {
  task: ArtImageTask;
  prompt: string;
  negativePrompt?: string;
  referenceUrls: string[];
  aspectRatio: "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
  count: ArtCandidateCount;
  seed?: number;
  selection: ArtProviderSelection;
  modelId?: string;
};

export type ArtProviderRoute = {
  provider: ArtImageProvider;
  model: ArtModelDescriptor;
  allowFallback: boolean;
};

export type ArtImageProviderResult = {
  imageUrl: string;
  provider: ArtImageProvider;
  model: string;
  providerTaskId: string;
  seed?: number;
};
