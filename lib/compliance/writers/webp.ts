/**
 * WebP metadata writer (RIFF container, dependency-free).
 *
 * Appends one "XMP " chunk (fourcc includes the trailing space) carrying
 * the same XMP packet as the JPEG writer, padded to even size, and updates
 * the RIFF size field. Throws WEBP_MARKING_FAILED on invalid input.
 */

import { concatBytes, utf8Bytes, utf8Text } from "../manifest.ts";
import type { AiManifest, FormatVerifyResult, FormatWriteResult, MarkingRequest } from "../types.ts";
import { buildXmpPacket, extractManifestFromXmp } from "./jpeg.ts";

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function writeUint32LE(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}

function asciiBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 0x7f;
  return out;
}

function asciiText(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.byteLength; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

function assertRiffWebp(bytes: Uint8Array): void {
  if (bytes.byteLength < 12 || asciiText(bytes.subarray(0, 4)) !== "RIFF" || asciiText(bytes.subarray(8, 12)) !== "WEBP") {
    throw new Error("WEBP_MARKING_FAILED: not a RIFF/WEBP file");
  }
}

export function writeWebp(inputBytes: Uint8Array, manifest: AiManifest, _request: MarkingRequest): FormatWriteResult {
  try {
    assertRiffWebp(inputBytes);
    const payload = utf8Bytes(buildXmpPacket(manifest));
    const pad = payload.byteLength % 2 === 1 ? new Uint8Array([0x00]) : new Uint8Array(0);
    const chunk = concatBytes([asciiBytes("XMP "), writeUint32LE(payload.byteLength), payload, pad]);
    const outputBytes = concatBytes([inputBytes, chunk]);
    outputBytes.set(writeUint32LE(outputBytes.byteLength - 8), 4);
    return {
      outputBytes,
      machineReadableFormats: ["webp-riff-xmp"],
      extraVerification: { riff_size: outputBytes.byteLength - 8 },
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("WEBP_MARKING_FAILED")) throw error;
    throw new Error(`WEBP_MARKING_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function verifyWebp(outputBytes: Uint8Array): FormatVerifyResult {
  try {
    assertRiffWebp(outputBytes);
  } catch (error) {
    return { found: false, detail: error instanceof Error ? error.message : String(error) };
  }
  let offset = 12;
  while (offset + 8 <= outputBytes.byteLength) {
    const fourcc = asciiText(outputBytes.subarray(offset, offset + 4));
    const size = readUint32LE(outputBytes, offset + 4);
    const dataStart = offset + 8;
    if (dataStart + size > outputBytes.byteLength) return { found: false, detail: "truncated RIFF chunk" };
    if (fourcc === "XMP ") {
      const extractedManifest = extractManifestFromXmp(utf8Text(outputBytes.subarray(dataStart, dataStart + size)));
      if (extractedManifest) return { found: true, extractedManifest, detail: "webp-riff-xmp" };
    }
    offset = dataStart + size + (size % 2 === 1 ? 1 : 0);
  }
  return { found: false, detail: "XMP chunk not found" };
}
