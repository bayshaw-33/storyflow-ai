/**
 * MP3 metadata writer (ID3v2.4, dependency-free).
 *
 * Writes a fresh ID3v2.4 tag at the start of the file after stripping any
 * existing ID3v2 tag (so re-marking is idempotent). ID3v1 128-byte tails
 * are left untouched. Frames: TXXX "kiikis:ai-manifest" (UTF-8 canonical
 * JSON) and TXXX "ai_generated" ("true"/"false"). Frame and tag sizes are
 * syncsafe per v2.4. Throws MP3_MARKING_FAILED on corrupt input.
 */

import { canonicalJson, concatBytes, utf8Bytes, utf8Text } from "../manifest.ts";
import type { AiManifest, FormatVerifyResult, FormatWriteResult, MarkingRequest } from "../types.ts";

const MANIFEST_DESCRIPTION = "kiikis:ai-manifest";
const AI_GENERATED_DESCRIPTION = "ai_generated";

function toSyncsafe(value: number): Uint8Array {
  return new Uint8Array([(value >>> 21) & 0x7f, (value >>> 14) & 0x7f, (value >>> 7) & 0x7f, value & 0x7f]);
}

function fromSyncsafe(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] & 0x7f) << 21) | ((bytes[offset + 1] & 0x7f) << 14) | ((bytes[offset + 2] & 0x7f) << 7) | (bytes[offset + 3] & 0x7f);
}

function asciiBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 0x7f;
  return out;
}

function hasId3v2Header(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 10 &&
    bytes[0] === 0x49 && // I
    bytes[1] === 0x44 && // D
    bytes[2] === 0x33 && // 3
    bytes[3] !== 0xff &&
    bytes[4] !== 0xff
  );
}

/** Strip any existing ID3v2 tag; returns the remaining (audio) bytes. */
export function stripId3v2(bytes: Uint8Array): Uint8Array {
  if (!hasId3v2Header(bytes)) return bytes;
  const tagSize = fromSyncsafe(bytes, 6);
  const hasFooter = (bytes[5] & 0x10) !== 0;
  const total = 10 + tagSize + (hasFooter ? 10 : 0);
  if (total > bytes.byteLength) return new Uint8Array(0);
  return bytes.subarray(total);
}

function buildTxxxFrame(description: string, value: string): Uint8Array {
  // encoding 0x03 = UTF-8 (v2.4), description, NUL terminator, value
  const body = concatBytes([new Uint8Array([0x03]), utf8Bytes(description), new Uint8Array([0x00]), utf8Bytes(value)]);
  return concatBytes([asciiBytes("TXXX"), toSyncsafe(body.byteLength), new Uint8Array([0x00, 0x00]), body]);
}

export function writeMp3(inputBytes: Uint8Array, manifest: AiManifest, _request: MarkingRequest): FormatWriteResult {
  try {
    const audioBytes = stripId3v2(inputBytes);
    if (audioBytes.byteLength === 0 && inputBytes.byteLength > 0) {
      throw new Error("MP3_MARKING_FAILED: file contains only a malformed ID3v2 tag");
    }
    const frames = concatBytes([
      buildTxxxFrame(MANIFEST_DESCRIPTION, canonicalJson(manifest)),
      buildTxxxFrame(AI_GENERATED_DESCRIPTION, manifest.ai_generated ? "true" : "false"),
    ]);
    // "ID3" + version 04 00 + flags 00 + syncsafe tag size
    const header = concatBytes([asciiBytes("ID3"), new Uint8Array([0x04, 0x00, 0x00]), toSyncsafe(frames.byteLength)]);
    const outputBytes = concatBytes([header, frames, audioBytes]);
    return {
      outputBytes,
      machineReadableFormats: ["id3v2.4-txxx"],
      extraVerification: { tag_bytes: 10 + frames.byteLength },
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("MP3_MARKING_FAILED")) throw error;
    throw new Error(`MP3_MARKING_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function verifyMp3(outputBytes: Uint8Array): FormatVerifyResult {
  if (!hasId3v2Header(outputBytes)) return { found: false, detail: "ID3v2 header not found" };
  const majorVersion = outputBytes[3];
  if (majorVersion !== 4) return { found: false, detail: `unsupported ID3v2.${majorVersion}` };
  const tagSize = fromSyncsafe(outputBytes, 6);
  const tagEnd = Math.min(10 + tagSize, outputBytes.byteLength);
  let extractedManifest: Record<string, unknown> | undefined;
  let aiGenerated: string | undefined;
  let offset = 10;
  while (offset + 10 <= tagEnd) {
    const frameId = String.fromCharCode(outputBytes[offset], outputBytes[offset + 1], outputBytes[offset + 2], outputBytes[offset + 3]);
    if (frameId.charCodeAt(0) === 0) break; // padding
    const frameSize = fromSyncsafe(outputBytes, offset + 4);
    const frameStart = offset + 10;
    if (frameStart + frameSize > tagEnd) return { found: false, detail: "truncated ID3 frame" };
    if (frameId === "TXXX") {
      const body = outputBytes.subarray(frameStart, frameStart + frameSize);
      const encoding = body[0];
      const nul = body.indexOf(0x00, 1);
      if (nul > 0) {
        const description = utf8Text(body.subarray(1, nul));
        const value = encoding === 3 || encoding === 0 ? utf8Text(body.subarray(nul + 1)) : "";
        if (description === MANIFEST_DESCRIPTION) {
          try {
            extractedManifest = JSON.parse(value) as Record<string, unknown>;
          } catch {
            return { found: false, detail: "TXXX manifest JSON parse failed" };
          }
        } else if (description === AI_GENERATED_DESCRIPTION) {
          aiGenerated = value;
        }
      }
    }
    offset = frameStart + frameSize;
  }
  if (!extractedManifest) return { found: false, detail: "kiikis:ai-manifest TXXX frame not found" };
  return { found: true, extractedManifest, detail: `id3v2.4-txxx; ai_generated=${aiGenerated ?? "unknown"}` };
}
