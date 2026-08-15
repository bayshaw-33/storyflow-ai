#!/usr/bin/env node
/**
 * KIIKIS V2.2 契约覆盖审计 — Phase 6 Task 6.1.
 *
 * 1. 从总 PRD 提取验收 ID（K22-G/ENTRY/JOB/SW/UNI/IMP/SONG/MKT）
 * 2. 与 scripts/kiikis22-coverage.json 覆盖表比对：
 *    - PRD 有但覆盖表缺失的 ID → 失败
 *    - 覆盖表映射的测试文件不存在 → 失败
 * 3. 重复 ID / 无测试 ID 时退出码非 0
 *
 * 用法：node scripts/audit-kiikis-22-contracts.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PRD_PATH = resolve(root, "docs/kiikis-2.2/KIIKIS-2.2-总PRD-v1.0.md");
const COVERAGE_PATH = resolve(root, "scripts/kiikis22-coverage.json");

const ID_PATTERN = /\b(K22-G\d+|ENTRY-\d+|JOB-\d+|SW-\d+|UNI-\d+|IMP-\d+|SONG-\d+|MKT-\d+)\b/g;

function fail(message) {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
}

function main() {
  if (!existsSync(PRD_PATH)) {
    fail(`PRD 不存在: ${PRD_PATH}`);
    return;
  }
  const prd = readFileSync(PRD_PATH, "utf8");

  // 1. 提取 PRD 中的全部验收 ID
  const prdIds = [...new Set(prd.match(ID_PATTERN) ?? [])].sort();
  console.log(`PRD 验收 ID 共 ${prdIds.length} 个`);

  // 2. 读取覆盖表
  if (!existsSync(COVERAGE_PATH)) {
    fail(`覆盖表不存在: ${COVERAGE_PATH}`);
    return;
  }
  const coverage = JSON.parse(readFileSync(COVERAGE_PATH, "utf8"));
  const coverageIds = new Set();
  for (const group of Object.values(coverage.groups)) {
    for (const id of Object.keys(group.ids)) {
      if (coverageIds.has(id)) {
        fail(`覆盖表重复 ID: ${id}`);
      }
      coverageIds.add(id);
    }
  }

  // 3. PRD ID 必须有覆盖
  const missing = prdIds.filter((id) => !coverageIds.has(id));
  if (missing.length > 0) {
    fail(`PRD 有但覆盖表缺失的 ID: ${missing.join(", ")}`);
  }

  // 4. 覆盖表 ID 必须有测试文件
  let filesChecked = 0;
  for (const [id, files] of Object.entries(
    Object.fromEntries(
      [...coverageIds].map((id) => {
        for (const group of Object.values(coverage.groups)) {
          if (group.ids[id]) return [id, group.ids[id]];
        }
        return [id, []];
      }),
    ),
  )) {
    if (files.length === 0) {
      fail(`覆盖表 ID 无测试文件: ${id}`);
      continue;
    }
    for (const file of files) {
      filesChecked += 1;
      if (!existsSync(resolve(root, file))) {
        fail(`测试文件不存在: ${file}（ID ${id}）`);
      }
    }
  }

  // 5. 覆盖表里有但 PRD 没有的 ID（防止伪造覆盖）
  const extra = [...coverageIds].filter((id) => !prdIds.includes(id));
  if (extra.length > 0) {
    fail(`覆盖表存在但 PRD 不存在的 ID（疑似伪造覆盖）: ${extra.join(", ")}`);
  }

  if (process.exitCode) {
    console.error("❌ KIIKIS 2.2 契约覆盖审计未通过。");
    return;
  }
  console.log(`✅ 覆盖审计通过：${prdIds.length} 个 PRD ID 全部映射，${filesChecked} 个测试文件存在。`);
}

main();
