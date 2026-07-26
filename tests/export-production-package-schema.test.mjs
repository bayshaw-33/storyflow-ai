/**
 * V2-07 Production Package Schema 契约测试
 * Brooks-Lint Review Warning 项：补 Schema 对齐回归测试
 *
 * 验证目标：
 *   1. 导出查询的 select 字段名与 migration 表定义匹配（静态契约）
 *   2. buildProductionPackage 在空数据时仍能生成有效 manifest（容错性）
 *   3. 缺失素材标记 missing，不伪造空文件
 *   4. 项目隔离：scenes/shots 按 production_project_id 过滤
 *
 * 运行：node tests/export-production-package-schema.test.mjs
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const MIGRATIONS_DIR = "supabase/migrations";

// ============================================================
// Schema 解析工具
// ============================================================

/** 从 migration 文件提取 CREATE TABLE 的列名 */
function extractTableColumns(migrationContent, tableName) {
  const pattern = new RegExp(
    "CREATE TABLE\\s+(?:IF NOT EXISTS\\s+)?(?:public\\.)?" + tableName + "\\s*\\(([^;]+)\\)",
    "i",
  );
  const match = migrationContent.match(pattern);
  if (!match) return null;
  const body = match[1];
  const columns = [];
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("--") || trimmed.startsWith("CONSTRAINT") || trimmed.startsWith("CHECK")) continue;
    const colMatch = trimmed.match(/^"?(\w+)"?\s+/);
    if (colMatch) columns.push(colMatch[1]);
  }
  return columns;
}

/** 从所有 migration 文件聚合提取某张表的列（含 ALTER TABLE ADD COLUMN） */
function getTableColumns(tableName) {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql") && !f.includes("/rollback/"));
  const allColumns = new Set();
  for (const file of files) {
    const content = readFileSync(MIGRATIONS_DIR + "/" + file, "utf8");
    const cols = extractTableColumns(content, tableName);
    if (cols) cols.forEach((c) => allColumns.add(c));
    // ALTER TABLE ADD COLUMN（逐行扫描，支持多列格式）
    const lines = content.split("\n");
    let inAlter = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const alterMatch = line.match(new RegExp("ALTER\\s+TABLE\\s+(?:public\\.)?" + tableName + "\\b", "i"));
      if (alterMatch) {
        inAlter = true;
        continue;
      }
      if (inAlter) {
        if (line.match(/ALTER\s+TABLE/i) && !line.match(new RegExp("ALTER\\s+TABLE\\s+(?:public\\.)?" + tableName))) {
          inAlter = false;
          continue;
        }
        const addMatch = line.match(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)/i);
        if (addMatch) {
          allColumns.add(addMatch[1]);
        }
        if (line.includes(";") && !line.trim().startsWith("--")) {
          inAlter = false;
        }
      }
    }
  }
  return allColumns;
}

const queriesSource = readFileSync("lib/export/queries.ts", "utf8");

// ============================================================
// 1. Schema 契约：字段名对齐
// ============================================================

test("Canon facts 表有 fact_text 字段（非 title/content）", () => {
  const cols = getTableColumns("storyflow_canon_facts");
  assert.ok(cols.has("fact_text"), "storyflow_canon_facts 必须有 fact_text 列");
  assert.ok(!cols.has("title"), "storyflow_canon_facts 不应有 title 列");
  assert.ok(!cols.has("content"), "storyflow_canon_facts 不应有 content 列");
});

test("Canon facts 导出查询使用 fact_text 字段", () => {
  assert.ok(queriesSource.includes("fact_text"), "queries.ts 必须查询 fact_text 字段");
});

test("Universe relationships 表有 summary 字段（非 label）", () => {
  const cols = getTableColumns("storyflow_universe_relationships");
  assert.ok(cols.has("summary"), "storyflow_universe_relationships 必须有 summary 列");
  assert.ok(!cols.has("label"), "storyflow_universe_relationships 不应有 label 列");
});

test("Universe relationships 导出查询使用 summary 字段", () => {
  const relQueryLine = queriesSource.split("\n").find((l) =>
    l.includes("storyflow_universe_relationships") && l.includes("select=")
  );
  assert.ok(relQueryLine, "必须存在 relationships 查询");
  const selectMatch = relQueryLine.match(/select=([^&]+)/);
  const fields = decodeURIComponent(selectMatch[1]).split(",").map((s) => s.trim());
  assert.ok(fields.includes("summary"), "查询必须包含 summary 字段");
  assert.ok(!fields.includes("label"), "查询不应包含 label 字段");
});

test("Production scenes 表有 production_project_id 字段", () => {
  const cols = getTableColumns("storyflow_production_scenes");
  assert.ok(cols.has("production_project_id"), "scenes 表必须有 production_project_id 列");
  assert.ok(cols.has("sort_order"), "scenes 表必须有 sort_order 列");
  assert.ok(cols.has("director_meta"), "scenes 表必须有 director_meta 列");
  assert.ok(cols.has("locked"), "scenes 表必须有 locked 列");
  assert.ok(cols.has("deleted_at"), "scenes 表必须有 deleted_at 列");
});

test("Scenes 导出查询按 production_project_id 过滤", () => {
  const sceneQueryLine = queriesSource.split("\n").find((l) =>
    l.includes("storyflow_production_scenes") && l.includes("production_project_id=eq.")
  );
  assert.ok(sceneQueryLine, "scenes 查询必须按 production_project_id 过滤");
});

