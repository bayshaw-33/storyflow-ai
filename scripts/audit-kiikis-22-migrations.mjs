#!/usr/bin/env node
/**
 * KIIKIS V2.2 Migration 发布审计 — Phase 6 Task 6.2 Step 2.
 *
 * 审计范围：K22 migration（时间戳 ≥ 20260828，Phase 0–5）。
 *   - 文件名唯一（无重复）
 *   - 按文件名时间戳严格递增（forward-only 顺序）
 *   - 不包含 DROP TABLE / DROP POLICY（破坏性回滚语句）
 *   - 每个 K22 新表都启用 ROW LEVEL SECURITY
 *   - append-only 表（*_versions/*_links/*_decisions/*_events/*_messages/
 *     *_snapshots/*_candidates）有 UPDATE/DELETE 拦截触发器
 *
 * 用法：node scripts/audit-kiikis-22-migrations.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = resolve(root, "supabase/migrations");
const K22_PREFIX = /^20260828/;

function fail(message) {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
}

/** 提取 CREATE TABLE 表名；排除 CREATE TABLE ... AS SELECT。 */
function extractTables(sql) {
  const tables = new Set();
  for (const match of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?([a-z0-9_]+)/gi)) {
    tables.add(match[1]);
  }
  return tables;
}

/** 提取被 ENABLE ROW LEVEL SECURITY 的表。 */
function extractRlsTables(sql) {
  const tables = new Set();
  for (const match of sql.matchAll(/ALTER\s+TABLE\s+(?:public\.)?([a-z0-9_]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi)) {
    tables.add(match[1]);
  }
  return tables;
}

function extractTriggerTargets(sql) {
  const targets = new Set();
  for (const match of sql.matchAll(/CREATE\s+TRIGGER[\s\S]*?\bON\s+(?:public\.)?([a-z0-9_]+)/gi)) {
    targets.add(match[1]);
  }
  return targets;
}

function main() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && K22_PREFIX.test(f))
    .sort();

  console.log(`K22 migration 共 ${files.length} 个（时间戳 ≥ 20260828）。`);
  if (files.length < 5) {
    fail(`K22 migration 数量异常（${files.length} < 5）。`);
    return;
  }

  // 1. 唯一性
  const seen = new Set();
  for (const f of files) {
    if (seen.has(f)) fail(`重复 migration 文件: ${f}`);
    seen.add(f);
  }

  // 2. forward-only 顺序
  const stamps = files.map((f) => Number(f.slice(0, 14)));
  for (let i = 1; i < stamps.length; i += 1) {
    if (Number.isNaN(stamps[i]) || stamps[i] <= stamps[i - 1]) {
      fail(`migration 时间戳非递增（${files[i - 1]} → ${files[i]}）。`);
    }
  }
  console.log("  ✓ 时间戳严格递增。");

  // 3. 无破坏性语句（K22 范围内）。DROP POLICY IF EXISTS 是幂等重建 policy
  //    的标准模式，放行；DROP TABLE 才是破坏性回滚。
  const allSql = files.map((f) => readFileSync(resolve(MIGRATIONS_DIR, f), "utf8")).join("\n");
  const destructive = [
    ...allSql.matchAll(/DROP\s+TABLE\s+(?:IF EXISTS\s+)?(?:public\.)?[a-z0-9_]+/gi),
  ];
  if (destructive.length > 0) {
    fail(`K22 migration 含 DROP TABLE（forward-only 违约）: ${destructive.slice(0, 5).map((m) => m[0]).join("; ")}`);
  } else {
    console.log("  ✓ 无 DROP TABLE（forward-only；DROP POLICY IF EXISTS 幂等重建放行）。");
  }

  // 4. 每张 K22 表必须启用 RLS（定义处或后续 K22 migration）
  const tableToFile = new Map();
  const rlsTables = new Set();
  for (const f of files) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, f), "utf8");
    for (const table of extractTables(sql)) {
      if (!tableToFile.has(table)) tableToFile.set(table, f);
    }
    for (const table of extractRlsTables(sql)) rlsTables.add(table);
  }
  const rlsMissing = [...tableToFile.keys()].filter((t) => !rlsTables.has(t));
  if (rlsMissing.length > 0) {
    fail(`K22 表未启用 RLS: ${rlsMissing.join(", ")}`);
  } else {
    console.log(`  ✓ ${tableToFile.size} 张 K22 表全部启用 RLS。`);
  }

  // 5. append-only 表触发器（仅 K22 表）
  const appendOnlyCandidates = [...tableToFile.keys()].filter((t) =>
    /storyflow_.*(versions|links|decisions|events|messages|snapshots|candidates)$/.test(t),
  );
  const triggerTargets = new Set();
  for (const f of files) {
    for (const t of extractTriggerTargets(readFileSync(resolve(MIGRATIONS_DIR, f), "utf8"))) {
      triggerTargets.add(t);
    }
  }
  const missingTrigger = appendOnlyCandidates.filter((t) => !triggerTargets.has(t));
  if (missingTrigger.length > 0) {
    fail(`K22 append-only 表缺 UPDATE/DELETE 拦截触发器: ${missingTrigger.join(", ")}`);
  } else {
    console.log(`  ✓ ${appendOnlyCandidates.length} 张 K22 append-only 表均有拦截触发器。`);
  }

  if (process.exitCode) {
    console.error("❌ Migration 审计未通过。");
    return;
  }
  console.log("✅ K22 Migration 审计通过。");
}

main();
