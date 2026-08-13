#!/usr/bin/env node
/**
 * KIIKIS 2.1 Phase 2 — 动态宫格分镜导出包校验脚本 (Task 2.8)
 *
 * 用法：
 *   node scripts/verify-dynamic-grid-package.mjs <exported-package.zip>
 *
 * 校验内容 (PRD §10.3 fail-closed)：
 *   1. ZIP 可读，含 5 个必需文件 (team-markdown.md / storyboard.json / frames.csv / README.md / manifest.json)
 *   2. manifest.json 中每个 entry 的 SHA-256 与实际文件字节一致
 *   3. team-markdown.md 字段顺序固定 (镜头编号 → 时间点 → 人物 → 台词 → 情绪 → 动作 → 运镜)
 *   4. frames.csv 列顺序固定 (SceneId → ... → UserEdited)，CRLF 行尾
 *   5. storyboard.json 不含时间戳字段 (exportedAt/createdAt)
 *   6. dialogue 不出现在 visualDescription 字段 (不烧录画面)
 *
 * 退出码：0 = 全部通过；1 = 校验失败。
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { argv, exit, stderr } from "node:process";

// JSZip 通过动态 import 加载，缺失时给出明确错误
let JSZip;
try {
  const mod = await import("jszip");
  JSZip = mod.default;
} catch {
  stderr.write("✗ 缺少 jszip 依赖。请在项目根目录运行 `pnpm install` 后重试。\n");
  exit(1);
}

const REQUIRED_FILES = [
  "team-markdown.md",
  "storyboard.json",
  "frames.csv",
  "README.md",
  "manifest.json",
];

const EXPECTED_CSV_COLUMNS = [
  "SceneId",
  "ContinuityMode",
  "GridCount",
  "FrameOrder",
  "Timecode",
  "CharacterIds",
  "Dialogue",
  "Emotion",
  "Action",
  "CameraMovement",
  "ShotSize",
  "VisualDescription",
  "Locked",
  "UserEdited",
];

function fail(msg) {
  stderr.write(`✗ ${msg}\n`);
  exit(1);
}

function ok(msg) {
  console.log(`✔ ${msg}`);
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main() {
  const zipPath = argv[2];
  if (!zipPath) {
    stderr.write("用法: node scripts/verify-dynamic-grid-package.mjs <exported-package.zip>\n");
    exit(1);
  }

  let zipBuf;
  try {
    zipBuf = readFileSync(zipPath);
  } catch (err) {
    fail(`无法读取文件 ${zipPath}: ${err.message}`);
  }

  let zip;
  try {
    zip = await JSZip.loadAsync(zipBuf);
  } catch (err) {
    fail(`无法解压 ZIP: ${err.message}`);
  }

  // 1. 必需文件存在
  for (const name of REQUIRED_FILES) {
    if (!zip.file(name)) {
      fail(`ZIP 缺少必需文件: ${name}`);
    }
  }
  ok(`ZIP 含全部 ${REQUIRED_FILES.length} 个必需文件`);

  // 2. 读取 manifest.json + 校验 SHA-256
  const manifestFile = zip.file("manifest.json");
  const manifestText = await manifestFile.async("string");
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch (err) {
    fail(`manifest.json 不是合法 JSON: ${err.message}`);
  }

  if (!Array.isArray(manifest.entries)) {
    fail("manifest.json 缺少 entries 数组");
  }

  for (const entry of manifest.entries) {
    const file = zip.file(entry.path);
    if (!file) {
      fail(`manifest 引用的文件在 ZIP 中不存在: ${entry.path}`);
    }
    const bytes = new Uint8Array(await file.async("uint8array"));
    const actualSha = sha256Hex(bytes);
    if (actualSha !== entry.sha256) {
      fail(
        `SHA-256 不匹配: ${entry.path}\n  manifest: ${entry.sha256}\n  actual:   ${actualSha}`,
      );
    }
    if (bytes.byteLength !== entry.bytes) {
      fail(`字节数不匹配: ${entry.path} (manifest=${entry.bytes}, actual=${bytes.byteLength})`);
    }
  }
  ok(`manifest.entries 全部 ${manifest.entries.length} 个文件 SHA-256 + 字节数校验通过`);

  // 3. team-markdown.md 字段顺序
  const mdText = await zip.file("team-markdown.md").async("string");
  // 找一个 frame 章节，检查字段顺序
  const frameSection = mdText.match(/### #\d+ \| [\d:]+\n([\s\S]*?)(?=\n###|\n---|\n## )/);
  if (!frameSection) {
    fail("team-markdown.md 未找到 frame 章节 (### #N | timecode)");
  }
  const frameLines = frameSection[1]
    .split("\n")
    .filter((l) => l.startsWith("- "))
    .map((l) => l.replace(/^- ([^：]+)：.*/, "$1"));
  const expectedFrameFields = ["人物", "台词", "情绪", "动作", "运镜", "景别", "画面", "锁定", "人工编辑"];
  // 至少前 5 个字段顺序固定 (人物 → 台词 → 情绪 → 动作 → 运镜)
  const firstFive = frameLines.slice(0, 5);
  const expectedFirstFive = expectedFrameFields.slice(0, 5);
  if (JSON.stringify(firstFive) !== JSON.stringify(expectedFirstFive)) {
    fail(
      `team-markdown.md frame 字段顺序错误\n  expected: ${JSON.stringify(expectedFirstFive)}\n  actual:   ${JSON.stringify(firstFive)}`,
    );
  }
  ok("team-markdown.md frame 字段顺序正确 (人物 → 台词 → 情绪 → 动作 → 运镜)");

  // 4. frames.csv 列顺序 + CRLF
  const csvText = await zip.file("frames.csv").async("string");
  if (!csvText.includes("\r\n")) {
    fail("frames.csv 未使用 CRLF 行尾");
  }
  const csvHeader = csvText.split("\r\n")[0].split(",");
  if (JSON.stringify(csvHeader) !== JSON.stringify(EXPECTED_CSV_COLUMNS)) {
    fail(
      `frames.csv 列顺序错误\n  expected: ${JSON.stringify(EXPECTED_CSV_COLUMNS)}\n  actual:   ${JSON.stringify(csvHeader)}`,
    );
  }
  ok("frames.csv 列顺序正确 + CRLF 行尾");

  // 5. storyboard.json 不含时间戳字段
  const jsonText = await zip.file("storyboard.json").async("string");
  if (jsonText.includes("exportedAt") || jsonText.includes("createdAt")) {
    fail("storyboard.json 含时间戳字段 (exportedAt/createdAt)，破坏确定性");
  }
  let storyboardJson;
  try {
    storyboardJson = JSON.parse(jsonText);
  } catch (err) {
    fail(`storyboard.json 不是合法 JSON: ${err.message}`);
  }
  if (storyboardJson.schemaVersion !== "kiikis.dynamic-grid-storyboard/1") {
    fail(`storyboard.json schemaVersion 错误: ${storyboardJson.schemaVersion}`);
  }
  ok("storyboard.json 无时间戳字段 + schemaVersion 正确");

  // 6. dialogue 不出现在 visualDescription (不烧录画面)
  for (const scene of storyboardJson.scenes || []) {
    for (const frame of scene.frames || []) {
      if (frame.dialogue && frame.visualDescription) {
        if (frame.visualDescription.includes(frame.dialogue)) {
          fail(
            `dialogue 烧录到 visualDescription (frame ${frame.id}): "${frame.dialogue}"`,
          );
        }
      }
    }
  }
  ok("dialogue 未烧录到 visualDescription (画面纯视觉)");

  // 总结
  console.log("");
  console.log("==========================================");
  console.log(`✔ 动态宫格分镜导出包校验通过: ${zipPath}`);
  console.log(`  - 场景数: ${manifest.sceneCount ?? storyboardJson.scenes?.length ?? "?"}`);
  console.log(`  - 镜头总数: ${manifest.frameCount ?? "?"}`);
  console.log(`  - 文件数: ${manifest.entries.length}`);
  console.log(`  - 导出时间: ${manifest.exportedAt ?? "—"}`);
  console.log("==========================================");
  exit(0);
}

main().catch((err) => {
  stderr.write(`✗ 校验脚本异常: ${err.message}\n`);
  exit(1);
});
