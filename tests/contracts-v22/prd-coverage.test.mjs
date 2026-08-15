/**
 * Phase 6 Task 6.1 — PRD 覆盖审计 (RED→GREEN).
 *
 * Verifies:
 *   - 覆盖表 JSON 可解析、schema 版本正确
 *   - PRD 全部 48 个验收 ID 都有映射（与 audit 脚本同一数据源）
 *   - 每个映射的测试文件真实存在
 *   - 无重复 ID、无伪造 ID
 *
 * Run: node --test tests/contracts-v22/prd-coverage.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const PRD_PATH = resolve(root, "docs/kiikis-2.2/KIIKIS-2.2-总PRD-v1.0.md");
const COVERAGE_PATH = resolve(root, "scripts/kiikis22-coverage.json");

const ID_PATTERN = /\b(K22-G\d+|ENTRY-\d+|JOB-\d+|SW-\d+|UNI-\d+|IMP-\d+|SONG-\d+|MKT-\d+)\b/g;

test("覆盖表 JSON 可解析且 schema 正确", () => {
  const coverage = JSON.parse(readFileSync(COVERAGE_PATH, "utf8"));
  assert.equal(coverage.schemaVersion, "kiikis22.coverage/1");
  assert.ok(coverage.prdPath.includes("总PRD"));
});

test("PRD 全部验收 ID 都映射到测试文件，文件存在", () => {
  const prd = readFileSync(PRD_PATH, "utf8");
  const prdIds = [...new Set(prd.match(ID_PATTERN) ?? [])].sort();
  assert.ok(prdIds.length >= 40, `PRD 至少 40 个验收 ID（实际 ${prdIds.length}）`);

  const coverage = JSON.parse(readFileSync(COVERAGE_PATH, "utf8"));
  const covered = new Set();
  for (const group of Object.values(coverage.groups)) {
    for (const [id, files] of Object.entries(group.ids)) {
      covered.add(id);
      assert.ok(files.length > 0, `${id} 有测试文件`);
      for (const file of files) {
        assert.ok(existsSync(resolve(root, file)), `${id} → 文件存在: ${file}`);
      }
    }
  }
  // PRD 的每个 ID 都必须被覆盖
  for (const id of prdIds) {
    assert.ok(covered.has(id), `PRD ID ${id} 被覆盖`);
  }
  // 覆盖表不得有 PRD 不存在的 ID（防止伪造覆盖）
  for (const id of covered) {
    assert.ok(prdIds.includes(id), `覆盖表 ID ${id} 存在于 PRD（非伪造）`);
  }
});

test("覆盖表无重复 ID", () => {
  const coverage = JSON.parse(readFileSync(COVERAGE_PATH, "utf8"));
  const seen = new Set();
  for (const group of Object.values(coverage.groups)) {
    for (const id of Object.keys(group.ids)) {
      assert.ok(!seen.has(id), `重复 ID: ${id}`);
      seen.add(id);
    }
  }
  assert.ok(seen.size >= 40, `覆盖表 ≥40 个 ID（实际 ${seen.size}）`);
});
