import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { runComplianceMarking } from "../lib/compliance/adapter.ts";
import { resolveComplianceFlags } from "../lib/compliance/feature-flags.ts";
import { runExportGate } from "../lib/compliance/gate.ts";
import { createMemorySink } from "../lib/compliance/log-writer.ts";
import { buildAiManifest, canonicalJson, computeMetadataHash, sha256Hex } from "../lib/compliance/manifest.ts";
import { verifyJpeg, writeJpeg } from "../lib/compliance/writers/jpeg.ts";
import { stripId3v2, verifyMp3, writeMp3 } from "../lib/compliance/writers/mp3.ts";
import { verifyMp4, writeMp4 } from "../lib/compliance/writers/mp4.ts";
import { verifyPdf, writePdf } from "../lib/compliance/writers/pdf.ts";
import { verifyPng, writePng } from "../lib/compliance/writers/png.ts";
import { verifySidecar, writeSidecar } from "../lib/compliance/writers/sidecar.ts";
import { verifyWav, writeWav } from "../lib/compliance/writers/wav.ts";
import { verifyWebp, writeWebp } from "../lib/compliance/writers/webp.ts";

const FIXTURES = new URL("./fixtures/", import.meta.url);
const samplePng = new Uint8Array(readFileSync(new URL("sample.png", FIXTURES)));
const sampleJpg = new Uint8Array(readFileSync(new URL("sample.jpg", FIXTURES)));
const sampleWav = new Uint8Array(readFileSync(new URL("sample.wav", FIXTURES)));

const FIXED_TIME = "2026-07-18T00:00:00.000Z";

function prodEnv(overrides = {}) {
  return { NODE_ENV: "production", ...overrides };
}

function makeRequest(overrides = {}) {
  return {
    assetId: "asset-1",
    assetVersionId: "version-1",
    contentKind: "image",
    inputPath: "sample.png",
    outputPath: "sample.marked.png",
    jurisdictionProfile: "EU_ART50",
    aiGenerated: true,
    aiModified: false,
    providerCode: "KIIKIS",
    contentId: "content-1",
    modelProvider: "deepseek",
    modelName: "deepseek-v4-flash",
    visibleDisclosureMode: "ui",
    ...overrides,
  };
}

function makeManifest(overrides = {}) {
  return buildAiManifest(makeRequest(overrides), { createdAt: FIXED_TIME });
}

// ---------------------------------------------------------------------------
// 1. feature flags
// ---------------------------------------------------------------------------

test("flags: production defaults enable exactly the PRD true-set", () => {
  const flags = resolveComplianceFlags(prodEnv());
  const expectedTrue = [
    "COMPLIANCE_EXPORT_GATE",
    "EU_ART50_MACHINE_MARKING",
    "EU_ART50_STRICT_EXPORT_BLOCK",
    "CN_AIGC_MACHINE_MARKING",
    "CN_AIGC_STRICT_EXPORT_BLOCK",
  ];
  for (const [name, value] of Object.entries(flags)) {
    assert.equal(value, expectedTrue.includes(name), `${name} should be ${expectedTrue.includes(name)}`);
  }
});

test("flags: non-production defaults everything to false", () => {
  for (const value of Object.values(resolveComplianceFlags({ NODE_ENV: "development" }))) {
    assert.equal(value, false);
  }
  for (const value of Object.values(resolveComplianceFlags({}))) {
    assert.equal(value, false);
  }
});

test("flags: explicit env overrides win over defaults (case-insensitive)", () => {
  const flags = resolveComplianceFlags(prodEnv({ EU_ART50_MACHINE_MARKING: "FALSE", DUAL_JURISDICTION_MARKING: "1" }));
  assert.equal(flags.EU_ART50_MACHINE_MARKING, false);
  assert.equal(flags.DUAL_JURISDICTION_MARKING, true);
  const dev = resolveComplianceFlags({ NODE_ENV: "development", COMPLIANCE_EXPORT_GATE: "True" });
  assert.equal(dev.COMPLIANCE_EXPORT_GATE, true);
});

// ---------------------------------------------------------------------------
// 2. manifest canonicalization + hashing
// ---------------------------------------------------------------------------

