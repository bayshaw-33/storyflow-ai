/**
 * Storyboard asset persistence — PostgREST helpers over the EXISTING art
 * tables (storyflow_art_assets / storyflow_art_asset_variants /
 * storyflow_art_asset_versions). No new asset system, no new migrations.
 *
 * Task card: KIIKIS-P1-KIMI-002 §2
 *
 * Schema fitting (baseline.sql has no metadata column on art assets):
 *   - dedupe key (project + kind + normalized name) is stored in
 *     storyflow_art_assets.identity_anchor as "storyboard:<kind>:<name>";
 *   - contract kind "location" maps to art kind "scene" (the art table CHECK
 *     only allows character/scene/prop);
 *   - selectedVersionId maps to storyflow_art_asset_variants
 *     .approved_version_id on the asset's "master" variant;
 *   - versions carry metadata.storyboard = true plus appearance_summary and
 *     preview_url so prompts can single-source appearance later;
 *   - storyflow_art_assets.project_id is uuid NOT NULL while storyboard
 *     project ids are text — the owning storyflow_art_projects row
 *     (source_project_id = storyboard projectId) provides the uuid scope.
 *
 * ALL functions take an injected fetch (route wires serviceFetch, tests
 * wire fakes). Nothing here imports lib/supabase/*.
 *
 * ERASABLE SYNTAX ONLY (Node type-stripping).
 */

import type { ServiceFetchFn } from "../../compliance/log-writer.ts";
import type { StoryboardAssetKind } from "../contracts.ts";
import type { ApprovedVersionInfo } from "../prompts/index.ts";
import { storyboardAssetDedupeKey } from "./extract.ts";

export const STORYBOARD_ART_PROJECT_NAME = "Storyboard Assets";
export const STORYBOARD_VARIANT_NAME = "Storyboard Master";

/** Map contract kind → art-table kind ("location" → "scene"). */
export function toArtKind(kind: StoryboardAssetKind): "character" | "scene" | "prop" {
  return kind === "location" ? "scene" : kind;
}

export function storyboardIdentityAnchor(kind: StoryboardAssetKind, name: string): string {
  return `storyboard:${storyboardAssetDedupeKey(kind, name)}`;
}

type ArtProjectRow = { id: string };
type ArtAssetRow = { id: string; description?: string };
type ArtVariantRow = { id: string; asset_id?: string; approved_version_id?: string | null };
type ArtVersionRow = {
  id: string;
  variant_id?: string;
  storage_path: string;
  prompt?: string;
  metadata?: Record<string, unknown>;
};

/** Find-or-create the art project that scopes storyboard assets for a
 * storyboard (text) project id. */
export async function ensureStoryboardArtProject(
  fetchFn: ServiceFetchFn,
  input: { ownerId: string; sourceProjectId: string },
): Promise<string> {
  const existing = await fetchFn<ArtProjectRow[]>(
    `/rest/v1/storyflow_art_projects?source_project_id=eq.${encodeURIComponent(input.sourceProjectId)}&owner_id=eq.${encodeURIComponent(input.ownerId)}&name=eq.${encodeURIComponent(STORYBOARD_ART_PROJECT_NAME)}&select=id&limit=1`,
  );
  if (existing?.[0]?.id) return existing[0].id;

  const inserted = await fetchFn<ArtProjectRow[]>("/rest/v1/storyflow_art_projects", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      owner_id: input.ownerId,
      source_project_id: input.sourceProjectId,
      name: STORYBOARD_ART_PROJECT_NAME,
      visual_style: "",
      provider_selection: "smart",
      status: "active",
    }),
  });
  const id = inserted?.[0]?.id;
  if (!id) throw new Error("STORYBOARD_ART_PROJECT_CREATE_FAILED");
  return id;
}

/** Upsert a storyboard asset keyed by (artProject, kind, dedupeKey) and
 * guarantee a "master" variant exists for version attachment. */
