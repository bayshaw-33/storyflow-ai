/**
 * Sprint 0 合规验收脚本（PRD §2.7 / T+36h）
 *
 * 对六类样例（PNG / JPG / MP4 / WAV / PDF / SRT+sidecar）跑真实生产代码路径
 * （runComplianceMarking → writer → verifier → gate），输出：
 *   outputs/compliance-acceptance/<case>/marked.<ext>      标识后文件
 *   outputs/compliance-acceptance/<case>/manifest.json    元数据 dump
 *   outputs/compliance-acceptance/<case>/verification.json 验证报告
 *   outputs/compliance-acceptance/<case>/records.json     合规记录（label + run）
 *   outputs/compliance-acceptance/summary.md / summary.json
 *
 * 用法：node scripts/compliance-acceptance.mjs
 * 说明：使用 memory sink（不连数据库）；真实库记录需在迁移应用后通过 API 验收。
 */

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { runComplianceMarking } from "../lib/compliance/adapter.ts";
import { createMemorySink } from "../lib/compliance/log-writer.ts";
import { sha256Hex } from "../lib/compliance/manifest.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "outputs", "compliance-acceptance");
const FIXTURES = path.join(ROOT, "tests", "fixtures");

const PROD_LIKE_ENV = {
  NODE_ENV: "production",
  COMPLIANCE_EXPORT_GATE: "true",
  EU_ART50_MACHINE_MARKING: "true",
  EU_ART50_STRICT_EXPORT_BLOCK: "true",
  CN_AIGC_MACHINE_MARKING: "true",
  CN_AIGC_STRICT_EXPORT_BLOCK: "true",
  DUAL_JURISDICTION_MARKING: "true",
};

function minimalMp4() {
  const box = (type, payload) => {
    const size = 8 + payload.length;
    const buf = new Uint8Array(size);
    new DataView(buf.buffer).setUint32(0, size);
    buf.set(new TextEncoder().encode(type), 4);
    buf.set(payload, 8);
    return buf;
  };
  const ftypPayload = new Uint8Array([0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 1, 0x69, 0x73, 0x6f, 0x6d]); // "isom" v1 + "isom"
  const ftyp = box("ftyp", ftypPayload);
  const mdat = box("mdat", new Uint8Array([0, 1, 2, 3]));
  const out = new Uint8Array(ftyp.length + mdat.length);
  out.set(ftyp, 0);
  out.set(mdat, ftyp.length);
  return out;
}

