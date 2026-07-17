/**
 * PNG metadata writer (dependency-free byte manipulation).
 *
 * Inserts ONE iTXt chunk (keyword "kiikis:ai-manifest", compression 0,
 * null separators per PNG spec, text = canonical JSON manifest) and ONE
 * tEXt chunk (keyword "ai_generated", value "true"/"false") immediately
 * BEFORE the IEND chunk. Original image data (IHDR/IDAT/…) is preserved
 * byte-for-byte. Throws PNG_MARKING_FAILED on corrupt input (fail-closed).
 */

import { canonicalJson, concatBytes, utf8Bytes, utf8Text } from "../manifest.ts";
import type { AiManifest, FormatVerifyResult, FormatWriteResult, MarkingRequest } from "../types.ts";

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MANIFEST_KEYWORD = "kiikis:ai-manifest";
const AI_GENERATED_KEYWORD = "ai_generated";

// Table-based CRC32 (PNG polynomial 0xEDB88320). zlib.crc32 is NOT used.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.byteLength; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

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

function buildChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = asciiBytes(type);
  const crc = crc32(concatBytes([typeBytes, data]));
  return concatBytes([writeUint32BE(data.byteLength), typeBytes, data, writeUint32BE(crc)]);
}

function buildItxtChunk(keyword: string, text: string): Uint8Array {
  // keyword + NUL + compression_flag(0) + compression_method(0) + language_tag("") + NUL + translated_keyword("") + NUL + text(UTF-8)
  const data = concatBytes([
    asciiBytes(keyword),
    new Uint8Array([0x00]),
    new Uint8Array([0x00]),
    new Uint8Array([0x00]),
    new Uint8Array([0x00]),
    new Uint8Array([0x00]),
    utf8Bytes(text),
  ]);
  return buildChunk("iTXt", data);
}

function buildTextChunk(keyword: string, value: string): Uint8Array {
  return buildChunk("tEXt", concatBytes([asciiBytes(keyword), new Uint8Array([0x00]), asciiBytes(value)]));
}

interface PngChunk {
  type: string;
  dataStart: number;
  dataLength: number;
  chunkStart: number;
  chunkEnd: number;
}

function walkChunks(bytes: Uint8Array): PngChunk[] {
  if (bytes.byteLength < 8 || !PNG_SIGNATURE.every((b, i) => bytes[i] === b)) {
    throw new Error("PNG_MARKING_FAILED: invalid PNG signature");
  }
  const chunks: PngChunk[] = [];
  let offset = 8;
  let sawIend = false;
  while (offset + 12 <= bytes.byteLength) {
    const dataLength = readUint32BE(bytes, offset);
    const type = asciiText(bytes.subarray(offset + 4, offset + 8));
    const chunkEnd = offset + 12 + dataLength;
    if (chunkEnd > bytes.byteLength) {
      throw new Error(`PNG_MARKING_FAILED: truncated ${type} chunk`);
    }
    const expectedCrc = readUint32BE(bytes, offset + 8 + dataLength);
    const actualCrc = crc32(bytes.subarray(offset + 4, offset + 8 + dataLength));
    if (expectedCrc !== actualCrc) {
      throw new Error(`PNG_MARKING_FAILED: CRC mismatch in ${type} chunk`);
    }
    chunks.push({ type, dataStart: offset + 8, dataLength, chunkStart: offset, chunkEnd });
    if (type === "IEND") {
      sawIend = true;
      break;
    }
    offset = chunkEnd;
  }
  if (!sawIend) throw new Error("PNG_MARKING_FAILED: missing IEND chunk");
  return chunks;
}

export function writePng(inputBytes: Uint8Array, manifest: AiManifest, _request: MarkingRequest): FormatWriteResult {
  try {
    const chunks = walkChunks(inputBytes);
    const iend = chunks[chunks.length - 1];
    const itxt = buildItxtChunk(MANIFEST_KEYWORD, canonicalJson(manifest));
    const text = buildTextChunk(AI_GENERATED_KEYWORD, manifest.ai_generated ? "true" : "false");
    const outputBytes = concatBytes([
      inputBytes.subarray(0, iend.chunkStart),
      itxt,
      text,
      inputBytes.subarray(iend.chunkStart),
    ]);
    return {
      outputBytes,
      machineReadableFormats: ["png-itxt", "png-text"],
      extraVerification: { inserted_before: "IEND", chunks_total: chunks.length + 2 },
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PNG_MARKING_FAILED")) throw error;
    throw new Error(`PNG_MARKING_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function verifyPng(outputBytes: Uint8Array): FormatVerifyResult {
  let chunks: PngChunk[];
  try {
    chunks = walkChunks(outputBytes); // also validates every chunk CRC
  } catch (error) {
    return { found: false, detail: error instanceof Error ? error.message : String(error) };
  }
  let extractedManifest: Record<string, unknown> | undefined;
  let aiGenerated: string | undefined;
  for (const chunk of chunks) {
    const data = outputBytes.subarray(chunk.dataStart, chunk.dataStart + chunk.dataLength);
    if (chunk.type === "iTXt") {
      const firstNul = data.indexOf(0x00);
      if (firstNul < 0) continue;
      const keyword = asciiText(data.subarray(0, firstNul));
      if (keyword !== MANIFEST_KEYWORD) continue;
      const compressionFlag = data[firstNul + 1];
      if (compressionFlag !== 0) return { found: false, detail: "compressed iTXt manifests unsupported" };
      // skip compression_method, language_tag NUL, translated_keyword NUL
      const langNul = data.indexOf(0x00, firstNul + 3);
      const translatedNul = langNul < 0 ? -1 : data.indexOf(0x00, langNul + 1);
      if (translatedNul < 0) continue;
      const text = utf8Text(data.subarray(translatedNul + 1));
      try {
        extractedManifest = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return { found: false, detail: "iTXt manifest JSON parse failed" };
      }
    } else if (chunk.type === "tEXt") {
      const nul = data.indexOf(0x00);
      if (nul > 0 && asciiText(data.subarray(0, nul)) === AI_GENERATED_KEYWORD) {
        aiGenerated = asciiText(data.subarray(nul + 1));
      }
    }
  }
  if (!extractedManifest) return { found: false, detail: "kiikis:ai-manifest iTXt chunk not found" };
  return {
    found: true,
    extractedManifest,
    detail: `crc_validated_chunks=${chunks.length}; ai_generated=${aiGenerated ?? "unknown"}`,
  };
}
