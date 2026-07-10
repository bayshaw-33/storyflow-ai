import { generateAtlasImages } from "./atlas";
import { generateFluxImages } from "./flux";
import { resolveArtProviderRoute } from "./router";
import type { ArtImageProviderResult, ArtImageRequest } from "./types";

export * from "./catalog";
export * from "./router";
export * from "./types";

export async function generateArtImages(input: ArtImageRequest, context: { atlasAuthorized: boolean; atlasApiKey?: string }): Promise<ArtImageProviderResult[]> {
  const route = resolveArtProviderRoute({
    selection: input.selection,
    task: input.task,
    atlasAuthorized: context.atlasAuthorized,
    modelId: input.modelId,
  });
  if (route.provider === "flux") return generateFluxImages(input, route.model);

  try {
    return await generateAtlasImages(input, route.model, context.atlasApiKey);
  } catch (error) {
    if (!route.allowFallback) throw error;
    const fallback = resolveArtProviderRoute({ selection: "flux", task: input.task, atlasAuthorized: false });
    return generateFluxImages({ ...input, selection: "flux", modelId: undefined }, fallback.model);
  }
}
