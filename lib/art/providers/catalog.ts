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
    id: "atlascloud/qwen-image/edit-plus",
    label: "Qwen Image Edit Plus",
    provider: "atlas",
    capabilities: ["image-edit", "multi-reference"],
    recommendedFor: ["reference_sheet", "variant", "edit"],
    maxReferences: 3,
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
  },
  {
    id: "google/imagen4",
    label: "Imagen 4",
    provider: "atlas",
    capabilities: ["text-to-image"],
    recommendedFor: ["concept"],
    maxReferences: 0,
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
  },
];

export function findArtModel(modelId: string) {
  return ART_MODEL_CATALOG.find((model) => model.id === modelId) || null;
}
