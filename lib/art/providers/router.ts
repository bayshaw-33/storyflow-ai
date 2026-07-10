import { ART_MODEL_CATALOG, findArtModel } from "./catalog.ts";
import type { ArtImageTask, ArtProviderRoute } from "./types.ts";
import type { ArtProviderSelection } from "../types.ts";

export function resolveArtProviderRoute(input: {
  selection: ArtProviderSelection;
  task: ArtImageTask;
  atlasAuthorized: boolean;
  modelId?: string;
}): ArtProviderRoute {
  const provider = input.atlasAuthorized && input.selection !== "flux" ? "atlas" : "flux";
  const requested = input.modelId ? findArtModel(input.modelId) : null;
  if (input.modelId && !requested) throw new Error("ART_MODEL_NOT_FOUND");
  if (requested && requested.provider !== provider) throw new Error("ART_MODEL_PROVIDER_MISMATCH");

  const candidates = ART_MODEL_CATALOG.filter((model) =>
    model.provider === provider && model.recommendedFor.includes(input.task),
  );
  const model = requested || candidates.find((item) =>
    input.task === "reference_sheet" ? item.capabilities.includes("multi-reference") : true,
  ) || ART_MODEL_CATALOG.find((item) => item.provider === provider);
  if (!model) throw new Error("ART_MODEL_NOT_AVAILABLE");

  return {
    provider,
    model,
    allowFallback: input.selection === "smart" && input.atlasAuthorized,
  };
}

export function isAtlasAuthorizedUser(user: { id: string; email: string }) {
  const ids = new Set((process.env.ART_ATLAS_AUTHORIZED_USER_IDS || "").split(",").map((value) => value.trim()).filter(Boolean));
  const emails = new Set([
    process.env.ADMIN_EMAIL || "",
    ...(process.env.ART_ATLAS_AUTHORIZED_EMAILS || "").split(","),
  ].map((value) => value.trim().toLowerCase()).filter(Boolean));
  return ids.has(user.id) || emails.has(user.email.trim().toLowerCase());
}
