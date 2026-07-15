import type { ArtModelDescriptor } from "./types.ts";

export const ART_MODEL_CATALOG: ArtModelDescriptor[] = [
  {
    id: "flux-2-pro",
    label: "FLUX.2 Pro",
    provider: "flux",
    capabilities: ["text-to-image", "image-edit", "multi-reference"],
    recommendedFor: ["reference_sheet", "variant", "concept", "edit"],
    maxReferences: 8,
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
  },
  {
    id: "flux-2-max",
    label: "FLUX.2 Max",
    provider: "flux",
    capabilities: ["text-to-image", "image-edit", "multi-reference"],
    recommendedFor: ["reference_sheet", "concept", "edit"],
    maxReferences: 8,
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
  },
  {
    id: "black-forest-labs/flux-dev",
    label: "FLUX Dev",
    provider: "atlas",
    capabilities: ["text-to-image"],
    recommendedFor: ["reference_sheet", "concept"],
    maxReferences: 0,
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    atlasProfile: "flux-text",
  },
  {
    id: "openai/gpt-image-2/text-to-image",
    label: "GPT Image 2 · 文生图",
    provider: "atlas",
    capabilities: ["text-to-image"],
    recommendedFor: ["reference_sheet", "concept"],
    maxReferences: 0,
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    atlasProfile: "gpt-text",
  },
  {
    id: "bytedance/seedream-v5.0-lite",
    label: "Seedream v5.0 Lite",
    provider: "atlas",
    capabilities: ["text-to-image"],
    recommendedFor: ["reference_sheet", "concept"],
    maxReferences: 0,
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    atlasProfile: "seedream-text",
  },
  {
    id: "xai/grok-imagine-image/edit",
    label: "Grok Imagine · 图生图",
    provider: "atlas",
    capabilities: ["image-edit", "multi-reference"],
    recommendedFor: ["reference_sheet", "variant", "edit"],
    maxReferences: 3,
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    atlasProfile: "grok-edit",
  },
  {
    id: "openai/gpt-image-2/edit",
    label: "GPT Image 2 · 图生图",
    provider: "atlas",
    capabilities: ["image-edit", "multi-reference"],
    recommendedFor: ["reference_sheet", "variant", "edit"],
    maxReferences: 10,
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    atlasProfile: "gpt-edit",
  },
  {
    id: "google/nano-banana-pro/edit-ultra",
    label: "Nano Banana Pro Ultra · 高质量图生图",
    provider: "atlas",
    capabilities: ["image-edit", "multi-reference"],
    recommendedFor: ["reference_sheet", "variant", "edit"],
    maxReferences: 10,
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    atlasProfile: "banana-edit",
  },
];

export function findArtModel(modelId: string) {
  return ART_MODEL_CATALOG.find((model) => model.id === modelId) || null;
}

export function listArtModels(provider: "atlas" | "flux", capability: "text-to-image" | "image-edit") {
  return ART_MODEL_CATALOG.filter((model) => model.provider === provider && model.capabilities.includes(capability));
}

export function findDefaultArtModel(provider: "atlas" | "flux", capability: "text-to-image" | "image-edit") {
  const defaultId = provider === "atlas"
    ? capability === "image-edit" ? "openai/gpt-image-2/edit" : "black-forest-labs/flux-dev"
    : "flux-2-pro";
  return findArtModel(defaultId);
}
