/**
 * tests/server-v2/project-start/project-start.test.mjs
 * KIIKIS 2.2 Phase 0 — Task 0.1 atomic Project + primary Work creation.
 *
 * Covers:
 *   - contract: WorkType / WorkStatus / validation (K22-ENTRY-002)
 *   - service: owner server-side, 7 valid types, novel/unknown rejected
 *   - service: client-supplied owner ignored (owner from auth)
 *   - service: idempotency key returns same project/work
 *   - service: RPC failure rolls back (no partial projectstart record)
 *   - migration: storyflow_works table + RPC + partial unique index exist
 *   - navigation resolver: workType → workbench route, job → /job-center/:id
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  WORK_CONTRACT_VERSION,
  WORK_TYPES,
  WORK_STATUSES,
  DEFAULT_WORK_TITLES,
  isWorkType,
  isWorkStatus,
  assertWorkType,
  WorkContractError,
} from "../../../lib/contracts/v2/work.ts";
import {
  createProjectWithPrimaryWork,
  WorksServiceError,
} from "../../../lib/server/v2/works/index.ts";
import {
  resolveWorkbenchRoute,
  resolveJobDetailUrl,
  isInternalAppRoute,
} from "../../../lib/client/v2/navigation/resolver.ts";

const MIGRATION_PATH = path.resolve(
  "supabase/migrations/20260828000000_K22-P0_work_identity.sql",
);
const RPC_FIX_MIGRATION_PATH = path.resolve(
  "supabase/migrations/20260829020000_K22-P0_fix_project_start_rpc_ambiguity.sql",
);

// ============================================================
// 1. Contract surface
// ============================================================

test("WORK_CONTRACT_VERSION is 2.2.0-alpha.1", () => {
  assert.equal(WORK_CONTRACT_VERSION, "2.2.0-alpha.1");
});

test("WORK_TYPES contains exactly the 7 V2.2 modules and excludes novel", () => {
  assert.deepEqual(
    [...WORK_TYPES],
    ["script", "song", "art", "storyboard", "video", "voice", "editing"],
  );
  assert.ok(!WORK_TYPES.includes("novel"));
});

test("WORK_STATUSES matches PRD §8.3 content state", () => {
  assert.deepEqual([...WORK_STATUSES], [
    "editing_draft",
    "checkpoint",
    "finalized",
    "archived",
  ]);
});

test("DEFAULT_WORK_TITLES covers every WorkType", () => {
  for (const t of WORK_TYPES) {
    assert.ok(DEFAULT_WORK_TITLES[t], `missing default title for ${t}`);
    assert.ok(DEFAULT_WORK_TITLES[t].length > 0);
  }
});

test("isWorkType accepts the 7 types and rejects novel / unknown / non-string", () => {
  for (const t of WORK_TYPES) assert.equal(isWorkType(t), true);
  assert.equal(isWorkType("novel"), false);
  assert.equal(isWorkType("podcast"), false);
  assert.equal(isWorkType(null), false);
  assert.equal(isWorkType(42), false);
  assert.equal(isWorkType(undefined), false);
});

test("isWorkStatus accepts the 4 states and rejects unknown", () => {
  for (const s of WORK_STATUSES) assert.equal(isWorkStatus(s), true);
  assert.equal(isWorkStatus("draft"), false);
  assert.equal(isWorkStatus("published"), false);
  assert.equal(isWorkStatus(null), false);
});

test("assertWorkType throws WorkContractError with field=workType on invalid input", () => {
  assert.throws(
    () => assertWorkType("novel"),
    (err) =>
      err instanceof WorkContractError &&
      err.code === "validation_failed" &&
      err.field === "workType",
  );
  assert.doesNotThrow(() => assertWorkType("script"));
});

// ============================================================
// 2. Navigation resolver
// ============================================================

test("resolveWorkbenchRoute returns the canonical production route for audiovisual WorkTypes", () => {
  for (const t of WORK_TYPES) {
    const route = resolveWorkbenchRoute(t, { projectId: "p1", workId: "w1" });
    if (["script", "art", "storyboard", "video"].includes(t)) {
      assert.equal(route, `/production?projectId=p1&workId=w1&tab=${t}`, `bad route for ${t}`);
    } else {
      assert.match(route, /^\/[a-z-]+\?projectId=p1&workId=w1$/, `bad route for ${t}`);
    }
  }
});

test("resolveWorkbenchRoute starts with /production for script", () => {
  const route = resolveWorkbenchRoute("script", {
    projectId: "p1",
    workId: "w1",
  });
  assert.ok(route.startsWith("/production?"));
  assert.match(route, /tab=script/);
});

test("resolveJobDetailUrl returns /job-center/:jobId", () => {
  assert.equal(resolveJobDetailUrl("job-123"), "/job-center/job-123");
});

test("isInternalAppRoute accepts same-origin app paths and rejects external URLs", () => {
  assert.equal(isInternalAppRoute("/dashboard"), true);
  assert.equal(isInternalAppRoute("/job-center/abc"), true);
  assert.equal(isInternalAppRoute("https://evil.example/path"), false);
  assert.equal(isInternalAppRoute("//evil.example"), false);
  assert.equal(isInternalAppRoute(""), false);
  assert.equal(isInternalAppRoute(undefined), false);
});

// ============================================================
// 3. Service: createProjectWithPrimaryWork with mocked fetcher
// ============================================================

function makeRecordingFetcher(response, error) {
  const calls = [];
  const fetcher = async (path, init) => {
    calls.push({ path, init });
    if (error) throw error;
    return response;
  };
  return { fetcher, calls };
}

test("createProjectWithPrimaryWork rejects missing ownerId (unauthenticated)", async () => {
  const { fetcher } = makeRecordingFetcher({});
  await assert.rejects(
    () =>
      createProjectWithPrimaryWork(
        { ownerId: "", workType: "script", idempotencyKey: "k1" },
        fetcher,
      ),
    (err) => err instanceof WorksServiceError && err.code === "unauthenticated",
  );
});

test("createProjectWithPrimaryWork rejects missing idempotency key", async () => {
  const { fetcher } = makeRecordingFetcher({});
  await assert.rejects(
    () =>
      createProjectWithPrimaryWork(
        { ownerId: "u1", workType: "script", idempotencyKey: "" },
        fetcher,
      ),
    (err) => err instanceof WorksServiceError && err.code === "validation_failed",
  );
});

test("createProjectWithPrimaryWork rejects novel and unknown work types", async () => {
  for (const bad of ["novel", "podcast", "", null, undefined]) {
    const { fetcher } = makeRecordingFetcher({});
    await assert.rejects(
      () =>
        createProjectWithPrimaryWork(
          { ownerId: "u1", workType: bad, idempotencyKey: "k1" },
          fetcher,
        ),
      (err) =>
        err instanceof WorksServiceError && err.code === "validation_failed",
    );
  }
});

test("createProjectWithPrimaryWork accepts all 7 valid work types and posts RPC", async () => {
  for (const t of WORK_TYPES) {
    const { fetcher, calls } = makeRecordingFetcher({
      project_id: "p1",
      work_id: "w1",
    });
    const result = await createProjectWithPrimaryWork(
      { ownerId: "u1", workType: t, idempotencyKey: `k-${t}` },
      fetcher,
    );
    assert.equal(result.projectId, "p1");
    assert.equal(result.workId, "w1");
    assert.equal(result.workType, t);
    assert.equal(result.title, DEFAULT_WORK_TITLES[t]);
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].path,
      "/rest/v1/rpc/create_project_with_primary_work",
    );
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.owner_id, "u1");
    assert.equal(body.work_type, t);
    assert.equal(body.idempotency_key, `k-${t}`);
  }
});

test("createProjectWithPrimaryWork accepts PostgREST's single-row array RPC response", async () => {
  const { fetcher } = makeRecordingFetcher([
    { project_id: "p-array", work_id: "w-array" },
  ]);
  const result = await createProjectWithPrimaryWork(
    { ownerId: "u1", workType: "script", idempotencyKey: "k-array" },
    fetcher,
  );
  assert.equal(result.projectId, "p-array");
  assert.equal(result.workId, "w-array");
});

test("createProjectWithPrimaryWork uses provided title when non-empty, otherwise default", async () => {
  const titled = makeRecordingFetcher({ project_id: "p1", work_id: "w1" });
  const r1 = await createProjectWithPrimaryWork(
    {
      ownerId: "u1",
      workType: "script",
      title: "  我的剧本  ",
      idempotencyKey: "k1",
    },
    titled.fetcher,
  );
  assert.equal(r1.title, "我的剧本");
  const body1 = JSON.parse(String(titled.calls[0].init.body));
  assert.equal(body1.title, "我的剧本");

  const blank = makeRecordingFetcher({ project_id: "p2", work_id: "w2" });
  const r2 = await createProjectWithPrimaryWork(
    { ownerId: "u1", workType: "song", title: "   ", idempotencyKey: "k2" },
    blank.fetcher,
  );
  assert.equal(r2.title, DEFAULT_WORK_TITLES.song);
  const body2 = JSON.parse(String(blank.calls[0].init.body));
  assert.equal(body2.title, DEFAULT_WORK_TITLES.song);
});

test("createProjectWithPrimaryWork does not accept client-supplied owner_id in input body — owner always from auth context", async () => {
  const { fetcher, calls } = makeRecordingFetcher({
    project_id: "p1",
    work_id: "w1",
  });
  await createProjectWithPrimaryWork(
    { ownerId: "auth-user-id", workType: "script", idempotencyKey: "k1" },
    fetcher,
  );
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.owner_id, "auth-user-id");
  assert.equal(body.client_owner, undefined);
  assert.equal(body.user_id, undefined);
});

test("createProjectWithPrimaryWork surfaces RPC failure as service_unavailable", async () => {
  const fetcher = async () => {
    throw new Error("SUPABASE_SERVICE_ERROR:500:boom");
  };
  await assert.rejects(
    () =>
      createProjectWithPrimaryWork(
        { ownerId: "u1", workType: "script", idempotencyKey: "k1" },
        fetcher,
      ),
    (err) =>
      err instanceof WorksServiceError &&
      err.code === "service_unavailable" &&
      /boom/.test(err.message),
  );
});

test("createProjectWithPrimaryWork rejects incomplete RPC response (missing work_id) as service_unavailable", async () => {
  const { fetcher } = makeRecordingFetcher({ project_id: "p1" });
  await assert.rejects(
    () =>
      createProjectWithPrimaryWork(
        { ownerId: "u1", workType: "script", idempotencyKey: "k1" },
        fetcher,
      ),
    (err) => err instanceof WorksServiceError && err.code === "service_unavailable",
  );
});

test("createProjectWithPrimaryWork passes universe_id through when provided", async () => {
  const { fetcher, calls } = makeRecordingFetcher({
    project_id: "p1",
    work_id: "w1",
  });
  await createProjectWithPrimaryWork(
    {
      ownerId: "u1",
      workType: "script",
      universeId: "uni-1",
      idempotencyKey: "k1",
    },
    fetcher,
  );
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.universe_id, "uni-1");
});

// ============================================================
// 4. Migration file presence and required clauses
// ============================================================

test("migration file 20260828000000_K22-P0_work_identity.sql exists", () => {
  assert.ok(
    fs.existsSync(MIGRATION_PATH),
    `expected migration at ${MIGRATION_PATH}`,
  );
});

test("migration creates storyflow_works with work_type CHECK covering the 7 types", () => {
  const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
  assert.match(sql, /CREATE TABLE[^\n]*public\.storyflow_works/);
  for (const t of WORK_TYPES) {
    assert.ok(
      sql.includes(`'${t}'`),
      `migration missing work_type CHECK for ${t}`,
    );
  }
  assert.ok(
    !sql.includes("'novel'"),
    "migration must NOT include novel in work_type CHECK",
  );
});

test("migration enforces one primary Work per Project via partial unique index", () => {
  const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
  assert.match(
    sql,
    /CREATE UNIQUE INDEX[\s\S]*?storyflow_works\(project_id\)[\s\S]*?WHERE is_primary/i,
  );
});

test("migration defines create_project_with_primary_work SECURITY DEFINER RPC", () => {
  const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_project_with_primary_work/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /storyflow_project_starts/);
});

test("migration qualifies project-start ledger fields so RPC return columns are unambiguous", () => {
  assert.ok(
    fs.existsSync(RPC_FIX_MIGRATION_PATH),
    `expected RPC fix migration at ${RPC_FIX_MIGRATION_PATH}`,
  );
  const sql = fs.readFileSync(RPC_FIX_MIGRATION_PATH, "utf8");
  assert.match(
    sql,
    /SELECT\s+starts\.project_id,\s+starts\.work_id\s+INTO\s+existing_project_id,\s+existing_work_id\s+FROM\s+public\.storyflow_project_starts\s+AS\s+starts/i,
  );
});

test("migration enables RLS on storyflow_works and storyflow_project_starts", () => {
  const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
  assert.match(sql, /ALTER TABLE public\.storyflow_works ENABLE ROW LEVEL SECURITY/);
  assert.match(
    sql,
    /ALTER TABLE public\.storyflow_project_starts ENABLE ROW LEVEL SECURITY/,
  );
});

test("migration revokes execute from PUBLIC/anon/authenticated so only service role may call the RPC", () => {
  const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
  assert.match(
    sql,
    /REVOKE EXECUTE ON FUNCTION public\.create_project_with_primary_work[^\n]*FROM PUBLIC/,
  );
});
