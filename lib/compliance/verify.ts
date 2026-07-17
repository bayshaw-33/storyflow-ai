/**
 * Verification Runner.
 *
 * Re-reads the marked output through the per-format verifier, recomputes
 * the canonical metadata hash of the extracted manifest, and compares it
 * against the expected hash. A mismatch or missing manifest fails closed
 * (verified=false). C2PA is always reported as not_configured in Phase 0.
 */

import { computeMetadataHash } from "./manifest.ts";
import type {
  AiManifest,
  ContentKind,
  FormatVerifier,
  FormatWriteResult,
  FormatWriter,
  MarkingRequest,
} from "./types.ts";
import { verifyJpeg, writeJpeg } from "./writers/jpeg.ts";
import { verifyMp3, writeMp3 } from "./writers/mp3.ts";
import { verifyMp4, writeMp4 } from "./writers/mp4.ts";
import { verifyPdf, writePdf } from "./writers/pdf.ts";
import { verifyPng, writePng } from "./writers/png.ts";
import { verifySidecar, writeSidecar } from "./writers/sidecar.ts";
import { verifyWav, writeWav } from "./writers/wav.ts";
import { verifyWebp, writeWebp } from "./writers/webp.ts";

export type FormatKey = "png" | "jpeg" | "webp" | "mp4" | "wav" | "mp3" | "pdf" | "sidecar";

export interface FormatRegistryEntry {
  write: FormatWriter;
  verify: FormatVerifier;
  machineReadableFormats: string[];
}

export const FORMAT_REGISTRY: Record<FormatKey, FormatRegistryEntry> = {
  png: { write: writePng, verify: verifyPng, machineReadableFormats: ["png-itxt", "png-text"] },
  jpeg: { write: writeJpeg, verify: verifyJpeg, machineReadableFormats: ["jpeg-app1-xmp"] },
  webp: { write: writeWebp, verify: verifyWebp, machineReadableFormats: ["webp-riff-xmp"] },
  mp4: { write: writeMp4, verify: verifyMp4, machineReadableFormats: ["mp4-uuid-box"] },
  wav: { write: writeWav, verify: verifyWav, machineReadableFormats: ["wav-bwf-ixml", "riff-info"] },
  mp3: { write: writeMp3, verify: verifyMp3, machineReadableFormats: ["id3v2.4-txxx"] },
  pdf: { write: writePdf, verify: verifyPdf, machineReadableFormats: ["pdf-info-dict"] },
  sidecar: { write: writeSidecar, verify: verifySidecar, machineReadableFormats: ["sidecar-manifest"] },
};

export interface VerificationCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface VerificationReport {
  verified: boolean;
  format: string;
  machine_readable_formats: string[];
  extracted_manifest?: Record<string, unknown>;
  hash_match?: boolean;
  checks: VerificationCheck[];
  c2pa: { status: "not_configured" | "written" };
  verified_at: string;
  [key: string]: unknown;
}

export async function verifyMarking(
  contentKind: ContentKind,
  formatKey: FormatKey,
  outputBytes: Uint8Array,
  sidecarBytes: Uint8Array | undefined,
  expectedMetadataHash: string,
  _manifest: AiManifest,
): Promise<VerificationReport> {
  const entry = FORMAT_REGISTRY[formatKey];
  const checks: VerificationCheck[] = [];
  let found = false;
  let extractedManifest: Record<string, unknown> | undefined;
  let detail: string | undefined;

  try {
    const result = await entry.verify(outputBytes, { sidecarBytes });
    found = result.found;
    extractedManifest = result.extractedManifest;
    detail = result.detail;
  } catch (error) {
    detail = error instanceof Error ? error.message : String(error);
  }

  checks.push({ name: "format_marker_found", ok: found, detail });
  checks.push({ name: "manifest_extracted", ok: Boolean(extractedManifest) });

  let hashMatch = false;
  if (extractedManifest) {
    const extractedHash = computeMetadataHash(extractedManifest);
    hashMatch = extractedHash === expectedMetadataHash;
    checks.push({
      name: "metadata_hash_match",
      ok: hashMatch,
      detail: hashMatch ? expectedMetadataHash : `expected ${expectedMetadataHash}`,
    });
  } else {
    checks.push({ name: "metadata_hash_match", ok: false, detail: "no manifest extracted" });
  }

  checks.push({ name: "c2pa", ok: true, detail: "not_configured (Phase 0 baseline: metadata + manifest + hash)" });

  return {
    verified: found && Boolean(extractedManifest) && hashMatch,
    format: formatKey,
    content_kind: contentKind,
    machine_readable_formats: entry.machineReadableFormats,
    extracted_manifest: extractedManifest,
    hash_match: extractedManifest ? hashMatch : undefined,
    checks,
    c2pa: { status: "not_configured" },
    verified_at: new Date().toISOString(),
  };
}

export type { FormatWriteResult };