export async function upsertStoryboardAsset(
  fetchFn: ServiceFetchFn,
  input: {
    ownerId: string;
    artProjectId: string;
    kind: StoryboardAssetKind;
    name: string;
    description: string;
    prompt: string;
    aliases?: string[];
  },
): Promise<{ assetId: string; variantId: string }> {
  const artKind = toArtKind(input.kind);
  const anchor = storyboardIdentityAnchor(input.kind, input.name);
  const now = new Date().toISOString();

  const found = await fetchFn<ArtAssetRow[]>(
    `/rest/v1/storyflow_art_assets?project_id=eq.${encodeURIComponent(input.artProjectId)}&kind=eq.${artKind}&identity_anchor=eq.${encodeURIComponent(anchor)}&select=id,description&limit=1`,
  );

  let assetId: string;
  if (found?.[0]?.id) {
    assetId = found[0].id;
    // Upsert semantics: enrich description only when the new one is richer.
    const nextDescription =
      input.description.trim().length > (found[0].description ?? "").trim().length
        ? input.description
        : (found[0].description ?? "");
    await fetchFn(
      `/rest/v1/storyflow_art_assets?id=eq.${encodeURIComponent(assetId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ description: nextDescription, updated_at: now }),
      },
    );
  } else {
    const inserted = await fetchFn<ArtAssetRow[]>("/rest/v1/storyflow_art_assets", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        project_id: input.artProjectId,
        kind: artKind,
        name: input.name.trim(),
        narrative_role: "storyboard",
        description: input.description,
        identity_anchor: anchor,
        status: "draft",
        created_by: input.ownerId,
      }),
    });
    assetId = inserted?.[0]?.id ?? "";
    if (!assetId) throw new Error("STORYBOARD_ASSET_CREATE_FAILED");
  }

  const variant = await fetchFn<ArtVariantRow[]>(
    `/rest/v1/storyflow_art_asset_variants?asset_id=eq.${encodeURIComponent(assetId)}&variant_type=eq.master&select=id&limit=1`,
  );
  if (variant?.[0]?.id) return { assetId, variantId: variant[0].id };

  const insertedVariant = await fetchFn<ArtVariantRow[]>("/rest/v1/storyflow_art_asset_variants", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      asset_id: assetId,
      name: STORYBOARD_VARIANT_NAME,
      variant_type: "master",
      prompt: input.prompt,
      negative_prompt: "",
      created_by: input.ownerId,
    }),
  });
  const variantId = insertedVariant?.[0]?.id ?? "";
  if (!variantId) throw new Error("STORYBOARD_VARIANT_CREATE_FAILED");
  return { assetId, variantId };
}

export type NewAssetVersion = {
  storagePath: string;
  provider?: string;
  model?: string;
  providerTaskId?: string;
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  appearanceSummary?: string;
  previewUrl?: string;
};

/** Insert generated image versions under an asset variant. */
export async function insertAssetVersions(
  fetchFn: ServiceFetchFn,
  input: {
    variantId: string;
    createdBy: string;
    versions: NewAssetVersion[];
  },
): Promise<Array<{ versionId: string; storagePath: string }>> {
  if (input.versions.length === 0) return [];
  const rows = input.versions.map((version) => ({
    variant_id: input.variantId,
    storage_path: version.storagePath,
    source: "generated",
    provider: version.provider ?? null,
    model: version.model ?? null,
    provider_task_id: version.providerTaskId ?? null,
    prompt: version.prompt,
    negative_prompt: version.negativePrompt ?? "",
    width: version.width ?? null,
    height: version.height ?? null,
    metadata: {
      storyboard: true,
      appearance_summary: version.appearanceSummary ?? "",
      preview_url: version.previewUrl ?? "",
    },
    created_by: input.createdBy,
  }));
  const inserted = await fetchFn<Array<{ id: string; storage_path: string }>>(
    "/rest/v1/storyflow_art_asset_versions",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(rows),
    },
  );
  return (inserted ?? []).map((row) => ({ versionId: row.id, storagePath: row.storage_path }));
}

/** Mark a version as the selected/approved one for an asset.
 * Mapping: StoryboardAssetUsage.selectedVersionId ↔
 * storyflow_art_asset_variants.approved_version_id (master variant). */
export async function markVersionSelected(
  fetchFn: ServiceFetchFn,
  input: { assetId: string; versionId: string },
): Promise<void> {
  const version = await fetchFn<ArtVersionRow[]>(
    `/rest/v1/storyflow_art_asset_versions?id=eq.${encodeURIComponent(input.versionId)}&select=id,variant_id&limit=1`,
  );
  const variantId = version?.[0]?.variant_id;
  if (!variantId) throw new Error("VERSION_NOT_FOUND");

  const variant = await fetchFn<ArtVariantRow[]>(
    `/rest/v1/storyflow_art_asset_variants?id=eq.${encodeURIComponent(variantId)}&select=id,asset_id&limit=1`,
  );
  if (!variant?.[0]?.id || variant[0].asset_id !== input.assetId) {
    throw new Error("VERSION_NOT_FOUND");
  }

  await fetchFn(
    `/rest/v1/storyflow_art_asset_variants?id=eq.${encodeURIComponent(variantId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        approved_version_id: input.versionId,
        updated_at: new Date().toISOString(),
      }),
    },
  );
}

