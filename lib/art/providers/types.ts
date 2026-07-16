import type { ArtCandidateCount, ArtProviderSelection } from "../types.ts";

export type ArtImageTask = "reference_sheet" | "variant" | "concept" | "edit";
export type ArtImageCapability = "text-to-image" | "image-edit" | "multi-reference";
export type ArtImageProvider = "atlas" | "flux";
export type AtlasModelProfile = "flux-text" | "gpt-text" | "seedream-text" | "seedream-edit" | "grok-edit" | "grok-text" | "gpt-edit" | "banana-text" | "banana-edit" | "banana-edit-lite" | "mai-text" | "mai-edit" | "wan-text" | "qwen-text" | "qwen-edit";

export type ArtModelDescriptor = {
  id: string;
  label: string;
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
