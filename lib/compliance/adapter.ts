/**
 * ComplianceMarkingAdapter — full Phase-0 pipeline orchestration.
 *
 * Layer separation (kept visible on purpose):
 *   [C2PA Writer]                 → stub, always "not_configured" in Phase 0
 *   [Metadata Writer]             → per-format byte writers (FORMAT_REGISTRY)
 *   [Visible Disclosure Composer] → disclosure.ts templates
 *   [Verification Runner]         → verify.ts re-read + hash comparison
 *   [Compliance Log Writer]       → sink writes inside gate.ts
 *
 * The Export Gate (gate.ts) owns ordering/blocking; this module wires the
 * concrete writer/verifier into the gate's apply_marking callback.
 */

import { writeC2paManifest } from "./c2pa.ts";
import { composeVisibleDisclosure } from "./disclosure.ts";
import type { DisclosureResult } from "./disclosure.ts";
import { runExportGate } from "./gate.ts";
import type { GateEvaluation } from "./gate.ts";
import type { ComplianceLogSink } from "./log-writer.ts";
import { buildAiManifest, computeMetadataHash } from "./manifest.ts";
import { FORMAT_REGISTRY, verifyMarking } from "./verify.ts";
import type { FormatKey } from "./verify.ts";
import type { ComplianceExtra, ContentKind, MarkingRequest, MarkingResult } from "./types.ts";

const EXTENSION_TO_FORMAT: Record<string, FormatKey> = {
  png: "png",
  jpg: "jpeg",
  jpeg: "jpeg",
  webp: "webp",
  mp4: "mp4",
  mov: "mp4",
  wav: "wav",
  mp3: "mp3",
  pdf: "pdf",
  txt: "sidecar",
  md: "sidecar",
  srt: "sidecar",
};

const FORMAT_TO_CONTENT_KIND: Record<FormatKey, ContentKind> = {
  png: "image",
  jpeg: "image",
  webp: "image",
  mp4: "video",
  wav: "audio",
  mp3: "audio",
  pdf: "document",
  sidecar: "text",
};

export function fileExtension(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  return dot < 0 ? "" : base.slice(dot + 1).toLowerCase();
}

/** Extension → format key; undefined means the gate blocks with unsupported_format. */
export function resolveFormatKey(fileName: string): FormatKey | undefined {
  return EXTENSION_TO_FORMAT[fileExtension(fileName)];
}

export function contentKindForFormat(formatKey: FormatKey): ContentKind {
  return FORMAT_TO_CONTENT_KIND[formatKey];
}

export interface AdapterRequest extends MarkingRequest {
  inputBytes: Uint8Array;
  extra?: ComplianceExtra;
}

export interface AdapterDeps {
  sink: ComplianceLogSink;
  env?: NodeJS.ProcessEnv;
  ownerId?: string;
  exportId?: string;
}

export interface AdapterOutput {
  bytes: Uint8Array;
  sidecarBytes?: Uint8Array;
  fileName: string;
}

export interface AdapterResult {
  gate: GateEvaluation;
  marking?: MarkingResult;
  output?: AdapterOutput;
  disclosure?: DisclosureResult;
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export async function runComplianceMarking(request: AdapterRequest, deps: AdapterDeps): Promise<AdapterResult> {
  const { inputBytes, extra, ...markingRequest } = request;
  const formatKey = resolveFormatKey(markingRequest.inputPath);
  const manifest = buildAiManifest(markingRequest, extra);
  const metadataHash = computeMetadataHash(manifest);

  let written: { outputBytes: Uint8Array; sidecarBytes?: Uint8Array; machineReadableFormats: string[] } | undefined;

  // --- C2PA Writer (Phase 0 stub: always "not_configured"; real signer post-Phase-0) ---
  const c2pa = writeC2paManifest(inputBytes, manifest, markingRequest);

  const performMarking = async () => {
    if (!formatKey) throw new Error(`UNSUPPORTED_FORMAT: ${markingRequest.inputPath}`);
    const entry = FORMAT_REGISTRY[formatKey];
    // --- Metadata Writer ---
    const writeResult = await entry.write(inputBytes, manifest, markingRequest);
    written = {
      outputBytes: writeResult.outputBytes,
      sidecarBytes: writeResult.sidecarBytes,
      machineReadableFormats: writeResult.machineReadableFormats,
    };
    // --- Verification Runner ---
    const verificationReport = await verifyMarking(
      manifest.content_kind,
      formatKey,
      writeResult.outputBytes,
      writeResult.sidecarBytes,
      metadataHash,
      manifest,
    );
    return {
      machineReadableFormats: writeResult.machineReadableFormats,
      metadataHash,
      verificationReport: verificationReport as Record<string, unknown>,
      verified: verificationReport.verified === true,
      c2paManifestId: c2pa.manifestId,
    };
  };

  // --- Export Gate (blocking order + Compliance Log Writer sink writes) ---
  const gate = await runExportGate(
    { request: markingRequest, extra, formatKey, manifest, performMarking },
    { sink: deps.sink, env: deps.env, ownerId: deps.ownerId, exportId: deps.exportId },
  );

  // --- Visible Disclosure Composer ---
  const disclosure = composeVisibleDisclosure(manifest, markingRequest.visibleDisclosureMode, manifest.jurisdiction_profile);

  const errors: string[] = [];
  if (gate.decision !== "allowed" && gate.blockingCode) errors.push(gate.blockingCode);

  const marking: MarkingResult = {
    success: gate.decision === "allowed" && Boolean(gate.marking?.verified ?? gate.markingSkipped),
    machineReadableFormats: gate.marking?.machineReadableFormats ?? [],
    visibleDisclosureApplied: disclosure.applied,
    c2paManifestId: gate.marking?.c2paManifestId,
    metadataHash,
    verificationReport: gate.marking?.verificationReport ?? {},
    errors,
  };

  const result: AdapterResult = { gate, marking, disclosure };
  if (gate.decision === "allowed") {
    result.output = {
      bytes: written?.outputBytes ?? inputBytes,
      sidecarBytes: written?.sidecarBytes,
      fileName: baseName(markingRequest.outputPath || markingRequest.inputPath),
    };
  }
  return result;
}