test("manifest: canonicalJson is key-order independent and hash is 64-hex", () => {
  const a = { b: 2, a: { d: 4, c: 3 }, z: [1, { y: 2, x: 1 }] };
  const b = { z: [1, { x: 1, y: 2 }], a: { c: 3, d: 4 }, b: 2 };
  assert.equal(canonicalJson(a), canonicalJson(b));
  assert.equal(canonicalJson(a), '{"a":{"c":3,"d":4},"b":2,"z":[1,{"x":1,"y":2}]}');
  const hash = computeMetadataHash(makeManifest());
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(sha256Hex(new TextEncoder().encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

// ---------------------------------------------------------------------------
// 3. PNG round-trip
// ---------------------------------------------------------------------------

function findPngChunk(bytes, type) {
  let offset = 8;
  while (offset + 12 <= bytes.byteLength) {
    const length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    const chunkType = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    if (chunkType === type) return bytes.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
  }
  return undefined;
}

test("png: mark → verify round-trip, IDAT unchanged, CRCs validated", () => {
  const manifest = makeManifest();
  const { outputBytes } = writePng(samplePng, manifest, makeRequest());
  const result = verifyPng(outputBytes);
  assert.equal(result.found, true, result.detail);
  assert.equal(computeMetadataHash(result.extractedManifest), computeMetadataHash(manifest));
  // original IDAT data preserved byte-for-byte
  assert.deepEqual(findPngChunk(outputBytes, "IDAT"), findPngChunk(samplePng, "IDAT"));
  // verifier walks + validates every chunk CRC (walkChunks throws on mismatch)
  assert.match(result.detail, /crc_validated_chunks=\d+/);
});

// ---------------------------------------------------------------------------
// 4. JPEG round-trip
// ---------------------------------------------------------------------------

test("jpeg: mark → verify round-trip, SOI + leading APPn structure intact", () => {
  const manifest = makeManifest();
  const { outputBytes } = writeJpeg(sampleJpg, manifest, makeRequest());
  const result = verifyJpeg(outputBytes);
  assert.equal(result.found, true, result.detail);
  assert.equal(computeMetadataHash(result.extractedManifest), computeMetadataHash(manifest));
  // SOI preserved; original leading APP0 run preserved as a prefix region
  assert.equal(outputBytes[0], 0xff);
  assert.equal(outputBytes[1], 0xd8);
  if (sampleJpg[2] === 0xff && sampleJpg[3] === 0xe0) {
    const app0Length = (sampleJpg[4] << 8) | sampleJpg[5];
    assert.deepEqual(outputBytes.subarray(0, 2 + 2 + app0Length), sampleJpg.subarray(0, 2 + 2 + app0Length));
  }
});

// ---------------------------------------------------------------------------
// 5. WebP round-trip (synthesized minimal RIFF)
// ---------------------------------------------------------------------------

function makeMinimalWebp() {
  const vp8Payload = new Uint8Array([0x2f, 0x01, 0x02, 0x03, 0x04]); // odd length → pad exercised
  const chunk = new Uint8Array(8 + vp8Payload.byteLength + 1);
  chunk.set(new TextEncoder().encode("VP8 "), 0);
  chunk.set([vp8Payload.byteLength, 0, 0, 0], 4);
  chunk.set(vp8Payload, 8);
  const riffSize = 4 + chunk.byteLength;
  const bytes = new Uint8Array(8 + riffSize);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set([riffSize, 0, 0, 0], 4);
  bytes.set(new TextEncoder().encode("WEBP"), 8);
  bytes.set(chunk, 12);
  return bytes;
}

test("webp: mark → verify round-trip on synthesized RIFF", () => {
  const manifest = makeManifest();
  const input = makeMinimalWebp();
  const { outputBytes } = writeWebp(input, manifest, makeRequest());
  const result = verifyWebp(outputBytes);
  assert.equal(result.found, true, result.detail);
  assert.equal(computeMetadataHash(result.extractedManifest), computeMetadataHash(manifest));
  // RIFF size field consistent with file length
  const riffSize = outputBytes[4] | (outputBytes[5] << 8) | (outputBytes[6] << 16) | (outputBytes[7] << 24);
  assert.equal(riffSize, outputBytes.byteLength - 8);
});

// ---------------------------------------------------------------------------
// 6. MP4 round-trip (synthesized ftyp + mdat)
// ---------------------------------------------------------------------------

function makeMinimalMp4() {
  const ftyp = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 1, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31]);
  const mdat = new Uint8Array([0, 0, 0, 12, 0x6d, 0x64, 0x61, 0x74, 0xde, 0xad, 0xbe, 0xef]);
  const out = new Uint8Array(ftyp.byteLength + mdat.byteLength);
  out.set(ftyp, 0);
  out.set(mdat, ftyp.byteLength);
  return out;
}

test("mp4: mark → verify round-trip; input bytes are an exact prefix", () => {
  const manifest = makeManifest({ contentKind: "video", inputPath: "clip.mp4", outputPath: "clip.marked.mp4" });
  const input = makeMinimalMp4();
  const { outputBytes, machineReadableFormats } = writeMp4(input, manifest, makeRequest({ contentKind: "video" }));
  assert.deepEqual(machineReadableFormats, ["mp4-uuid-box"]);
  assert.deepEqual(outputBytes.subarray(0, input.byteLength), input);
  const result = verifyMp4(outputBytes);
  assert.equal(result.found, true, result.detail);
  assert.equal(computeMetadataHash(result.extractedManifest), computeMetadataHash(manifest));
});

// ---------------------------------------------------------------------------
// 7. WAV round-trip (fixture)
// ---------------------------------------------------------------------------

function findRiffChunk(bytes, fourcc) {
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const size = bytes[offset + 4] | (bytes[offset + 5] << 8) | (bytes[offset + 6] << 16) | (bytes[offset + 7] << 24);
    if (id === fourcc) return bytes.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  return undefined;
}

test("wav: mark → verify round-trip; RIFF size consistent; fmt/data unchanged", () => {
  const manifest = makeManifest({ contentKind: "audio", inputPath: "tone.wav", outputPath: "tone.marked.wav" });
  const { outputBytes, machineReadableFormats } = writeWav(sampleWav, manifest, makeRequest({ contentKind: "audio" }));
  assert.deepEqual(machineReadableFormats, ["wav-bwf-ixml", "riff-info"]);
  const result = verifyWav(outputBytes);
  assert.equal(result.found, true, result.detail);
  assert.equal(computeMetadataHash(result.extractedManifest), computeMetadataHash(manifest));
  const riffSize = outputBytes[4] | (outputBytes[5] << 8) | (outputBytes[6] << 16) | (outputBytes[7] << 24);
  assert.equal(riffSize, outputBytes.byteLength - 8);
  // appending only touches the RIFF size field; everything after offset 8 is preserved
  assert.deepEqual(outputBytes.subarray(8, sampleWav.byteLength), sampleWav.subarray(8));
  assert.deepEqual(findRiffChunk(outputBytes, "fmt "), findRiffChunk(sampleWav, "fmt "));
  assert.deepEqual(findRiffChunk(outputBytes, "data"), findRiffChunk(sampleWav, "data"));
});

// ---------------------------------------------------------------------------
// 8. MP3 round-trip + idempotent re-mark
// ---------------------------------------------------------------------------

function makeFakeMp3Frames() {
  const bytes = new Uint8Array(202);
  bytes[0] = 0xff;
  bytes[1] = 0xfb;
  for (let i = 2; i < bytes.byteLength; i += 1) bytes[i] = i % 256;
  return bytes;
}

test("mp3: mark → verify; re-marking replaces the tag (exactly one ID3 header)", () => {
  const manifest = makeManifest({ contentKind: "audio", inputPath: "song.mp3", outputPath: "song.marked.mp3" });
  const frames = makeFakeMp3Frames();
  const first = writeMp3(frames, manifest, makeRequest({ contentKind: "audio" }));
  const result = verifyMp3(first.outputBytes);
  assert.equal(result.found, true, result.detail);
  assert.equal(computeMetadataHash(result.extractedManifest), computeMetadataHash(manifest));
  // audio payload preserved after the tag
  assert.deepEqual(stripId3v2(first.outputBytes), frames);
  // idempotent: re-marking strips the previous tag instead of stacking
  const second = writeMp3(first.outputBytes, manifest, makeRequest({ contentKind: "audio" }));
  const text = Array.from(second.outputBytes).map((b) => String.fromCharCode(b)).join("");
  assert.equal(text.split("ID3").length - 1, 1);
  assert.deepEqual(second.outputBytes, first.outputBytes);
});

// ---------------------------------------------------------------------------
// 9. PDF round-trip (pdf-lib generated fixture)
// ---------------------------------------------------------------------------

test("pdf: mark → verify round-trip via pdf-lib reload", async () => {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const page = doc.addPage([220, 120]);
  page.drawText("StoryFlow compliance fixture");
  const pdfBytes = new Uint8Array(await doc.save());

  const manifest = makeManifest({ contentKind: "document", inputPath: "script.pdf", outputPath: "script.marked.pdf" });
  const { outputBytes, machineReadableFormats } = await writePdf(pdfBytes, manifest, makeRequest({ contentKind: "document" }));
  assert.deepEqual(machineReadableFormats, ["pdf-info-dict"]);
  const result = await verifyPdf(outputBytes);
  assert.equal(result.found, true, result.detail);
  assert.equal(computeMetadataHash(result.extractedManifest), computeMetadataHash(manifest));

  const reloaded = await PDFDocument.load(outputBytes, { updateMetadata: false });
  const parsed = JSON.parse(reloaded.getKeywords());
  assert.equal(parsed.schema_version, "kiikis.ai-manifest/0.1");
  assert.equal(reloaded.getProducer(), "KIIKIS StoryFlow Compliance Adapter 0.1");
});

// ---------------------------------------------------------------------------
// 10. SRT sidecar
// ---------------------------------------------------------------------------

test("sidecar: srt bytes unchanged; sidecar target sha256 + ai_disclosure present", () => {
  const srt = new TextEncoder().encode("1\n00:00:01,000 --> 00:00:02,000\n你好\n");
  const request = makeRequest({ contentKind: "text", inputPath: "ep1.srt", outputPath: "ep1.srt" });
  const manifest = buildAiManifest(request, { createdAt: FIXED_TIME });
  const { outputBytes, sidecarBytes, machineReadableFormats } = writeSidecar(srt, manifest, request);
  assert.deepEqual(machineReadableFormats, ["sidecar-manifest"]);
  assert.deepEqual(outputBytes, srt);
  assert.ok(sidecarBytes);
  const sidecar = JSON.parse(new TextDecoder().decode(sidecarBytes));
  assert.equal(sidecar.target_file.sha256, sha256Hex(srt));
  assert.equal(sidecar.target_file.byte_length, srt.byteLength);
  assert.equal(sidecar.ai_disclosure.ai_generated, true);
  assert.equal(sidecar.ai_disclosure.jurisdiction_profile, "EU_ART50");
  assert.equal(sidecar.ai_disclosure.provider_code, "KIIKIS");
  assert.ok(sidecar.ai_disclosure.disclosure_text.length > 0);
  const result = verifySidecar(outputBytes, { sidecarBytes });
  assert.equal(result.found, true, result.detail);
  assert.equal(computeMetadataHash(result.extractedManifest), computeMetadataHash(manifest));
});

// ---------------------------------------------------------------------------
// 11. gate matrix (memory sink)
// ---------------------------------------------------------------------------

async function runGateCase({ requestOverrides = {}, extra = {}, env = prodEnv(), inputBytes = samplePng }) {
  const sink = createMemorySink();
  const result = await runComplianceMarking(
    { ...makeRequest(requestOverrides), inputBytes, extra },
    { sink, env, ownerId: "user-1" },
  );
  return { ...result, sink };
}

test("gate: missing jurisdiction blocks with jurisdiction_missing", async () => {
  const { gate, sink } = await runGateCase({ requestOverrides: { jurisdictionProfile: "" } });
  assert.equal(gate.decision, "blocked");
  assert.equal(gate.blockingCode, "jurisdiction_missing");
  assert.equal(sink.runRows[0].decision, "blocked");
  assert.equal(sink.runRows[0].blocking_reason_code, "jurisdiction_missing");
  assert.equal(sink.labelRows[0].status, "blocked");
  assert.equal(sink.labelRows[0].error_code, "jurisdiction_missing");
  // invalid profile value must not violate the DB CHECK constraint
  assert.equal(sink.labelRows[0].jurisdiction_profile, "INTERNAL_ONLY");
});

test("gate: non-boolean ai status blocks with ai_status_unknown", async () => {
  const { gate, sink } = await runGateCase({ requestOverrides: { aiGenerated: undefined } });
  assert.equal(gate.decision, "blocked");
  assert.equal(gate.blockingCode, "ai_status_unknown");
  assert.equal(sink.labelRows[0].status, "blocked");
});

test("gate: watermark mode on strict EU profile blocks with disclosure_mode_missing", async () => {
  const { gate, sink } = await runGateCase({ requestOverrides: { visibleDisclosureMode: "watermark" } });
  assert.equal(gate.decision, "blocked");
  assert.equal(gate.blockingCode, "disclosure_mode_missing");
  assert.equal(sink.labelRows[0].status, "blocked");
  assert.equal(sink.labelRows[0].error_code, "disclosure_mode_missing");
});

test("gate: UNMARKED_EXPORT_EXCEPTION downgrades the disclosure block", async () => {
  const { gate, sink } = await runGateCase({
    requestOverrides: { visibleDisclosureMode: "watermark" },
    env: prodEnv({ UNMARKED_EXPORT_EXCEPTION: "true" }),
  });
  assert.equal(gate.decision, "allowed");
  const policyStep = gate.steps.find((step) => step.step === "resolve_disclosure_policy");
  assert.match(policyStep.detail, /unmarked_exception_applied/);
  assert.equal(sink.labelRows[0].status, "verified");
});

test("gate: synthetic voice without license blocks with voice_license_missing", async () => {
  const { gate, sink } = await runGateCase({
    requestOverrides: { contentKind: "audio", inputPath: "tone.wav", outputPath: "tone.wav" },
    extra: { syntheticVoice: true, voiceLicenseStatus: "missing" },
    inputBytes: sampleWav,
  });
  assert.equal(gate.decision, "blocked");
  assert.equal(gate.blockingCode, "voice_license_missing");
  assert.equal(sink.labelRows[0].error_code, "voice_license_missing");
});

test("gate: corrupt PNG input fails closed with machine_marking_failed", async () => {
  const truncated = samplePng.subarray(0, Math.floor(samplePng.byteLength / 2));
  const { gate, sink } = await runGateCase({ inputBytes: truncated });
  assert.equal(gate.decision, "failed");
  assert.equal(gate.blockingCode, "machine_marking_failed");
  assert.equal(sink.labelRows[0].status, "failed");
  assert.equal(sink.runRows[0].decision, "failed");
});

test("gate: COMPLIANCE_EXPORT_GATE=false allows with every step skipped", async () => {
  const { gate, sink } = await runGateCase({ env: prodEnv({ COMPLIANCE_EXPORT_GATE: "false" }) });
  assert.equal(gate.decision, "allowed");
  for (const step of gate.steps) {
    assert.equal(step.status, "skipped");
    assert.equal(step.detail, "gate_disabled");
  }
  assert.equal(sink.runRows.length, 1);
  assert.equal(sink.runRows[0].decision, "allowed");
  assert.equal(sink.labelRows.length, 0);
});

test("gate: EU_CN_DUAL without DUAL_JURISDICTION_MARKING blocks with feature_disabled", async () => {
  const { gate, sink } = await runGateCase({ requestOverrides: { jurisdictionProfile: "EU_CN_DUAL" } });
  assert.equal(gate.decision, "blocked");
  assert.equal(gate.blockingCode, "feature_disabled");
  assert.equal(sink.labelRows[0].status, "blocked");
});

test("gate: marking-flag off + strict-block off skips marking and allows", async () => {
  const env = prodEnv({ EU_ART50_MACHINE_MARKING: "false", EU_ART50_STRICT_EXPORT_BLOCK: "false" });
  const { gate, sink } = await runGateCase({ env });
  assert.equal(gate.decision, "allowed");
  const markingStep = gate.steps.find((step) => step.step === "apply_marking");
  assert.equal(markingStep.status, "skipped");
  assert.equal(markingStep.detail, "marking_flag_disabled");
  assert.equal(sink.runRows[0].decision, "allowed");
});

test("gate: sink write failure fails closed with compliance_record_write_failed", async () => {
  const sink = createMemorySink();
  sink.writeRunRecord = async () => {
    throw new Error("COMPLIANCE_RECORD_WRITE_FAILED: simulated outage");
  };
  const result = await runComplianceMarking(
    { ...makeRequest(), inputBytes: samplePng },
    { sink, env: prodEnv(), ownerId: "user-1" },
  );
  assert.equal(result.gate.decision, "failed");
  assert.equal(result.gate.blockingCode, "compliance_record_write_failed");
  assert.equal(result.output, undefined);
});

test("gate: unknown extension blocks with unsupported_format", async () => {
  const { gate } = await runGateCase({ requestOverrides: { inputPath: "clip.mov2", outputPath: "clip.mov2" } });
  assert.equal(gate.decision, "blocked");
  assert.equal(gate.blockingCode, "unsupported_format");
});

// ---------------------------------------------------------------------------
// 12. end-to-end adapter runs for the six PRD §2.7 acceptance kinds
// ---------------------------------------------------------------------------

const ACCEPTANCE_CASES = [
  { name: "png image", inputPath: "shot.png", contentKind: "image", bytes: () => samplePng },
  { name: "jpg image", inputPath: "shot.jpg", contentKind: "image", bytes: () => sampleJpg },
  { name: "mp4 video", inputPath: "clip.mp4", contentKind: "video", bytes: makeMinimalMp4 },
  { name: "wav audio", inputPath: "tone.wav", contentKind: "audio", bytes: () => sampleWav },
  {
    name: "pdf document",
    inputPath: "script.pdf",
    contentKind: "document",
    bytes: async () => {
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.create();
      doc.addPage([200, 100]).drawText("fixture");
      return new Uint8Array(await doc.save());
    },
  },
  {
    name: "srt text + sidecar",
    inputPath: "ep1.srt",
    contentKind: "text",
    bytes: () => new TextEncoder().encode("1\n00:00:01,000 --> 00:00:02,000\n你好\n"),
  },
];

for (const acceptance of ACCEPTANCE_CASES) {
  test(`e2e: ${acceptance.name} marks, verifies and audits`, async () => {
    const sink = createMemorySink();
    const inputBytes = await acceptance.bytes();
    const result = await runComplianceMarking(
      {
        ...makeRequest({
          contentKind: acceptance.contentKind,
          inputPath: acceptance.inputPath,
          outputPath: acceptance.inputPath,
        }),
        inputBytes,
        extra: { createdAt: FIXED_TIME },
      },
      { sink, env: prodEnv(), ownerId: "user-1" },
    );
    assert.equal(result.gate.decision, "allowed", JSON.stringify(result.gate.steps));
    assert.equal(result.marking.success, true);
    assert.ok(result.marking.machineReadableFormats.length > 0);
    assert.match(result.marking.metadataHash, /^[0-9a-f]{64}$/);
    assert.equal(result.marking.verificationReport.verified, true);
    assert.ok(!result.marking.machineReadableFormats.includes("c2pa"));
    assert.ok(result.output.bytes.byteLength > 0);

    assert.equal(sink.labelRows.length, 1);
    assert.equal(sink.labelRows[0].status, "verified");
    assert.equal(sink.labelRows[0].metadata_hash, result.marking.metadataHash);
    assert.deepEqual(sink.labelRows[0].machine_readable_formats, result.marking.machineReadableFormats);
    assert.equal(sink.runRows.length, 1);
    assert.equal(sink.runRows[0].decision, "allowed");
    assert.equal(sink.runRows[0].label_record_id, sink.labelRows[0].id);
    assert.equal(sink.runRows[0].gate_steps_json.at(-1).step, "allow_download");
    assert.equal(sink.runRows[0].gate_steps_json.at(-1).status, "ok");
  });
}

// ---------------------------------------------------------------------------
// 13. determinism (hash stability)
// ---------------------------------------------------------------------------

test("determinism: same input + fixed manifest yields identical png/mp4 bytes", () => {
  const manifest = makeManifest({ contentKind: "video", inputPath: "clip.mp4", outputPath: "clip.mp4" });
  const mp4 = makeMinimalMp4();
  assert.deepEqual(writeMp4(mp4, manifest, makeRequest()).outputBytes, writeMp4(mp4, manifest, makeRequest()).outputBytes);

  const pngManifest = makeManifest();
  const firstPng = writePng(samplePng, pngManifest, makeRequest());
  const secondPng = writePng(samplePng, pngManifest, makeRequest());
  assert.deepEqual(firstPng.outputBytes, secondPng.outputBytes);
  assert.equal(computeMetadataHash(pngManifest), computeMetadataHash(makeManifest()));
});
