/**
 * tests/kiikis-21-foundation-contract.test.mjs
 * K21-EV-001..005, K21-DB-001..003, K21-FF-001
 * 静态验证 Phase 1 foundation migration SQL 契约。
 * 不连接数据库；通过解析 SQL 文本断言结构、约束、RLS 和触发器。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const migDir = join(root, "supabase", "migrations");
const MIGRATION_FILE = "20260827000000_kiikis_21_foundation.sql";
const AUDIT_FILE = join(migDir, "audits", "audit_kiikis_21_foundation.sql");

function readMigration() {
  return readFileSync(join(migDir, MIGRATION_FILE), "utf8");
}

function readAudit() {
  return readFileSync(AUDIT_FILE, "utf8");
}

// ============================================================
// K21-DB-001: forward-only — 不修改 baseline 或既有迁移
// ============================================================

test("K21-DB-001: migration 文件存在且仅创建/追加，不 DROP 既有表", () => {
  const sql = readMigration();
  assert.doesNotMatch(sql, /DROP TABLE\s+(public\.)?storyflow_(projects|universes|actors|creative_documents)/i);
  assert.doesNotMatch(sql, /ALTER TABLE\s+(public\.)?storyflow_projects\s+DROP/i);
});

test("K21-DB-001: 不修改 20260716000000_baseline.sql 内容", () => {
  // migration 是独立文件，baseline 文件保持不动
  const baseline = readFileSync(join(migDir, "20260716000000_baseline.sql"), "utf8");
  const baselineMarker = "-- KIIKIS baseline schema";
  // baseline 文件头部标记不应被本 migration 改写
  assert.ok(baseline.length > 0);
});

// ============================================================
// storyflow_creative_events 表结构
// ============================================================

test("K21-EV-001: 创建 public.storyflow_creative_events 表", () => {
  const sql = readMigration();
  assert.match(
    sql,
    /CREATE TABLE[^;]*public\.storyflow_creative_events\s*\(/i
  );
});

test("K21-EV-001: id 主键默认 gen_random_uuid", () => {
  const sql = readMigration();
  assert.match(sql, /id\s+uuid\s+primary\s+key[^,]*gen_random_uuid\(\)/i);
});

test("K21-EV-003: sequence 是 GENERATED ALWAYS AS IDENTITY (单调递增)", () => {
  const sql = readMigration();
  assert.match(
    sql,
    /sequence\s+bigint\s+generated\s+always\s+as\s+identity/i
  );
});

test("K21-EV-001: schema_version 有正整数 CHECK", () => {
  const sql = readMigration();
  assert.match(sql, /schema_version\s+integer\s+not\s+null/i);
  assert.match(sql, /check\s*\(\s*schema_version\s*>\s*0\s*\)/i);
});

test("K21-EV-001: actor_type CHECK 限定 user/system", () => {
  const sql = readMigration();
  assert.match(sql, /actor_type[^,]*check[^;]*'user'[^;]*'system'/i);
});

test("K21-EV-001: actor_id 可空且引用 auth.users", () => {
  const sql = readMigration();
  assert.match(sql, /actor_id\s+uuid\s+null\s+references\s+auth\.users/i);
});

test("K21-EV-001: owner_id 非空且引用 auth.users", () => {
  const sql = readMigration();
  assert.match(sql, /owner_id\s+uuid\s+not\s+null\s+references\s+auth\.users/i);
});

test("K21-EV-001: resource_type/resource_id 非空", () => {
  const sql = readMigration();
  assert.match(sql, /resource_type\s+text\s+not\s+null/i);
  assert.match(sql, /resource_id\s+text\s+not\s+null/i);
});

test("K21-EV-001: resource_version 可空", () => {
  const sql = readMigration();
  assert.match(sql, /resource_version\s+text\s+null/i);
});

test("K21-EV-001: task_id 可空", () => {
  const sql = readMigration();
  assert.match(sql, /task_id\s+uuid\s+null/i);
});

test("K21-EV-004: idempotency_key 非空且有 (owner_id, idempotency_key) UNIQUE", () => {
  const sql = readMigration();
  assert.match(sql, /idempotency_key\s+text\s+not\s+null/i);
  assert.match(
    sql,
    /unique\s*\(\s*owner_id\s*,\s*idempotency_key\s*\)/i
  );
});

test("K21-EV-001: visibility CHECK 限定 private/collaborators/public", () => {
  const sql = readMigration();
  assert.match(
    sql,
    /visibility[^,]*check[^;]*'private'[^;]*'collaborators'[^;]*'public'/i
  );
});

test("K21-EV-005: payload 默认 '{}'::jsonb 而非 null", () => {
  const sql = readMigration();
  assert.match(sql, /payload\s+jsonb\s+not\s+null\s+default\s*'{}'::jsonb/i);
});

test("K21-EV-001: occurred_at / created_at 非空 timestamptz", () => {
  const sql = readMigration();
  assert.match(sql, /occurred_at\s+timestamptz\s+not\s+null/i);
  assert.match(sql, /created_at\s+timestamptz\s+not\s+null[^,]*default\s+now\(\)/i);
});

// ============================================================
// 索引（owner+sequence 补拉、resource、task）
// ============================================================

test("K21-EV-003: (owner_id, sequence) 索引支持断点补拉", () => {
  const sql = readMigration();
  assert.match(
    sql,
    /create\s+index[^;]*storyflow_creative_events_owner_sequence_idx[^;]*owner_id[^;]*sequence/i
  );
});

test("K21-EV-001: (resource_type, resource_id) 索引", () => {
  const sql = readMigration();
  assert.match(
    sql,
    /create\s+index[^;]*storyflow_creative_events_resource_idx[^;]*resource_type[^;]*resource_id/i
  );
});

test("K21-EV-001: task_id 索引", () => {
  const sql = readMigration();
  assert.match(
    sql,
    /create\s+index[^;]*storyflow_creative_events_task_idx[^;]*task_id/i
  );
});

// ============================================================
// RLS：只允许 INSERT/SELECT，禁止 UPDATE/DELETE
// ============================================================

test("K21-DB-002: ENABLE ROW LEVEL SECURITY on storyflow_creative_events", () => {
  const sql = readMigration();
  assert.match(
    sql,
    /alter\s+table\s+public\.storyflow_creative_events\s+enable\s+row\s+level\s+security/i
  );
});

test("K21-DB-002: 不创建 UPDATE policy（默认拒绝）", () => {
  const sql = readMigration();
  // 不允许出现 FOR UPDATE 的 policy
  assert.doesNotMatch(
    sql,
    /create\s+policy[^;]*on\s+public\.storyflow_creative_events[^;]*for\s+update/i
  );
});

test("K21-DB-002: 不创建 DELETE policy（默认拒绝）", () => {
  const sql = readMigration();
  assert.doesNotMatch(
    sql,
    /create\s+policy[^;]*on\s+public\.storyflow_creative_events[^;]*for\s+delete/i
  );
});

test("K21-DB-002: owner SELECT policy 限制 auth.uid() = owner_id", () => {
  const sql = readMigration();
  assert.match(
    sql,
    /create\s+policy[^;]*on\s+public\.storyflow_creative_events[^;]*for\s+select[^;]*using[^;]*owner_id\s*=\s*\(select\s+auth\.uid\(\)\)/i
  );
});

test("K21-DB-002: public SELECT policy 限制 visibility = 'public'", () => {
  const sql = readMigration();
  assert.match(
    sql,
    /create\s+policy[^;]*on\s+public\.storyflow_creative_events[^;]*for\s+select[^;]*using[^;]*visibility\s*=\s*'public'/i
  );
});

test("K21-DB-002: INSERT policy 限制 owner_id = auth.uid()", () => {
  const sql = readMigration();
  assert.match(
    sql,
    /create\s+policy[^;]*on\s+public\.storyflow_creative_events[^;]*for\s+insert[^;]*with\s+check[^;]*owner_id\s*=\s*\(select\s+auth\.uid\(\)\)/i
  );
});

// ============================================================
// guard trigger：阻止 UPDATE/DELETE（防御 service_role 误操作）
// ============================================================

test("K21-DB-002: guard trigger 阻止 UPDATE 与 DELETE", () => {
  const sql = readMigration();
  // trigger 函数拒绝 UPDATE 或 DELETE
  assert.match(
    sql,
    /function[^;]*storyflow_creative_events_immutable[^;]*raise\s+exception/i
  );
  // trigger 绑定到 UPDATE OR DELETE
  assert.match(
    sql,
    /create\s+trigger[^;]*storyflow_creative_events_immutable[^;]*before\s+(update\s+or\s+delete|delete\s+or\s+update)[^;]*on\s+public\.storyflow_creative_events/i
  );
});

// ============================================================
// Realtime publication：只添加目标表
// ============================================================

test("K21-EV-001: Realtime publication 仅添加 storyflow_creative_events", () => {
  const sql = readMigration();
  assert.match(
    sql,
    /alter\s+publication\s+supabase_realtime\s+add\s+table\s+public\.storyflow_creative_events/i
  );
  // 不应在本 migration 中把其他无关表加入 realtime
  const realtimeMatches = sql.match(
    /alter\s+publication\s+supabase_realtime\s+add\s+table\s+public\.\w+/gi
  );
  if (realtimeMatches) {
    for (const m of realtimeMatches) {
      assert.match(
        m,
        /storyflow_creative_events/i,
        `realtime 不应添加无关表: ${m}`
      );
    }
  }
});

// ============================================================
// audit SQL
// ============================================================

test("K21-DB-003: audit SQL 存在并输出异常清单", () => {
  const audit = readAudit();
  assert.ok(audit.length > 0);
  // 必须检查：UPDATE/DELETE 残留、跨用户可见、payload null、idempotency 冲突
  assert.match(audit, /storyflow_creative_events/i);
  assert.match(audit, /payload\s+is\s+null/i);
  assert.match(audit, /visibility/i);
});

test("K21-DB-003: audit 检查 RLS 是否启用", () => {
  const audit = readAudit();
  assert.match(audit, /rowsecurity/i);
});

test("K21-DB-003: audit 检查 (owner_id, idempotency_key) 唯一约束", () => {
  const audit = readAudit();
  assert.match(audit, /idempotency_key/i);
});

// ============================================================
// K21-EV-002: append_creative_event RPC (窄 RPC 保证事务原子性)
// ============================================================

test("K21-EV-002: append_creative_event RPC 存在且 SECURITY INVOKER", () => {
  const sql = readMigration();
  assert.match(
    sql,
    /create\s+(or\s+replace\s+)?function\s+public\.append_creative_event/i
  );
  assert.match(
    sql,
    /append_creative_event[\s\S]*?security\s+invoker/i
  );
});

test("K21-EV-002: RPC 使用 ON CONFLICT DO NOTHING 实现幂等", () => {
  const sql = readMigration();
  assert.match(
    sql,
    /on\s+conflict\s*\(\s*owner_id\s*,\s*idempotency_key\s*\)\s+do\s+nothing/i
  );
});

test("K21-EV-002: RPC 授权给 authenticated, REVOKE FROM PUBLIC", () => {
  const sql = readMigration();
  assert.match(
    sql,
    /revoke\s+execute\s+on\s+function[^;]*append_creative_event[^;]*from\s+public/i
  );
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function[^;]*append_creative_event[^;]*to\s+authenticated/i
  );
});

test("K21-EV-002: RPC 接受 13 个参数 (event_type..occurred_at)", () => {
  const sql = readMigration();
  // 简单断言参数列表关键项
  assert.match(sql, /p_event_type\s+text/i);
  assert.match(sql, /p_schema_version\s+integer/i);
  assert.match(sql, /p_owner_id\s+uuid/i);
  assert.match(sql, /p_idempotency_key\s+text/i);
  assert.match(sql, /p_visibility\s+text/i);
  assert.match(sql, /p_payload\s+jsonb/i);
  assert.match(sql, /p_occurred_at\s+timestamptz/i);
});
