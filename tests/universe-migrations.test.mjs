/**
 * tests/universe-migrations.test.mjs
 * PRD v3.0 §13.1 数据与安全：migration + RLS + rollback 静态验证
 * 不依赖数据库连接，验证 SQL 文件的关键契约
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const migDir = join(root, "supabase", "migrations");

function readSql(name) {
  return readFileSync(join(migDir, name), "utf8");
}

// ============================================================
// A.1 Universe 卡片字段 migration
// ============================================================

test("A.1 universe_card_fields: 幂等 ADD COLUMN IF NOT EXISTS", () => {
  const sql = readSql("20260720000000_universe_card_fields.sql");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS card_summary text NOT NULL DEFAULT ''/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS cover_asset_version_id uuid NULL/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS primary_asset_version_id uuid NULL/);
});

test("A.1 universe_card_fields: 归档过滤索引", () => {
  const sql = readSql("20260720000000_universe_card_fields.sql");
  // 列表默认排除 archived_at IS NOT NULL
  assert.match(sql, /WHERE archived_at IS NULL/);
});

test("A.1 universe_card_fields: 不删除 description（保留完整 Bible）", () => {
  const sql = readSql("20260720000000_universe_card_fields.sql");
  assert.doesNotMatch(sql, /DROP COLUMN.*description/i);
});

// ============================================================
// A.2 casting/portrayal owner + RLS migration
// ============================================================

test("A.2 casting_portrayal: 加 owner_id + team_id 列", () => {
  const sql = readSql("20260720010000_casting_portrayal_owner_rls.sql");
  assert.match(sql, /storyflow_casting_assignments[\s\S]*ADD COLUMN IF NOT EXISTS owner_id uuid NULL/);
  assert.match(sql, /storyflow_casting_assignments[\s\S]*ADD COLUMN IF NOT EXISTS team_id uuid NULL/);
  assert.match(sql, /storyflow_character_portrayals[\s\S]*ADD COLUMN IF NOT EXISTS owner_id uuid NULL/);
  assert.match(sql, /storyflow_character_portrayals[\s\S]*ADD COLUMN IF NOT EXISTS team_id uuid NULL/);
});

test("A.2 casting_portrayal: 回填 owner_id 不猜测归属（NULL 保留 + 审计 NOTICE）", () => {
  const sql = readSql("20260720010000_casting_portrayal_owner_rls.sql");
  // 从 project.owner_id 回填 casting
  assert.match(sql, /UPDATE.*storyflow_casting_assignments[\s\S]*FROM.*storyflow_projects/);
  // 从 actor_profile.owner_id 回填 portrayal
  assert.match(sql, /UPDATE.*storyflow_character_portrayals[\s\S]*FROM.*storyflow_actor_profiles/);
  // 无法回填的行保留 NULL，输出 NOTICE 而非猜测
  assert.match(sql, /RAISE NOTICE.*NULL owner_id/);
  assert.match(sql, /不猜测归属|audit required/);
});

test("A.2 casting_portrayal: 删除 8 条 USING(true)/WITH CHECK(true) 开放策略", () => {
  const sql = readSql("20260720010000_casting_portrayal_owner_rls.sql");
  // 删除旧策略
  const dropCount = (sql.match(/DROP POLICY IF EXISTS (casting_assignments|portrayals)_/g) || []).length;
  assert.equal(dropCount, 8, "应删除 8 条开放策略（casting 4 + portrayals 4）");
});

test("A.2 casting_portrayal: 新策略基于 owner_id + is_team_member，无 USING(true)", () => {
  const sql = readSql("20260720010000_casting_portrayal_owner_rls.sql");
  // 新建 8 条策略
  const createCount = (sql.match(/CREATE POLICY (casting_assignments|portrayals)_(select|insert|update|delete)/g) || []).length;
  assert.equal(createCount, 8, "应新建 8 条 owner/team 策略");

  // 新策略全部带 owner_id 或 is_team_member
  const policyBlocks = sql.match(/CREATE POLICY[\s\S]*?;/g) || [];
  for (const block of policyBlocks) {
    if (block.includes("casting_assignments") || block.includes("portrayals")) {
      assert.ok(
        block.includes("owner_id = auth.uid()") || block.includes("is_team_member"),
        `策略必须基于 owner_id 或 is_team_member: ${block.slice(0, 80)}`
      );
      assert.ok(!block.match(/USING \(true\)/), `新策略不得包含 USING(true): ${block.slice(0, 80)}`);
      assert.ok(!block.match(/WITH CHECK \(true\)/), `新策略不得包含 WITH CHECK(true): ${block.slice(0, 80)}`);
    }
  }
});

test("A.2 casting_portrayal: editor 可写 viewer 只读", () => {
  const sql = readSql("20260720010000_casting_portrayal_owner_rls.sql");
  // SELECT 允许 viewer
  assert.match(sql, /portrayals_select[\s\S]*viewer/);
  // INSERT/UPDATE/DELETE 不含 viewer
  const writePolicies = sql.match(/CREATE POLICY portrayals_(insert|update|delete)[\s\S]*?;/g) || [];
  for (const p of writePolicies) {
    assert.ok(!p.includes("viewer"), `写策略不得包含 viewer: ${p.slice(0, 80)}`);
  }
});

test("A.2 casting_portrayal: owner/team 索引", () => {
  const sql = readSql("20260720010000_casting_portrayal_owner_rls.sql");
  assert.match(sql, /idx_casting_assignments_owner/);
  assert.match(sql, /idx_portrayals_owner/);
  assert.match(sql, /idx_portrayals_actor_owner/);
});

// ============================================================
// A.3 rollback 脚本
// ============================================================

test("A.3 rollback: 不删除已回填的 owner_id 数据", () => {
  const sql = readSql(join("rollback", "20260720_rollback.sql"));
  // owner_id DROP 语句必须被注释掉
  assert.doesNotMatch(sql, /^ALTER TABLE.*DROP COLUMN IF EXISTS owner_id/m);
  // 注释中说明保留数据
  assert.match(sql, /owner_id.*保留|保留.*owner_id|不删除.*数据/);
});

test("A.3 rollback: 恢复开放策略仅作紧急回滚", () => {
  const sql = readSql(join("rollback", "20260720_rollback.sql"));
  assert.match(sql, /USING \(true\)/);
  assert.match(sql, /紧急回滚|不作为长期方案/);
});

test("A.3 rollback: 回滚 universe 卡片字段（drop columns）", () => {
  const sql = readSql(join("rollback", "20260720_rollback.sql"));
  assert.match(sql, /DROP COLUMN IF EXISTS card_summary/);
  assert.match(sql, /DROP COLUMN IF EXISTS cover_asset_version_id/);
  assert.match(sql, /DROP COLUMN IF EXISTS archived_at/);
  assert.match(sql, /DROP COLUMN IF EXISTS primary_asset_version_id/);
});

// ============================================================
// A.4/A.5 审计脚本只读
// ============================================================

test("A.4 audit-project-links: 只读（无 INSERT/UPDATE/DELETE/CREATE）", () => {
  const sql = readSql(join("audits", "audit-project-links.sql"));
  assert.doesNotMatch(sql, /\bINSERT\b/i);
  assert.doesNotMatch(sql, /\bUPDATE\b/i);
  assert.doesNotMatch(sql, /\bDELETE\b/i);
  assert.doesNotMatch(sql, /\bCREATE\b/i);
  assert.doesNotMatch(sql, /\bDROP\b/i);
  assert.match(sql, /SELECT/);
});

test("A.5 audit-duplicate-universes: 只读", () => {
  const sql = readSql(join("audits", "audit-duplicate-universes.sql"));
  assert.doesNotMatch(sql, /\bINSERT\b/i);
  assert.doesNotMatch(sql, /\bUPDATE\b/i);
  assert.doesNotMatch(sql, /\bDELETE\b/i);
  assert.doesNotMatch(sql, /\bDROP\b/i);
});

test("A.5 audit-duplicate-universes: 不自动删除（PRD §8.6）", () => {
  const sql = readSql(join("audits", "audit-duplicate-universes.sql"));
  assert.match(sql, /不自动删除|只读/);
});

test("A.6 audit-casting-portrayal-orphans: 只读", () => {
  const sql = readSql(join("audits", "audit-casting-portrayal-orphans.sql"));
  assert.doesNotMatch(sql, /\bINSERT\b/i);
  assert.doesNotMatch(sql, /\bUPDATE\b/i);
  assert.doesNotMatch(sql, /\bDELETE\b/i);
});

// ============================================================
// metadata migration 核验（PRD §8.1）
// ============================================================

test("§8.1 actor metadata migration 存在且幂等", () => {
  const sql = readSql("20260718060000_actor_metadata_and_email_revoke.sql");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb/);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.get_user_id_by_email\(text\) FROM anon, PUBLIC/);
});

// ============================================================
// 红线：全 migration 目录无新增 USING(true) 开放策略
// ============================================================

test("红线：20260720010000 之后不再出现新的 USING(true) 开放写策略", () => {
  // 排查 20260720010000 之后的 migration 文件（本批次新增）
  const files = readdirSync(migDir).filter(f => f.endsWith(".sql") && f >= "20260720000000");
  for (const f of files) {
    const sql = readSql(f);
    // 20260720010000 本身先 DROP 再 CREATE，CREATE 部分不应有 USING(true)
    // rollback 文件例外（紧急回滚需要恢复开放策略）
    if (f.includes("rollback")) continue;
    const lines = sql.split("\n");
    lines.forEach((line, i) => {
      // 允许 DROP POLICY ... 但不允许 CREATE POLICY ... USING (true)
      if (line.match(/CREATE POLICY/i) && line.match(/USING \(true\)/i)) {
        assert.fail(`${f}:${i+1} 不应新建 USING(true) 开放策略: ${line.trim()}`);
      }
      if (line.match(/CREATE POLICY/i) && line.match(/WITH CHECK \(true\)/i)) {
        assert.fail(`${f}:${i+1} 不应新建 WITH CHECK(true) 开放策略: ${line.trim()}`);
      }
    });
  }
});

console.log("universe-migrations.test.mjs: migration + RLS + rollback 静态验证就绪");
