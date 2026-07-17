/**
 * C2PA writer — Phase-0 STUB.
 *
 * The real C2PA signing chain (claim generator + x.509 credential) is a
 * post-Phase-0 enhancement per PRD §2.2 fallback strategy: the compliant
 * Phase-0 baseline is metadata writers + canonical AI manifest + sha256
 * metadata hash + verification log. We deliberately do NOT fabricate C2PA
 * output here; verification reports surface status "not_configured".
 */

import type { AiManifest, MarkingRequest } from "./types.ts";

export interface C2paWriteResult {
  status: "not_configured" | "written";
  manifestId?: string;
}

export function writeC2paManifest(
  _inputBytes: Uint8Array,
  _manifest: AiManifest,
  _request: MarkingRequest,
): C2paWriteResult {
  return { status: "not_configured" };
}
