/**
 * tests/dynamic-grid-export.test.mjs
 * KIIKIS 2.1 Phase 2 — Task 2.7 确定性导出测试
 *
 * 验证：
 *   - renderTeamMarkdown 同一输入字节级输出相同
 *   - 字段顺序固定（镜头编号、时间点、人物名、台词、情绪、动作、运镜说明）
 *   - exportDynamicGridJson / Csv 确定性
 *   - buildDynamicGridPackage 三个核心文件字节级稳定
 *   - 与 tests/fixtures/kiikis-21/expected-dynamic-grid.md 字节一致
 *   - export-package.ts 单一入口 re-export 可用
 *   - dialogue 不烧录画面（仅出现在台词字段，不在 visualDescription）
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  renderTeamMarkdown,
  renderFrameMarkdown,
  renderSceneMarkdown,
} from "../lib/storyboard/render-team-markdown.ts";
import {
  exportDynamicGridJson,
  exportDynamicGridCsv,
  buildDynamicGridPackage,
  buildDynamicGridReadme,
  DYNAMIC_GRID_CSV_COLUMNS,
  sha256Hex,
} from "../lib/storyboard/export-dynamic-grid.ts";
import { parseDynamicGridScene } from "../lib/storyboard/dynamic-grid-contract.ts";

// export-package.ts 顶层 import JSZip，在 jszip 未安装时静态导入会失败。
// 改为动态导入，缺失时跳过 re-export 验证。
let reExportedBuild = null;
let reExportedRender = null;
let exportPackageAvailable = false;
try {
  const mod = await import("../lib/storyboard/export-package.ts");
  reExportedBuild = mod.buildDynamicGridPackage;
  reExportedRender = mod.renderTeamMarkdown;
  exportPackageAvailable = true;
} catch {
  exportPackageAvailable = false;
}

const FIXTURE_DIR = path.join(process.cwd(), "tests/fixtures/kiikis-21");
const INPUT_PATH = path.join(FIXTURE_DIR, "dynamic-grid-input.json");
const EXPECTED_MD_PATH = path.join(FIXTURE_DIR, "expected-dynamic-grid.md");

function loadFixtureScenes() {
  const raw = JSON.parse(fs.readFileSync(INPUT_PATH, "utf-8"));
  return {
    projectTitle: raw.projectTitle,
    handoffId: raw.handoffId,
    scenes: raw.scenes.map((s) => parseDynamicGridScene(s)),
  };
}

// ============================================================
// 1. renderTeamMarkdown 字节级确定性
// ============================================================

test("renderTeamMarkdown — 同一输入两次渲染字节相同", () => {
  const f = loadFixtureScenes();
  const a = renderTeamMarkdown({ scenes: f.scenes, projectTitle: f.projectTitle, handoffId: f.handoffId });
  const b = renderTeamMarkdown({ scenes: f.scenes, projectTitle: f.projectTitle, handoffId: f.handoffId });
  assert.equal(a, b);
});

test("renderTeamMarkdown — structuredClone 后字节相同 (无引用可变性)", () => {
  const f = loadFixtureScenes();
  const a = renderTeamMarkdown({ scenes: f.scenes, projectTitle: f.projectTitle, handoffId: f.handoffId });
  const clonedScenes = structuredClone(f.scenes);
  const b = renderTeamMarkdown({ scenes: clonedScenes, projectTitle: f.projectTitle, handoffId: f.handoffId });
  assert.equal(a, b);
});

test("renderTeamMarkdown — 与 expected-dynamic-grid.md fixture 字节一致", () => {
  const f = loadFixtureScenes();
  const actual = renderTeamMarkdown({ scenes: f.scenes, projectTitle: f.projectTitle, handoffId: f.handoffId });
  const expected = fs.readFileSync(EXPECTED_MD_PATH, "utf-8");
  assert.equal(actual, expected);
});

test("renderTeamMarkdown — 不同输入产生不同输出 (差异捕获)", () => {
  const f = loadFixtureScenes();
  const a = renderTeamMarkdown({ scenes: f.scenes, projectTitle: f.projectTitle, handoffId: f.handoffId });
  // 改 projectTitle
  const b = renderTeamMarkdown({ scenes: f.scenes, projectTitle: "改过的标题", handoffId: f.handoffId });
  assert.notEqual(a, b);
});

test("renderTeamMarkdown — 文档以单个 \\n 结尾 (无 trailing whitespace)", () => {
  const f = loadFixtureScenes();
  const md = renderTeamMarkdown({ scenes: f.scenes, projectTitle: f.projectTitle, handoffId: f.handoffId });
  assert.ok(md.endsWith("\n"), "必须以 \\n 结尾");
  assert.ok(!md.endsWith("\n\n"), "不能以多个 \\n 结尾");
  // 检查任意行尾无空格/tab
  assert.ok(!/[ \t]+$/m.test(md), "行尾不能有空白 (space/tab)");
});

// ============================================================
// 2. 字段顺序契约
// ============================================================

test("renderFrameMarkdown — 字段顺序：镜头编号 → 时间点 → 人物 → 台词 → 情绪 → 动作 → 运镜", () => {
  const f = loadFixtureScenes();
  const frame = f.scenes[0].frames[1]; // 含 dialogue 的帧
  const md = renderFrameMarkdown(frame);
  const lines = md.split("\n");
  // ### #2 | 00:00:04  (编号 + 时间点)
  assert.match(lines[0], /^### #2 \| 00:00:04$/);
  // 后续字段顺序
  const fieldOrder = lines.filter((l) => l.startsWith("- ")).map((l) => l.replace(/^- ([^：]+)：.*/, "$1"));
  assert.deepEqual(
    fieldOrder,
    ["人物", "台词", "情绪", "动作", "运镜", "景别", "画面", "锁定", "人工编辑"],
    `字段顺序错误: ${JSON.stringify(fieldOrder)}`,
  );
});

