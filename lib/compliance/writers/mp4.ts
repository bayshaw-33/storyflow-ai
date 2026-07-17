/**
 * MP4/MOV metadata writer (ISO-BMFF, dependency-free).
 *
 * Appends ONE top-level `uuid` box: 4-byte big-endian size + "uuid" +
 * 16-byte usertype constant "KIIKISAICOMPLI01" (exactly 16 ASCII chars) +
 * canonical JSON manifest (UTF-8). Works for .mp4 and .mov; input must
 * start with a plausible box (ftyp). Throws MP4_MARKING_FAILED otherwise.
 */

import { canonicalJson, concatBytes, utf8Bytes, utf8Text } from "../manifest.ts";
import type { AiManifest, FormatVerifyResult, FormatWriteResult, MarkingRequest } from "../types.ts";

export const MP4_UUID_USERTYPE = "KIIKISAICOMPLI01"; // exactly 16 bytes

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function writeUint32BE(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
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

export function writeMp4(inputBytes: Uint8Array, manifest: AiManifest, _request: MarkingRequest): FormatWriteResult {
  try {
    if (inputBytes.byteLength < 8 || asciiText(inputBytes.subarray(4, 8)) !== "ftyp") {
      throw new Error("MP4_MARKING_FAILED: input does not start with an ftyp box");
    }
    const payload = utf8Bytes(canonicalJson(manifest));
    const boxSize = 8 + 16 + payload.byteLength;
    const box = concatBytes([writeUint32BE(boxSize), asciiBytes("uuid"), asciiBytes(MP4_UUID_USERTYPE), payload]);
    const outputBytes = concatBytes([inputBytes, box]);
    return {
      outputBytes,
      machineReadableFormats: ["mp4-uuid-box"],
      extraVerification: { usertype: MP4_UUID_USERTYPE },
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("MP4_MARKING_FAILED")) throw error;
    throw new Error(`MP4_MARKING_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function verifyMp4(outputBytes: Uint8Array): FormatVerifyResult {
  let offset = 0;
  while (offset + 8 <= outputBytes.byteLength) {
    let size = readUint32BE(outputBytes, offset);
    const type = asciiText(outputBytes.subarray(offset + 4, offset + 8));
    let headerSize = 8;
    if (size === 1) {
      // 64-bit largesize
      if (offset + 16 > outputBytes.byteLength) return { found: false, detail: "truncated largesize box" };
      const view = new DataView(outputBytes.buffer, outputBytes.byteOffset + offset + 8, 8);
      size = Number(view.getBigUint64(0, false));
      headerSize = 16;
    } else if (size === 0) {
      size = outputBytes.byteLength - offset; // box extends to end of file
    }
    if (size < headerSize || offset + size > outputBytes.byteLength) {
      return { found: false, detail: `invalid ${type} box size` };
    }
    if (type === "uuid") {
      const usertype = asciiText(outputBytes.subarray(offset + headerSize, offset + headerSize + 16));
      if (usertype === MP4_UUID_USERTYPE) {
        const payload = outputBytes.subarray(offset + headerSize + 16, offset + size);
        try {
          return { found: true, extractedManifest: JSON.parse(utf8Text(payload)) as Record<string, unknown>, detail: "mp4-uuid-box" };
        } catch {
          return { found: false, detail: "uuid manifest JSON parse failed" };
        }
      }
    }
    offset += size;
  }
  return { found: false, detail: "kiikis uuid box not found" };
}
