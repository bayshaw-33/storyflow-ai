/**
 * Gate-A contract baseline — KIIKIS P0/P1 线上可信度修复 PRD (2026-08-21) §6 Gate A.4.
 *
 * 七类事实的契约锁定。撰写时（base b3ba9c1a）对应当前线上 bug 的断言为 RED，
 * 随各 P0/P1 切片修复逐一转 GREEN；已成立的行为（append-only、聊一聊不改正文）
 * 在此锁定，防止回归。
 *
 * Run: node --test tests/contracts-v22/p0p1-trust-contracts.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// 事实 1：聊一聊只 append 对话消息，绝不改正文（锁定，当前应 GREEN）
// ---------------------------------------------------------------------------
test("discuss route appends messages only and never touches unit content/versions", () => {
  const source = read("../../app/api/v2/works/[workId]/screenplay/discuss/route.ts");
  assert.doesNotMatch(source, /saveUnitContent|applyCandidate|updateUnitIdentity|updateUnitIdentity/);
  assert.doesNotMatch(source, /storyflow_screenplay_unit_versions/);
});

// ---------------------------------------------------------------------------
// 事实 2：Candidate 采用才创建版本；历史版本不被原地 UPDATE（锁定，当前应 GREEN）
// ---------------------------------------------------------------------------
test("version tables are append-only — no in-place UPDATE of historical versions", () => {
  for (const path of [
    "../../lib/server/v2/screenplays/units.ts",
    "../../lib/server/v2/screenplays/generation.ts",
    "../../lib/server/v2/works/versions.ts",
  ]) {
    const source = read(path);
    const versionTablePatch = /storyflow_(screenplay_unit_versions|work_versions)\?[^'"]*['"][^'"]*PATCH|PATCH[^'"]*['"][^'"]*storyflow_(screenplay_unit_versions|work_versions)\?/;
    assert.doesNotMatch(source, versionTablePatch, `${path} must not PATCH version tables`);
  }
  // candidate apply 只能通过 RPC，不允许直接写版本指针以外的旁路
  const generation = read("../../lib/server/v2/screenplays/generation.ts");
  assert.match(generation, /apply_screenplay_candidate/);
});

// ---------------------------------------------------------------------------
// 事实 3：五个剧本节点可自由创建与进入（P0-02 切片，撰写时 RED）
// ---------------------------------------------------------------------------
test("screenplay node creation is never hard-gated client-side or server-side", () => {
  const navigator = read("../../components/v2/screenplay-studio/UnitNavigator.tsx");
  assert.doesNotMatch(navigator, /请先确认上一阶段可用/, "client must not disable node creation buttons");
  const units = read("../../lib/server/v2/screenplays/units.ts");
  assert.doesNotMatch(units, /请先确认[^"]*再创建/, "server must not reject downstream unit creation");
});

// ---------------------------------------------------------------------------
// 事实 4：可见项目必须解析到可操作 Work（P0-02 切片，撰写时 RED）
// ---------------------------------------------------------------------------
test("dashboard renders real data only — fixture must be opt-in via env", () => {
  const source = read("../../lib/client/v2/dashboard/api.ts");
  assert.doesNotMatch(source, /USE_FIXTURE\s*=\s*true/, "fixture must not be the default data source");
  assert.match(source, /NEXT_PUBLIC_[A-Z_]*FIXTURE\s*===\s*"true"|isFixtureEnabled\(/);
});

test("project cards never fabricate a unitId that fails entry verification", () => {
  const source = read("../../lib/client/v2/project-library/helpers.ts");
  assert.doesNotMatch(source, /`project-\$\{/, "fabricated unitId 'project-<id>' triggers a false entry gate");
});

test("production workbench entry gate is non-blocking", () => {
  const source = read("../../components/production/ProductionWorkbench.tsx");
  assert.doesNotMatch(source, /该集未定稿或非剧本集，不能进入制作/, "hard block page must be replaced by a dismissible hint");
});

test("resolve-work provisions a stage work for an existing project instead of 404", () => {
  const source = read("../../app/api/v2/project-start/resolve-work/route.ts");
  assert.match(source, /ensure_project_stage_work|ensureUnifiedStage/, "existing projects must resolve to an operable work");
});

// ---------------------------------------------------------------------------
// 事实 5：Universe 列表/详情认证一致（P0-03 切片，撰写时 RED）
// ---------------------------------------------------------------------------
test("universe detail workbench resolves the real session instead of a null token", () => {
  const source = read("../../components/v2/universe/UniverseWorkbenchClient.tsx");
  assert.doesNotMatch(source, /fetchUniverseBundle\(\s*[^,]+,\s*null\s*,/, "null accessToken forces a client-side false 'please login'");
  assert.match(source, /getSession|resolveAccessToken|getAccessToken/, "component must resolve the Supabase session like the list page");
});

// ---------------------------------------------------------------------------
// 事实 6：取消创建不产生任何持久对象（P0-06 切片，撰写时 RED）
// ---------------------------------------------------------------------------
test("module card click opens a confirmation step instead of creating a project", () => {
  const source = read("../../components/v2/project-start/ProjectStartFlow.tsx");
  assert.doesNotMatch(source, /onClick=\{\(\) => handleStart\(/, "clicking a module must not call the create API");
  assert.match(source, /pendingModule|confirmModule|ProjectStartConfirm/, "a confirmation step must exist");
});

// ---------------------------------------------------------------------------
// 事实 7：标题与正文一起保存，标题不因保存/刷新丢失（P0-04 切片，撰写时 RED）
// ---------------------------------------------------------------------------
test("screenplay studio persists the edited title as part of save", () => {
  const source = read("../../components/v2/screenplay-studio/ScreenplayStudio.tsx");
  assert.match(source, /updateUnitIdentity/, "save flow must PATCH unit identity when the title is dirty");
});

// ---------------------------------------------------------------------------
// P0-05：任务中心查询与真实 schema 对齐，错误不得泄露 SQL（撰写时 RED）
// ---------------------------------------------------------------------------
test("job center queries only columns that exist on storyflow_exports", async () => {
  const source = read("../../lib/server/v2/jobs/index.ts");
  const exportsSelects = [...source.matchAll(/storyflow_exports\?[^"'`]*select=([a-z_,]+)/g)];
  assert.ok(exportsSelects.length >= 2, "expected list + detail exports selects");
  for (const match of exportsSelects) {
    const columns = match[1].split(",");
    assert.ok(!columns.includes("updated_at"), "storyflow_exports has no updated_at column (baseline.sql:521)");
    assert.ok(!columns.includes("completed_at"), "storyflow_exports has no completed_at column");
  }
  // PATCH bodies for the exports table must not write nonexistent columns
  assert.doesNotMatch(source, /exportBody = JSON\.stringify\(\{[^}]*completed_at/);
});

test("job center errors are sanitized — raw PostgREST payloads never reach the client", async () => {
  const { listUnifiedJobs } = await import("../../lib/server/v2/jobs/index.ts");
  const rawSql = "Could not find the 'updated_at' column of 'storyflow_exports' in the 'public' schema";
  const failingFetcher = async () => {
    throw new Error(`SUPABASE_SERVICE_ERROR:400:${JSON.stringify({ code: "PGRST204", message: rawSql })}`);
  };
  await assert.rejects(
    listUnifiedJobs({ fetcher: failingFetcher, userId: "u-1" }),
    (error) => {
      assert.equal(error.code, "schema_not_deployed");
      assert.ok(!error.message.includes("PGRST204"), "PostgREST code must not leak");
      assert.ok(!error.message.includes("updated_at"), "column name must not leak");
      assert.ok(!error.message.includes(rawSql), "raw SQL message must not leak");
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// P1-06：遗留入口解析失败不得丢弃 projectId 重定向到新建页（撰写时 RED）
// ---------------------------------------------------------------------------
test("legacy workbench entries keep the projectId on resolution failure", () => {
  for (const legacyPage of [
    "../../app/script-workbench/page.tsx",
    "../../app/production-workbench/page.tsx",
    "../../app/storyboard-workbench/page.tsx",
    "../../app/video-workbench/page.tsx",
    "../../app/art-workbench/page.tsx",
  ]) {
    const source = read(legacyPage);
    assert.doesNotMatch(
      source,
      /router\.replace\(\s*["']\/projects\/new-v2["']\s*\)/,
      `${legacyPage} must not strand the user on the new-project grid, dropping projectId`,
    );
  }
});
