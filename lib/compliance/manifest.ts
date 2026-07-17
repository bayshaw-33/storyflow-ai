/**
 * Canonical AI manifest (schema kiikis.ai-manifest/0.1) + hashing helpers.
 * The manifest is the single payload embedded by every Phase-0 writer;
 * its sha256 over canonical JSON is the metadata hash stored in
 * storyflow_ai_label_records.metadata_hash.
 */

import { createHash } from "node:crypto";

import type { AiManifest, ComplianceExtra, MarkingRequest } from "./types.ts";

export const AI_MANIFEST_SCHEMA_VERSION = "kiikis.ai-manifest/0.1";
export const AI_MANIFEST_PLATFORM = "KIIKIS";

export function buildAiManifest(request: MarkingRequest, extra?: ComplianceExtra): AiManifest {
  const manifest: AiManifest = {
    schema_version: AI_MANIFEST_SCHEMA_VERSION,
    platform: AI_MANIFEST_PLATFORM,
    content_kind: request.contentKind,
    ai_generated: request.aiGenerated,
    ai_modified: request.aiModified,
    jurisdiction_profile: request.jurisdictionProfile,
    provider_code: request.providerCode,
    content_id: request.contentId,
    created_at: extra?.createdAt ?? new Date().toISOString(),
    visible_disclosure_mode: request.visibleDisclosureMode,
  };
  if (request.modelProvider) manifest.model_provider = request.modelProvider;
  if (request.modelName) manifest.model_name = request.modelName;
  if (request.modelVersion) manifest.model_version = request.modelVersion;
  if (request.contentKind === "audio") {
    if (extra?.syntheticVoice !== undefined) manifest.synthetic_voice = extra.syntheticVoice;
  }
  return manifest;
}

function sortRecursively(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortRecursively);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const item = source[key];
      if (item !== undefined) sorted[key] = sortRecursively(item);
    }
    return sorted;
  }
  return value;
}

/** JSON with recursively sorted keys and no whitespace — stable across key order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortRecursively(value));
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Stable public identity derived only from server-observed source bytes. */
export function serverContentId(bytes: Uint8Array): string {
  return `cid_${sha256Hex(bytes)}`;
}

/** sha256 hex of canonicalJson(manifest). */
export function computeMetadataHash(manifest: unknown): string {
  return sha256Hex(new TextEncoder().encode(canonicalJson(manifest)));
}

export function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function utf8Text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}
