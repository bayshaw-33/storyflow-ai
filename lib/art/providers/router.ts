import { ART_MODEL_CATALOG, findArtModel, findDefaultArtModel } from "./catalog.ts";
import type { ArtImageTask, ArtProviderRoute } from "./types.ts";
import type { ArtProviderSelection } from "../types.ts";

export function resolveArtProviderRoute(input: {
  selection: ArtProviderSelection;
  task: ArtImageTask;
  atlasAuthorized: boolean;
  modelId?: string;
  hasReferences?: boolean;
}): ArtProviderRoute {
  const provider = input.atlasAuthorized && input.selection !== "flux" ? "atlas" : "flux";
  const capability = (input.hasReferences ?? ["edit", "variant"].includes(input.task)) ? "image-edit" : "text-to-image";
  const requested = input.modelId ? findArtModel(input.modelId) : null;
  if (input.modelId && !requested) throw new Error("ART_MODEL_NOT_FOUND");
  if (requested && requested.provider !== provider) throw new Error("ART_MODEL_PROVIDER_MISMATCH");
  if (requested && !requested.capabilities.includes(capability)) throw new Error("ART_MODEL_CAPABILITY_MISMATCH");

  const candidates = ART_MODEL_CATALOG.filter((model) =>
    model.provider === provider && model.capabilities.includes(capability) && model.recommendedFor.includes(input.task),
  );
  const model = requested || findDefaultArtModel(provider, capability) || candidates[0] || ART_MODEL_CATALOG.find((item) => item.provider === provider && item.capabilities.includes(capability));
  if (!model) throw new Error("ART_MODEL_NOT_AVAILABLE");

  return {
    provider,
    model,
    allowFallback: input.selection === "smart" && input.atlasAuthorized,
  };
}

export function isAtlasAuthorizedUser(user: { id: string; email: string }) {
  if (process.env.ART_ATLAS_ALLOW_ALL_AUTHENTICATED_USERS === "true") return true;

  const ids = new Set((process.env.ART_ATLAS_AUTHORIZED_USER_IDS || "").split(",").map((value) => value.trim()).filter(Boolean));
  const emails = new Set([
    process.env.ADMIN_EMAIL || "",
    ...(process.env.ART_ATLAS_AUTHORIZED_EMAILS || "").split(","),
  ].map((value) => value.trim().toLowerCase()).filter(Boolean));
  return ids.has(user.id) || emails.has(user.email.trim().toLowerCase());
}
