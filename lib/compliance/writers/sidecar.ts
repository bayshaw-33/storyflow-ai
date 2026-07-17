/**
 * Sidecar writer for text-like formats (txt/md/srt).
 *
 * The original file bytes are returned UNCHANGED; marking travels in a
 * separate `<name>.ai-manifest.json` sidecar containing the target file's
 * sha256 + byte length, the full AI manifest, and a structured
 * ai_disclosure block (per PRD). The API route packs both into a ZIP.
 */

import { sha256Hex, utf8Bytes, utf8Text } from "../manifest.ts";
import { composeVisibleDisclosure } from "../disclosure.ts";
import type { AiManifest, FormatVerifyResult, FormatWriteResult, MarkingRequest } from "../types.ts";

export function writeSidecar(inputBytes: Uint8Array, manifest: AiManifest, request: MarkingRequest): FormatWriteResult {
  const disclosure = composeVisibleDisclosure(manifest, request.visibleDisclosureMode, request.jurisdictionProfile);
  const sidecar = {
    schema_version: manifest.schema_version,
    target_file: {
      sha256: sha256Hex(inputBytes),
      byte_length: inputBytes.byteLength,
    },
    manifest,
    ai_disclosure: {
      ai_generated: manifest.ai_generated,
      ai_modified: manifest.ai_modified,
      jurisdiction_profile: manifest.jurisdiction_profile,
      provider_code: manifest.provider_code,
      content_id: manifest.content_id,
      model_provider: manifest.model_provider ?? null,
      model_name: manifest.model_name ?? null,
      disclosure_text: disclosure.payload ? `${disclosure.payload.headline}\n${disclosure.payload.body}` : "",
    },
  };
  return {
    outputBytes: inputBytes,
    sidecarBytes: utf8Bytes(JSON.stringify(sidecar, null, 2)),
    machineReadableFormats: ["sidecar-manifest"],
    extraVerification: { target_sha256: sidecar.target_file.sha256 },
  };
}

export function verifySidecar(outputBytes: Uint8Array, ctx: { sidecarBytes?: Uint8Array }): FormatVerifyResult {
  if (!ctx.sidecarBytes || ctx.sidecarBytes.byteLength === 0) {
    return { found: false, detail: "sidecar manifest missing" };
  }
  let sidecar: { target_file?: { sha256?: string; byte_length?: number }; manifest?: Record<string, unknown> };
  try {
    sidecar = JSON.parse(utf8Text(ctx.sidecarBytes)) as typeof sidecar;
  } catch {
    return { found: false, detail: "sidecar JSON parse failed" };
  }
  const expected = sidecar.target_file?.sha256;
  if (!expected || !sidecar.manifest) return { found: false, detail: "sidecar missing target_file or manifest" };
  const actual = sha256Hex(outputBytes);
  if (actual !== expected) {
    return { found: false, detail: `target sha256 mismatch: expected ${expected}, got ${actual}` };
  }
  return { found: true, extractedManifest: sidecar.manifest, detail: "sidecar-manifest; target sha256 match" };
}