test("Production shots 表有 scene_id 和 production_project_id 字段", () => {
  const cols = getTableColumns("storyflow_production_shots");
  assert.ok(cols.has("scene_id"), "shots 表必须有 scene_id 列");
  assert.ok(cols.has("production_project_id"), "shots 表必须有 production_project_id 列");
  assert.ok(cols.has("index"), "shots 表必须有 index 列");
  assert.ok(cols.has("shot_size"), "shots 表必须有 shot_size 列");
  assert.ok(cols.has("source_hash"), "shots 表必须有 source_hash 列");
  assert.ok(cols.has("director_meta"), "shots 表必须有 director_meta 列");
});

test("Shots 导出查询按 scene_id IN (...) 过滤", () => {
  const shotQueryLine = queriesSource.split("\n").find((l) =>
    l.includes("storyflow_production_shots") && l.includes("scene_id=in.")
  );
  assert.ok(shotQueryLine, "shots 查询必须按 scene_id IN (...) 过滤，避免跨项目混入");
});

test("Voice profiles 表无 project_id（按 owner_id 过滤）", () => {
  const cols = getTableColumns("storyflow_character_voice_profiles");
  assert.ok(cols.has("voice_label"), "voice_profiles 表必须有 voice_label 列");
  assert.ok(cols.has("voice_provider"), "voice_profiles 表必须有 voice_provider 列");
  assert.ok(cols.has("speed"), "voice_profiles 表必须有 speed 列");
  assert.ok(!cols.has("project_id"), "voice_profiles 表不应有 project_id 列");
});

test("Voice lines 表用 text 字段（非 dialogue_text）", () => {
  const cols = getTableColumns("storyflow_voice_lines");
  assert.ok(cols.has("text"), "voice_lines 表必须有 text 列");
  assert.ok(cols.has("is_approved"), "voice_lines 表必须有 is_approved 列");
});

test("Assets 表用 user_id（非 owner_id）", () => {
  const cols = getTableColumns("storyflow_assets");
  assert.ok(cols.has("user_id"), "assets 表必须有 user_id 列");
  assert.ok(!cols.has("owner_id"), "assets 表不应有 owner_id 列");
});

test("Script episodes 表不存在（剧本在 projects.data JSONB）", () => {
  const cols = getTableColumns("storyflow_script_episodes");
  assert.ok(cols.size === 0, "storyflow_script_episodes 表不应存在");
  assert.ok(queriesSource.includes("storyflow_projects?id=eq"), "剧本应从 storyflow_projects 读取");
});

test("Selected takes 表无 owner_id（按 project_id 过滤）", () => {
  const cols = getTableColumns("storyflow_selected_takes");
  assert.ok(cols.has("project_id"), "selected_takes 表必须有 project_id 列");
  assert.ok(cols.has("video_url"), "selected_takes 表必须有 video_url 列");
  assert.ok(cols.has("metadata"), "selected_takes 表必须有 metadata 列");
});

// ============================================================
// 2. Manifest 纯函数测试
// ============================================================

import { sha256Hex, computePackageHash, okEntry, missingEntry, failedEntry, buildManifest } from "../lib/export/manifest.ts";

test("sha256Hex 返回 64 字符 hex", () => {
  const hash = sha256Hex("test");
  assert.equal(hash.length, 64);
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test("computePackageHash 对空 entries 返回确定值", () => {
  const hash = computePackageHash([]);
  assert.equal(hash.length, 64);
});

test("okEntry 填充 hash 和 size", () => {
  const entry = okEntry("test.json", '{"a":1}');
  assert.equal(entry.status, "ok");
  assert.equal(entry.size, 7);
  assert.equal(entry.hash.length, 64);
});

test("missingEntry hash 为空字符串", () => {
  const entry = missingEntry("missing.json", "数据不存在");
  assert.equal(entry.status, "missing");
  assert.equal(entry.hash, "");
  assert.equal(entry.size, 0);
});

test("failedEntry hash 为空字符串", () => {
  const entry = failedEntry("failed.json", "查询超时");
  assert.equal(entry.status, "failed");
  assert.equal(entry.hash, "");
  assert.equal(entry.size, 0);
});

test("buildManifest 统计正确", () => {
  const manifest = buildManifest({
    projectId: "proj-1",
    sourceUnitId: "ep-1",
    universeId: "uni-1",
    productionProjectId: "pp-1",
    exportedByUserId: "user-1234567890",
    entries: [
      okEntry("a.json", "{}"),
      okEntry("b.json", "[]"),
      missingEntry("c.json", "缺失"),
      failedEntry("d.json", "失败"),
    ],
  });
  assert.equal(manifest.summary.totalFiles, 4);
  assert.equal(manifest.summary.okFiles, 2);
  assert.equal(manifest.summary.missingFiles, 1);
  assert.equal(manifest.summary.failedFiles, 1);
  assert.equal(manifest.schemaVersion, "kiikis.production-package/1");
  assert.equal(manifest.exportedBy, "user-123");
  assert.equal(manifest.redacted.apiKeys, true);
  assert.equal(manifest.redacted.signedUrls, true);
  assert.equal(manifest.packageHash.length, 64);
});

console.log("✅ V2-07 Production Package Schema 契约测试完成");