test("renderSceneMarkdown — 场景元数据顺序：连续性 → 格数 → 理由 → 轴线 → 入口 → 屏幕方向 → 共享摄影 → Negative Prompt", () => {
  const f = loadFixtureScenes();
  const md = renderSceneMarkdown(f.scenes[0]);
  const metaFields = md
    .split("\n")
    .filter((l) => l.startsWith("- "))
    .map((l) => l.replace(/^- ([^：]+)：.*/, "$1"))
    .slice(0, 8);
  assert.deepEqual(
    metaFields,
    ["连续性", "格数", "理由", "轴线", "入口", "屏幕方向", "共享摄影", "Negative Prompt"],
  );
});

test("dialogue 出现在台词字段，不出现在 visualDescription (不烧录画面)", () => {
  const f = loadFixtureScenes();
  for (const scene of f.scenes) {
    for (const frame of scene.frames) {
      if (frame.dialogue) {
        const md = renderFrameMarkdown(frame);
        // dialogue 必须出现在 "- 台词：" 行
        assert.ok(md.includes(`- 台词：${frame.dialogue}`));
        // dialogue 不得出现在 visualDescription 字段
        const visualLine = md.split("\n").find((l) => l.startsWith("- 画面："));
        assert.ok(visualLine);
        assert.ok(!visualLine.includes(frame.dialogue), "dialogue 不得烧录到画面字段");
      }
    }
  }
});

// ============================================================
// 3. JSON / CSV 确定性
// ============================================================

test("exportDynamicGridJson — 同一输入字节相同", () => {
  const f = loadFixtureScenes();
  const a = exportDynamicGridJson(f.scenes);
  const b = exportDynamicGridJson(structuredClone(f.scenes));
  assert.equal(a, b);
});

test("exportDynamicGridJson — 不含时间戳 / 随机源", () => {
  const f = loadFixtureScenes();
  const json = exportDynamicGridJson(f.scenes);
  assert.ok(!json.includes("exportedAt"), "JSON 不得含 exportedAt (会破坏确定性)");
  assert.ok(!json.includes("createdAt"));
});

test("exportDynamicGridJson — scene/frame 字段顺序固定 (首字段为 schemaVersion / id)", () => {
  const f = loadFixtureScenes();
  const json = exportDynamicGridJson(f.scenes);
  const parsed = JSON.parse(json);
  assert.equal(parsed.scenes[0].schemaVersion, "kiikis.dynamic-grid-storyboard/1");
  // frame 首字段为 id (PRD 字段顺序：编号 id/order, 时间点 timecode)
  assert.equal(Object.keys(parsed.scenes[0].frames[0])[0], "id");
  assert.equal(Object.keys(parsed.scenes[0].frames[0])[3], "timecode");
});

test("exportDynamicGridCsv — 同一输入字节相同 (CRLF 行尾)", () => {
  const f = loadFixtureScenes();
  const a = exportDynamicGridCsv(f.scenes);
  const b = exportDynamicGridCsv(structuredClone(f.scenes));
  assert.equal(a, b);
  assert.ok(a.includes("\r\n"), "CSV 必须使用 CRLF 行尾");
});

test("exportDynamicGridCsv — 列顺序固定 (SceneId → ContinuityMode → ... → UserEdited)", () => {
  const f = loadFixtureScenes();
  const csv = exportDynamicGridCsv(f.scenes);
  const header = csv.split("\r\n")[0].split(",");
  assert.deepEqual(header, [...DYNAMIC_GRID_CSV_COLUMNS]);
});

test("exportDynamicGridCsv — 一行一个 frame (含 10 帧)", () => {
  const f = loadFixtureScenes();
  const csv = exportDynamicGridCsv(f.scenes);
  const rows = csv.split("\r\n").filter((r) => r.length > 0);
  assert.equal(rows.length, 1 + 10); // header + 10 frames
});

// ============================================================
// 4. ZIP 生产包 (jszip 未安装时跳过)
// ============================================================

let jszipAvailable = false;
try {
  await import("jszip");
  jszipAvailable = true;
} catch {
  jszipAvailable = false;
}

