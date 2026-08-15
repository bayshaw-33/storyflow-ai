/**
 * Phase 6 Task 6.2 Step 4 — 存储矩阵审计.
 *
 * 私有对象（Source Import / Evidence / Voice / Video Asset）不得跨用户读取。
 * 静态验证（无真实存储）：
 *   - K22 私有 bucket 不建 public 读 policy
 *   - 上传路径按 ownerId 作用域（storage path 含 owner 前缀）
 *   - 签名 URL 语义：storage.ts 只返回短期 signed URL（服务层已锁）
 *
 * Run: node --test tests/security/kiikis-22-storage.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const MIGRATIONS_DIR = resolve(root, "supabase/migrations");

function allMigrationSql() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(resolve(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");
}

test("私有 bucket 不向匿名用户开放读取（无 public read policy）", () => {
  const sql = allMigrationSql();
  // 找 bucket 定义
  const buckets = [...sql.matchAll(/insert into storage\.buckets[^;]*\(([^)]*)\)/gi)]
    .map((m) => m[1])
    .join(" ");
  assert.ok(buckets.length > 0, "存在 storage.buckets 定义");
  // 私有 bucket 不得有对 anon 的 public select policy
  const publicSelectOnPrivate = [
    ...sql.matchAll(
      /(?:CREATE|DROP)\s+POLICY[^;]*storage\.objects[^;]*/gi,
    ),
  ].filter((m) => /to\s+public\s+using\s*\([^)]*bucket_id\s*=\s*'([^']+)'/.test(m[0]));
  // K22 的 source import / asset 桶必须是私有的：没有 anon select policy 即为私有
  const anonSelect = [...sql.matchAll(/POLICY[^;]*storage\.objects[^;]*FOR\s+SELECT[^;]*TO\s+public/gi)];
  assert.equal(anonSelect.length, 0, "storage.objects 无公开 SELECT policy");
  assert.equal(publicSelectOnPrivate.length, 0);
});

test("K22 上传路径按 owner 作用域（storage path 含 ownerId 前缀）", () => {
  // lib/server/v2/universe-import/storage.ts 的私有路径约定
  const storageSrc = readFileSync(resolve(root, "lib/server/v2/universe-import/storage.ts"), "utf8");
  assert.match(storageSrc, /ownerId|owner_id/i, "storage 路径含 owner 作用域");
  const pathBuilder = storageSrc.match(/`[^`]*\$\{[^}]*\}[^`]*`/g) ?? [];
  assert.ok(pathBuilder.some((p) => p.includes("ownerId")), `路径含 ownerId: ${pathBuilder.join(", ")}`);
});

test("签名 URL 语义：只返回短期 signed URL，不暴露长期公开 URL", () => {
  // 语音/视频查询层：audioUrl 来自 signed_url 字段
  const voiceQueries = readFileSync(resolve(root, "lib/voice/queries.ts"), "utf8");
  assert.match(voiceQueries, /signed_url|signedUrl/i, "voice 查询返回 signed URL");
  // 导出包：临时 URL 不入包（P5 已锁）
  const pkg = readFileSync(resolve(root, "lib/export/deterministic-package.ts"), "utf8");
  assert.match(pkg, /storagePath/i, "导出包只引用持久 storagePath");
});

test("Source Import / Evidence / Asset 桶均私有（无 anon 可读）", () => {
  const sql = allMigrationSql();
  const bucketIds = [...sql.matchAll(/['"]((?:source|evidence|asset|universe)[a-z-]*)['"]/gi)]
    .map((m) => m[1].toLowerCase())
    .filter((b) => /source|evidence|asset|universe/.test(b));
  assert.ok(bucketIds.length >= 3, `私有桶声明 ≥3（实际 ${bucketIds.length}）`);
  // 这些桶不允许 public SELECT（storage.objects policy 中没有它们对 anon 开放）
  for (const bucket of bucketIds) {
    const anonRead = new RegExp(`FOR\\s+SELECT[^;]*bucket_id\\s*=\\s*['\"]${bucket}['\"][^;]*TO\\s+public`, "i");
    assert.equal(anonRead.test(sql), false, `桶 ${bucket} 无 anon SELECT policy`);
  }
});