/**
 * Load the approved-version view for a set of assets.
 * appearanceSummary is SINGLE-SOURCE: approved version's appearance summary
 * (metadata.appearance_summary, falling back to the version prompt) when a
 * version is selected; otherwise the asset description. Assets without an
 * approved version get versionId null and contribute nothing to
 * referenceVersionIds downstream.
 */
export async function loadApprovedVersions(
  fetchFn: ServiceFetchFn,
  assetIds: string[],
): Promise<Map<string, ApprovedVersionInfo>> {
  const result = new Map<string, ApprovedVersionInfo>();
  const uniqueIds = [...new Set(assetIds)].filter((id) => id.trim().length > 0);
  if (uniqueIds.length === 0) return result;

  const inList = uniqueIds.map(encodeURIComponent).join(",");
  const assets = await fetchFn<Array<{ id: string; name: string; description: string }>>(
    `/rest/v1/storyflow_art_assets?id=in.(${inList})&select=id,name,description`,
  );
  if (!Array.isArray(assets) || assets.length === 0) return result;

  const variants = await fetchFn<ArtVariantRow[]>(
    `/rest/v1/storyflow_art_asset_variants?asset_id=in.(${assets.map((a) => encodeURIComponent(a.id)).join(",")})&select=id,asset_id,approved_version_id`,
  );
  const approvedVersionIds = (variants ?? [])
    .map((variant) => variant.approved_version_id)
    .filter((id): id is string => Boolean(id));

  const versionById = new Map<string, ArtVersionRow>();
  if (approvedVersionIds.length > 0) {
    const versions = await fetchFn<ArtVersionRow[]>(
      `/rest/v1/storyflow_art_asset_versions?id=in.(${approvedVersionIds.map(encodeURIComponent).join(",")})&select=id,storage_path,prompt,metadata`,
    );
    for (const version of versions ?? []) versionById.set(version.id, version);
  }

  const approvedByAssetId = new Map<string, string>();
  for (const variant of variants ?? []) {
    if (variant.asset_id && variant.approved_version_id) {
      approvedByAssetId.set(variant.asset_id, variant.approved_version_id);
    }
  }

  for (const asset of assets) {
    const approvedId = approvedByAssetId.get(asset.id) ?? null;
    const version = approvedId ? versionById.get(approvedId) : undefined;
    const metadata = (version?.metadata ?? {}) as Record<string, unknown>;
    const appearanceSummary =
      (typeof metadata.appearance_summary === "string" && metadata.appearance_summary.trim()) ||
      (version?.prompt?.trim() ?? "") ||
      asset.description ||
      "";
    result.set(asset.id, {
      assetId: asset.id,
      name: asset.name,
      description: asset.description ?? "",
      versionId: version ? approvedId : null,
      storagePath: version?.storage_path ?? null,
      previewUrl:
        (typeof metadata.preview_url === "string" && metadata.preview_url.trim()) || null,
      appearanceSummary,
    });
  }
  return result;
}
