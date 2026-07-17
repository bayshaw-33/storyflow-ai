/**
 * WAV metadata writer (RIFF/WAVE, dependency-free).
 *
 * Appends (a) an `iXML` chunk with a BWFXML envelope carrying the canonical
 * JSON manifest, and (b) a `LIST` chunk of type INFO with sub-chunks ISFT
 * ("KIIKIS Compliance Adapter 0.1") and IART ("ai_generated=true|false").
 * Chunks are padded to even sizes and the RIFF size field is updated.
 * Original fmt/data audio bytes are preserved. Throws WAV_MARKING_FAILED.
 */

import { canonicalJson, concatBytes, utf8Bytes, utf8Text } from "../manifest.ts";
import { escapeXml, unescapeXml } from "./jpeg.ts";
import type { AiManifest, FormatVerifyResult, FormatWriteResult, MarkingRequest } from "../types.ts";

const SOFTWARE_TAG = "KIIKIS Compliance Adapter 0.1";

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

function assertRiffWave(bytes: Uint8Array): void {
  if (bytes.byteLength < 12 || asciiText(bytes.subarray(0, 4)) !== "RIFF" || asciiText(bytes.subarray(8, 12)) !== "WAVE") {
    throw new Error("WAV_MARKING_FAILED: not a RIFF/WAVE file");
  }
}

function buildChunk(fourcc: string, data: Uint8Array): Uint8Array {
  const pad = data.byteLength % 2 === 1 ? new Uint8Array([0x00]) : new Uint8Array(0);
  return concatBytes([asciiBytes(fourcc), writeUint32LE(data.byteLength), data, pad]);
}

function buildInfoSubChunk(fourcc: string, value: string): Uint8Array {
  // INFO strings are NUL-terminated
  return buildChunk(fourcc, concatBytes([utf8Bytes(value), new Uint8Array([0x00])]));
}

export function writeWav(inputBytes: Uint8Array, manifest: AiManifest, _request: MarkingRequest): FormatWriteResult {
  try {
    assertRiffWave(inputBytes);
    const ixml = utf8Bytes(`<BWFXML><KIIKIS_AI_MANIFEST>${escapeXml(canonicalJson(manifest))}</KIIKIS_AI_MANIFEST></BWFXML>`);
    const infoData = concatBytes([
      asciiBytes("INFO"),
      buildInfoSubChunk("ISFT", SOFTWARE_TAG),
      buildInfoSubChunk("IART", `ai_generated=${manifest.ai_generated ? "true" : "false"}`),
    ]);
    const outputBytes = concatBytes([inputBytes, buildChunk("iXML", ixml), buildChunk("LIST", infoData)]);
    outputBytes.set(writeUint32LE(outputBytes.byteLength - 8), 4);
    return {
      outputBytes,
      machineReadableFormats: ["wav-bwf-ixml", "riff-info"],
      extraVerification: { riff_size: outputBytes.byteLength - 8, software: SOFTWARE_TAG },
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("WAV_MARKING_FAILED")) throw error;
    throw new Error(`WAV_MARKING_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function verifyWav(outputBytes: Uint8Array): FormatVerifyResult {
  try {
    assertRiffWave(outputBytes);
  } catch (error) {
    return { found: false, detail: error instanceof Error ? error.message : String(error) };
  }
  let extractedManifest: Record<string, unknown> | undefined;
  let sawInfoSoftware = false;
  let offset = 12;
  while (offset + 8 <= outputBytes.byteLength) {
    const fourcc = asciiText(outputBytes.subarray(offset, offset + 4));
    const size = readUint32LE(outputBytes, offset + 4);
    const dataStart = offset + 8;
    if (dataStart + size > outputBytes.byteLength) return { found: false, detail: "truncated RIFF chunk" };
    const data = outputBytes.subarray(dataStart, dataStart + size);
    if (fourcc === "iXML") {
      const match = utf8Text(data).match(/<KIIKIS_AI_MANIFEST>([\s\S]*?)<\/KIIKIS_AI_MANIFEST>/);
      if (match) {
        try {
          extractedManifest = JSON.parse(unescapeXml(match[1])) as Record<string, unknown>;
        } catch {
          return { found: false, detail: "iXML manifest JSON parse failed" };
        }
      }
    } else if (fourcc === "LIST" && asciiText(data.subarray(0, 4)) === "INFO") {
      let sub = 4;
      while (sub + 8 <= data.byteLength) {
        const subFourcc = asciiText(data.subarray(sub, sub + 4));
        const subSize = readUint32LE(data, sub + 4);
        const subData = data.subarray(sub + 8, sub + 8 + subSize);
        if (subFourcc === "ISFT" && utf8Text(subData).replace(/\0+$/, "") === SOFTWARE_TAG) {
          sawInfoSoftware = true;
        }
        sub += 8 + subSize + (subSize % 2 === 1 ? 1 : 0);
      }
    }
    offset = dataStart + size + (size % 2 === 1 ? 1 : 0);
  }
  if (!extractedManifest) return { found: false, detail: "iXML manifest chunk not found" };
  return { found: true, extractedManifest, detail: `wav-bwf-ixml; riff-info-software=${sawInfoSoftware}` };
}