async function samplePdf() {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.create({ updateMetadata: false });
  const page = doc.addPage([420, 595]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("KIIKIS compliance acceptance sample", { x: 40, y: 520, size: 12, font });
  return new Uint8Array(await doc.save());
}

function baseRequest(overrides) {
  return {
    assetId: "acceptance-asset-001",
    assetVersionId: "v1",
    jurisdictionProfile: "EU_CN_DUAL",
    aiGenerated: true,
    aiModified: false,
    providerCode: "KIIKIS",
    contentId: "acceptance-content-001",
    modelProvider: "MiniMax",
    modelName: "video-01",
    modelVersion: "2026-07",
    projectId: "acceptance-project",
    episodeId: "ep01",
    visibleDisclosureMode: "ui",
    ...overrides,
  };
}

const cases = [
  {
    name: "png",
    file: "sample.png",
    input: () => readFile(path.join(FIXTURES, "sample.png")),
    request: baseRequest({ contentKind: "image", inputPath: "sample.png", outputPath: "sample.png" }),
  },
  {
    name: "jpg",
    file: "sample.jpg",
    input: () => readFile(path.join(FIXTURES, "sample.jpg")),
    request: baseRequest({ contentKind: "image", inputPath: "sample.jpg", outputPath: "sample.jpg" }),
  },
  {
    name: "mp4",
    file: "sample.mp4",
    input: async () => minimalMp4(),
    request: baseRequest({ contentKind: "video", inputPath: "sample.mp4", outputPath: "sample.mp4" }),
  },
  {
    name: "wav",
    file: "sample.wav",
    input: () => readFile(path.join(FIXTURES, "sample.wav")),
    request: baseRequest({ contentKind: "audio", inputPath: "sample.wav", outputPath: "sample.wav" }),
  },
  {
    name: "pdf",
    file: "sample.pdf",
    input: samplePdf,
    request: baseRequest({ contentKind: "document", inputPath: "sample.pdf", outputPath: "sample.pdf" }),
  },
  {
    name: "srt",
    file: "sample.srt",
    input: async () => new TextEncoder().encode("1\n00:00:01,000 --> 00:00:02,500\n你好，世界。\n\n"),
    request: baseRequest({ contentKind: "text", inputPath: "sample.srt", outputPath: "sample.srt" }),
  },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const summary = [];

  for (const c of cases) {
    const sink = createMemorySink();
    const inputBytes = new Uint8Array(await c.input());
    const result = await runComplianceMarking({ ...c.request, inputBytes }, {
      sink,
      env: PROD_LIKE_ENV,
      ownerId: "acceptance-user",
    });

    const caseDir = path.join(OUT, c.name);
    await mkdir(caseDir, { recursive: true });

    assert.equal(result.gate.decision, "allowed", `${c.name}: gate should allow`);
    assert.equal(result.marking?.success, true, `${c.name}: marking should succeed`);
    assert.ok(result.marking && /^[0-9a-f]{64}$/.test(result.marking.metadataHash), `${c.name}: metadataHash sha256 hex`);
    assert.ok(result.output, `${c.name}: output present`);
    assert.ok((result.marking?.machineReadableFormats ?? []).length > 0, `${c.name}: machine formats non-empty`);
    const verification = result.marking?.verificationReport ?? {};
    assert.equal(verification.verified, true, `${c.name}: verification passed`);
    assert.equal(verification.hash_match, true, `${c.name}: extracted manifest hash matches`);

    await writeFile(path.join(caseDir, `marked${path.extname(c.file)}`), result.output.bytes);
    if (result.output.sidecarBytes) {
      await writeFile(path.join(caseDir, `${c.file}.ai-manifest.json`), result.output.sidecarBytes);
    }
    const manifestDump = {
      case: c.name,
      metadata_hash: result.marking?.metadataHash,
      output_sha256: sha256Hex(result.output.bytes),
      output_bytes: result.output.bytes.byteLength,
      machine_readable_formats: result.marking?.machineReadableFormats,
      extracted_manifest: verification.extracted_manifest ?? null,
      disclosure: result.disclosure ?? null,
    };
    await writeFile(path.join(caseDir, "manifest.json"), JSON.stringify(manifestDump, null, 2));
    await writeFile(path.join(caseDir, "verification.json"), JSON.stringify(verification, null, 2));
    await writeFile(
      path.join(caseDir, "records.json"),
      JSON.stringify({ label_records: sink.labelRows, compliance_runs: sink.runRows }, null, 2),
    );

    summary.push({
      case: c.name,
      decision: result.gate.decision,
      marking_success: result.marking?.success,
      verified: verification.verified,
      hash_match: verification.hash_match,
      metadata_hash: result.marking?.metadataHash,
      output_sha256: manifestDump.output_sha256,
      machine_readable_formats: result.marking?.machineReadableFormats,
      label_records: sink.labelRows.length,
      run_records: sink.runRows.length,
    });
    console.log(`PASS ${c.name}: verified=${verification.verified} hash=${result.marking?.metadataHash?.slice(0, 12)}… formats=${(result.marking?.machineReadableFormats ?? []).join("+")}`);
  }

  // failure-path 1：损坏 PNG → 必须 fail（machine_marking_failed），不允许下载
  {
    const sink = createMemorySink();
    const good = new Uint8Array(await readFile(path.join(FIXTURES, "sample.png")));
    const corrupt = good.slice(0, 24);
    const result = await runComplianceMarking(
      { ...cases[0].request, inputBytes: corrupt },
      { sink, env: PROD_LIKE_ENV, ownerId: "acceptance-user" },
    );
    assert.equal(result.gate.decision, "failed");
    assert.equal(result.gate.blockingCode, "machine_marking_failed");
    assert.equal(result.output, undefined, "failed export must not produce a download");
    await mkdir(path.join(OUT, "failure-path"), { recursive: true });
    await writeFile(
      path.join(OUT, "failure-path", "corrupt-png.json"),
      JSON.stringify({ decision: result.gate.decision, blocking_code: result.gate.blockingCode, steps: result.gate.steps }, null, 2),
    );
    summary.push({ case: "failure-path-corrupt-png", decision: "failed", blocking_code: "machine_marking_failed", download: "none (fail-closed)" });
    console.log("PASS failure-path: corrupt png fail-closed (machine_marking_failed)");
  }

  // failure-path 2：缺法域 → blocked jurisdiction_missing
  {
    const sink = createMemorySink();
    const inputBytes = new Uint8Array(await readFile(path.join(FIXTURES, "sample.png")));
    const result = await runComplianceMarking(
      { ...cases[0].request, jurisdictionProfile: "", inputBytes },
      { sink, env: PROD_LIKE_ENV, ownerId: "acceptance-user" },
    );
    assert.equal(result.gate.decision, "blocked");
    assert.equal(result.gate.blockingCode, "jurisdiction_missing");
    assert.equal(result.output, undefined);
    await writeFile(
      path.join(OUT, "failure-path", "missing-jurisdiction.json"),
      JSON.stringify({ decision: result.gate.decision, blocking_code: result.gate.blockingCode, steps: result.gate.steps }, null, 2),
    );
    summary.push({ case: "failure-path-missing-jurisdiction", decision: "blocked", blocking_code: "jurisdiction_missing", download: "none (fail-closed)" });
    console.log("PASS failure-path: missing jurisdiction blocked");
  }

  await writeFile(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
  const md = [
    "# Sprint 0 合规验收摘要（本地流水线，memory sink）",
    "",
    `时间：${new Date().toISOString()}`,
    "",
    "| 样例 | Gate 决定 | 标识 | 验证 | hash 匹配 | 机器可读格式 |",
    "|---|---|---|---|---|---|",
    ...summary.map((s) =>
      s.machine_readable_formats
        ? `| ${s.case} | ${s.decision} | ${s.marking_success} | ${s.verified} | ${s.hash_match} | ${s.machine_readable_formats.join(" + ")} |`
        : `| ${s.case} | ${s.decision} | - | - | - | ${s.blocking_code} |`,
    ),
    "",
    "说明：本地验收使用 memory sink，不接触远程数据库；真实 storyflow_ai_label_records /",
    "storyflow_export_compliance_runs 记录需在迁移应用到 Supabase 后通过 POST /api/compliance/export 验收。",
  ].join("\n");
  await writeFile(path.join(OUT, "summary.md"), md);
  console.log(`\n全部完成：${summary.length} 个用例 → ${OUT}`);
}

main().catch((error) => {
  console.error("ACCEPTANCE FAILED:", error);
  process.exit(1);
});
