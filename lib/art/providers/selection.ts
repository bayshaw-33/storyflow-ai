import type { ArtModelDescriptor } from "./types.ts";

export function listCompatibleArtModels(models: ArtModelDescriptor[], referenceCount: number) {
  const capability = referenceCount > 0 ? "image-edit" : "text-to-image";
  return models.filter((model) => model.capabilities.includes(capability) && model.maxReferences >= referenceCount);
}

export function resolveCompatibleArtModelId(models: ArtModelDescriptor[], selectedId: string, referenceCount: number) {
  if (!selectedId) return "";
  const compatible = listCompatibleArtModels(models, referenceCount);
  if (compatible.some((model) => model.id === selectedId)) return selectedId;
  const selected = models.find((model) => model.id === selectedId);
  return selected ? compatible.find((model) => model.family === selected.family)?.id || "" : "";
}