test("buildDynamicGridPackage — 三个核心文件字节级稳定 (markdown/json/csv)", { skip: !jszipAvailable }, async () => {
  const f = loadFixtureScenes();
  const a = await buildDynamicGridPackage({
    scenes: f.scenes,
    projectTitle: f.projectTitle,
    handoffId: f.handoffId,
    exportedAt: "2026-08-13T00:00:00.000Z",
  });
  const b = await buildDynamicGridPackage({
    scenes: f.scenes,
    projectTitle: f.projectTitle,
    handoffId: f.handoffId,
    exportedAt: "2026-08-14T00:00:00.000Z", // 不同时间戳
  });
  assert.equal(a.markdown, b.markdown, "markdown 不应受 exportedAt 影响");
  assert.equal(a.json, b.json, "json 不应受 exportedAt 影响");
  assert.equal(a.csv, b.csv, "csv 不应受 exportedAt 影响");
});

test("buildDynamicGridPackage — manifest 含所有 5 个文件 entry + SHA-256", { skip: !jszipAvailable }, async () => {
  const f = loadFixtureScenes();
  const bundle = await buildDynamicGridPackage({
    scenes: f.scenes,
    projectTitle: f.projectTitle,
    handoffId: f.handoffId,
    exportedAt: "2026-08-13T00:00:00.000Z",
  });
  assert.equal(bundle.entries.length, 5);
  const paths = bundle.entries.map((e) => e.path);
  assert.deepEqual(paths, [
    "team-markdown.md",
    "storyboard.json",
    "frames.csv",
    "README.md",
    "manifest.json",
  ]);
  for (const e of bundle.entries) {
    assert.equal(e.sha256.length, 64);
    assert.ok(e.bytes > 0);
  }
});

test("buildDynamicGridPackage — manifest.entries SHA-256 与实际文件一致", { skip: !jszipAvailable }, async () => {
  const f = loadFixtureScenes();
  const bundle = await buildDynamicGridPackage({
    scenes: f.scenes,
    projectTitle: f.projectTitle,
    handoffId: f.handoffId,
    exportedAt: "2026-08-13T00:00:00.000Z",
  });
  const mdEntry = bundle.entries.find((e) => e.path === "team-markdown.md");
  assert.equal(mdEntry.sha256, sha256Hex(new TextEncoder().encode(bundle.markdown)));
  const csvEntry = bundle.entries.find((e) => e.path === "frames.csv");
  assert.equal(csvEntry.sha256, sha256Hex(new TextEncoder().encode(bundle.csv)));
});

test("buildDynamicGridPackage — ZIP 字节非空", { skip: !jszipAvailable }, async () => {
  const f = loadFixtureScenes();
  const bundle = await buildDynamicGridPackage({
    scenes: f.scenes,
    projectTitle: f.projectTitle,
    handoffId: f.handoffId,
    exportedAt: "2026-08-13T00:00:00.000Z",
  });
  assert.ok(bundle.zipBytes.byteLength > 1000, "ZIP 应至少 1KB");
});

test("buildDynamicGridReadme — 含项目标题 + handoff + 字段顺序说明", () => {
  const readme = buildDynamicGridReadme({
    projectTitle: "测试项目",
    handoffId: "handoff-test",
    sceneCount: 2,
    frameCount: 10,
    exportedAt: "2026-08-13T00:00:00.000Z",
  });
  assert.match(readme, /# 测试项目 — 动态宫格分镜生产包/);
  assert.match(readme, /Handoff ID：handoff-test/);
  assert.match(readme, /镜头编号 → 时间点 → 人物名 → 台词 → 情绪 → 动作 → 运镜说明/);
  assert.match(readme, /dialogue translation 保留为后期字段/);
});

// ============================================================
// 5. export-package.ts 单一入口 re-export
// ============================================================

test("export-package.ts re-export — buildDynamicGridPackage 与原模块同引用", { skip: !exportPackageAvailable }, () => {
  assert.equal(reExportedBuild, buildDynamicGridPackage);
});

test("export-package.ts re-export — renderTeamMarkdown 与原模块同引用", { skip: !exportPackageAvailable }, () => {
  assert.equal(reExportedRender, renderTeamMarkdown);
});

test("export-package.ts re-export — 可直接构建 ZIP (端到端)", { skip: !exportPackageAvailable || !jszipAvailable }, async () => {
  const f = loadFixtureScenes();
  const bundle = await reExportedBuild({
    scenes: f.scenes,
    projectTitle: f.projectTitle,
    handoffId: f.handoffId,
    exportedAt: "2026-08-13T00:00:00.000Z",
  });
  assert.ok(bundle.zipBytes.byteLength > 0);
  assert.ok(bundle.markdown.length > 0);
});

// ============================================================
// 6. fixture 文件存在性
// ============================================================

test("fixture 文件存在 — dynamic-grid-input.json + expected-dynamic-grid.md", () => {
  assert.ok(fs.existsSync(INPUT_PATH), "input fixture 缺失");
  assert.ok(fs.existsSync(EXPECTED_MD_PATH), "expected markdown fixture 缺失");
});
