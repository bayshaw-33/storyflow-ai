/**
 * JPEG metadata writer (dependency-free byte manipulation).
 *
 * Inserts one APP1 XMP segment after SOI and the initial run of leading
 * APPn (APP0/APP1/APP2…) segments. Payload = XMP namespace header +
 * minimal RDF packet using xmlns:kiikis with one element per manifest
 * field plus a <kiikis:manifest_json> element carrying the full canonical
 * JSON for exact round-trip verification. Throws JPEG_MARKING_FAILED on
 * corrupt input (fail-closed).
 */

import { canonicalJson, concatBytes, utf8Bytes, utf8Text } from "../manifest.ts";
import type { AiManifest, FormatVerifyResult, FormatWriteResult, MarkingRequest } from "../types.ts";

export const XMP_NAMESPACE_HEADER = "http://ns.adobe.com/xap/1.0/\0";
export const KIIKIS_XMP_NS = "https://kiikis.ai/ns/ai-manifest/0.1/";

const XMP_FIELD_KEYS = [
  "schema_version",
  "platform",
  "content_kind",
  "ai_generated",
  "ai_modified",
  "jurisdiction_profile",
  "provider_code",
  "content_id",
  "model_provider",
  "model_name",
  "model_version",
  "created_at",
  "visible_disclosure_mode",
  "synthetic_voice",
] as const;

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Minimal RDF packet; shared by the JPEG (APP1) and WebP (XMP chunk) writers. */
export function buildXmpPacket(manifest: AiManifest): string {
  const source = manifest as unknown as Record<string, unknown>;
  const elements: string[] = [];
  for (const key of XMP_FIELD_KEYS) {
    const value = source[key];
    if (value === undefined) continue;
    elements.push(`    <kiikis:${key}>${escapeXml(String(value))}</kiikis:${key}>`);
  }
  elements.push(`    <kiikis:manifest_json>${escapeXml(canonicalJson(manifest))}</kiikis:manifest_json>`);
  return [
    `<x:xmpmeta xmlns:x="adobe:ns:meta/">`,
    ` <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">`,
    `  <rdf:Description rdf:about="" xmlns:kiikis="${KIIKIS_XMP_NS}">`,
    ...elements,
    `  </rdf:Description>`,
    ` </rdf:RDF>`,
    `</x:xmpmeta>`,
  ].join("\n");
}

/** Extract the embedded canonical JSON manifest from our own XMP output. */
export function extractManifestFromXmp(xmp: string): Record<string, unknown> | undefined {
  const match = xmp.match(/<kiikis:manifest_json>([\s\S]*?)<\/kiikis:manifest_json>/);
  if (!match) return undefined;
  try {
    return JSON.parse(unescapeXml(match[1])) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function isAppMarker(marker: number): boolean {
  return marker >= 0xe0 && marker <= 0xef;
}

function isStandaloneMarker(marker: number): boolean {
  // SOI, EOI, RSTn, TEM carry no length field
  return marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}

export function writeJpeg(inputBytes: Uint8Array, manifest: AiManifest, _request: MarkingRequest): FormatWriteResult {
  try {
    if (inputBytes.byteLength < 4 || inputBytes[0] !== 0xff || inputBytes[1] !== 0xd8) {
      throw new Error("JPEG_MARKING_FAILED: missing SOI marker");
    }
    // Skip the initial run of leading APPn segments (APP0/APP1/APP2…).
    let insertOffset = 2;
    while (insertOffset + 4 <= inputBytes.byteLength) {
      if (inputBytes[insertOffset] !== 0xff || !isAppMarker(inputBytes[insertOffset + 1])) break;
      const segmentLength = (inputBytes[insertOffset + 2] << 8) | inputBytes[insertOffset + 3];
      if (segmentLength < 2 || insertOffset + 2 + segmentLength > inputBytes.byteLength) {
        throw new Error("JPEG_MARKING_FAILED: truncated APPn segment");
      }
      insertOffset += 2 + segmentLength;
    }
    const payload = concatBytes([utf8Bytes(XMP_NAMESPACE_HEADER), utf8Bytes(buildXmpPacket(manifest))]);
    if (payload.byteLength + 2 > 0xffff) {
      throw new Error("JPEG_MARKING_FAILED: XMP payload exceeds APP1 size limit");
    }
    const segment = concatBytes([
      new Uint8Array([0xff, 0xe1, ((payload.byteLength + 2) >>> 8) & 0xff, (payload.byteLength + 2) & 0xff]),
      payload,
    ]);
    const outputBytes = concatBytes([inputBytes.subarray(0, insertOffset), segment, inputBytes.subarray(insertOffset)]);
    return {
      outputBytes,
      machineReadableFormats: ["jpeg-app1-xmp"],
      extraVerification: { inserted_at: insertOffset },
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("JPEG_MARKING_FAILED")) throw error;
    throw new Error(`JPEG_MARKING_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function verifyJpeg(outputBytes: Uint8Array): FormatVerifyResult {
  if (outputBytes.byteLength < 4 || outputBytes[0] !== 0xff || outputBytes[1] !== 0xd8) {
    return { found: false, detail: "missing SOI marker" };
  }
  let offset = 2;
  while (offset + 4 <= outputBytes.byteLength) {
    if (outputBytes[offset] !== 0xff) return { found: false, detail: `marker expected at ${offset}` };
    const marker = outputBytes[offset + 1];
    if (marker === 0xda) break; // SOS: image data begins
    if (isStandaloneMarker(marker)) {
      offset += 2;
      continue;
    }
    const segmentLength = (outputBytes[offset + 2] << 8) | outputBytes[offset + 3];
    if (segmentLength < 2 || offset + 2 + segmentLength > outputBytes.byteLength) {
      return { found: false, detail: "truncated segment" };
    }
    if (marker === 0xe1) {
      const payload = outputBytes.subarray(offset + 4, offset + 2 + segmentLength);
      const header = utf8Bytes(XMP_NAMESPACE_HEADER);
      const matchesHeader = header.every((b, i) => payload[i] === b);
      if (matchesHeader) {
        const xmp = utf8Text(payload.subarray(header.byteLength));
        const extractedManifest = extractManifestFromXmp(xmp);
        if (extractedManifest) {
          return { found: true, extractedManifest, detail: "app1-xmp-kiikis" };
        }
      }
    }
    offset += 2 + segmentLength;
  }
  return { found: false, detail: "kiikis XMP APP1 segment not found" };
}
