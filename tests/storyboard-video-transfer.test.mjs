/**
 * Storyboard Video Transfer tests — PRD §9 TRAE-PW-P0-005 (fail-closed + re-sign).
 *
 * 覆盖：
 *   T1. storage.ts: validateVideoBytes 拒绝空/不支持，接受 mp4/webm/mov（含 charset）
 *   T2. storage.ts: buildVideoStoragePath 稳定路径 + 扩展名
 *   T3. storage.ts: uploadVideoArtifact 校验通过后因 env 缺失抛 MISSING_SUPABASE_STORAGE_CONFIG
 *   T4. storage.ts: signStoredVideo env 缺失抛 MISSING_SUPABASE_STORAGE_CONFIG
 *   T5. storage.ts: persistVideoArtifact wrapper 协调 upload→sign 顺序（mock fetch）
 *   T6. storage.ts: uploadVideoArtifact 调用 Supabase Storage POST /object/{bucket}/{path} + x-upsert
 *   T7. [jobId] route: 5 个状态机分支存在（running+done / running+error / result_ingesting / partial_failure / completed+re-sign）
 *   T8. [jobId] route: downloadAndTransfer 返回 tagged union（success / ingesting_error / partial_error）
 *   T9. [jobId] route: success → completed + result_url=signedUrl + storage_path
 *   T10. [jobId] route: ingesting_error → result_ingesting + result_url=null + storage_path=null
 *   T11. [jobId] route: partial_error → partial_failure + storage_path=已上传 + result_url=null
 *   T12. [jobId] route: providerTempUrl 永远为 null（不写入 DB），至少 5 处显式置 null
 *   T13. [jobId] route: retry-transfer 分支只 poll 不 submit（不重复计费）
 *   T14. [jobId] route: partial_failure + storage_path → 只调 signStoredVideo，不调 provider
 *   T15. [jobId] route: completed + storage_path → re-sign，失败不降级 status
 *   T16. [jobId] route: PATCH body 永远不含 providerTempUrl 非空值
 *   T17. jobs/route.ts: select 包含 storage_path
 *   T18. jobs/route.ts: completed + storage_path → 调用 signStoredVideo 重签
 *   T19. jobs/route.ts: 重签失败不降级 status（返回原 row）
 *   T20. migration: status CHECK 约束包含 result_ingesting 和 partial_failure
 *
 * 运行：node --test tests/storyboard-video-transfer.test.mjs
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  validateVideoBytes,
  SUPPORTED_VIDEO_CONTENT_TYPES,
  buildVideoStoragePath,
  uploadVideoArtifact,
  signStoredVideo,
  persistVideoArtifact,
} from "../lib/ai/video/storage.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// T1. validateVideoBytes
// ---------------------------------------------------------------------------

test("T1a: validateVideoBytes rejects empty bytes", () => {
  assert.throws(
    () => validateVideoBytes(new Uint8Array(0), "video/mp4"),
    /VIDEO_VALIDATION_FAILED:empty_bytes/,
  );
  assert.throws(
    () => validateVideoBytes(null, "video/mp4"),
    /VIDEO_VALIDATION_FAILED:empty_bytes/,
  );
});

test("T1b: validateVideoBytes rejects unsupported content-type", () => {
  assert.throws(
    () => validateVideoBytes(new Uint8Array([1, 2, 3]), "text/html"),
    /VIDEO_VALIDATION_FAILED:unsupported_content_type/,
  );
  assert.throws(
    () => validateVideoBytes(new Uint8Array([1, 2, 3]), "image/png"),
    /VIDEO_VALIDATION_FAILED:unsupported_content_type/,
  );
  assert.throws(
    () => validateVideoBytes(new Uint8Array([1, 2, 3]), ""),
    /VIDEO_VALIDATION_FAILED:unsupported_content_type/,
  );
});

test("T1c: validateVideoBytes accepts mp4/webm/mov (with optional charset)", () => {
  // 不抛即通过
  validateVideoBytes(new Uint8Array([1, 2, 3]), "video/mp4");
  validateVideoBytes(new Uint8Array([1, 2, 3]), "video/webm");
  validateVideoBytes(new Uint8Array([1, 2, 3]), "video/quicktime");
  // 带 charset 后缀
  validateVideoBytes(new Uint8Array([1, 2, 3]), "video/mp4; charset=utf-8");
  // 大小写不敏感
  validateVideoBytes(new Uint8Array([1, 2, 3]), "VIDEO/MP4");
});

test("T1d: SUPPORTED_VIDEO_CONTENT_TYPES exports mp4/webm/mov", () => {
  assert.ok(Array.isArray(SUPPORTED_VIDEO_CONTENT_TYPES));
  assert.ok(SUPPORTED_VIDEO_CONTENT_TYPES.includes("video/mp4"));
  assert.ok(SUPPORTED_VIDEO_CONTENT_TYPES.includes("video/webm"));
  assert.ok(SUPPORTED_VIDEO_CONTENT_TYPES.includes("video/quicktime"));
});

// ---------------------------------------------------------------------------
// T2. buildVideoStoragePath
// ---------------------------------------------------------------------------

test("T2: buildVideoStoragePath returns stable path with extension", () => {
  const p1 = buildVideoStoragePath("user-abc", "job-1", "shot-9", "video/mp4");
  const p2 = buildVideoStoragePath("user-abc", "job-1", "shot-9", "video/mp4");
  assert.equal(p1, p2);
  assert.match(p1, /^user-abc\/job-1\/shot-9\.mp4$/);

  assert.match(buildVideoStoragePath("u", "j", "s", "video/webm"), /\.webm$/);
  assert.match(buildVideoStoragePath("u", "j", "s", "video/quicktime"), /\.mov$/);
  // 未知 content-type 默认 .mp4
  assert.match(buildVideoStoragePath("u", "j", "s", "application/octet-stream"), /\.mp4$/);
});

// ---------------------------------------------------------------------------
// T3. uploadVideoArtifact — 校验通过后 env 缺失抛 MISSING_SUPABASE_STORAGE_CONFIG
// ---------------------------------------------------------------------------

test("T3: uploadVideoArtifact throws MISSING_SUPABASE_STORAGE_CONFIG when env missing (after validation)", async () => {
  const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    await assert.rejects(
      () => uploadVideoArtifact({
        userId: "u", jobId: "j", shotId: "s",
        bytes: new Uint8Array([1, 2, 3]),
        contentType: "video/mp4",
      }),
      /MISSING_SUPABASE_STORAGE_CONFIG/,
    );
  } finally {
    if (origUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
    if (origKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
  }
});

test("T3b: uploadVideoArtifact throws VIDEO_VALIDATION_FAILED before env check (invalid bytes)", async () => {
  // env 缺失也无所谓，validate 先抛
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  await assert.rejects(
    () => uploadVideoArtifact({
      userId: "u", jobId: "j", shotId: "s",
      bytes: new Uint8Array(0),
      contentType: "video/mp4",
    }),
    /VIDEO_VALIDATION_FAILED:empty_bytes/,
  );
});

// ---------------------------------------------------------------------------
// T4. signStoredVideo — env 缺失抛 MISSING_SUPABASE_STORAGE_CONFIG
// ---------------------------------------------------------------------------

test("T4: signStoredVideo throws MISSING_SUPABASE_STORAGE_CONFIG when env missing", async () => {
  const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    await assert.rejects(
      () => signStoredVideo("some/path.mp4"),
      /MISSING_SUPABASE_STORAGE_CONFIG/,
    );
  } finally {
    if (origUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
    if (origKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
  }
});

// ---------------------------------------------------------------------------
// T5/T6. persistVideoArtifact wrapper 协调 upload→sign（mock global fetch）
// ---------------------------------------------------------------------------

test("T5+T6: persistVideoArtifact calls upload (POST /object/{bucket}/{path}) then sign (POST /object/sign/{bucket}/{path})", async () => {
  const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-key";
  const origFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), method: opts?.method });
    const u = String(url);
    if (u.includes("/storage/v1/object/sign/")) {
      // sign response
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ signedURL: "/storage/v1/object/sign/storyboard-videos/u/j/s.mp4?token=abc" }),
      };
    }
    if (u.includes("/storage/v1/object/")) {
      // upload response
      return { ok: true, status: 200, text: async () => "" };
    }
    return { ok: false, status: 404, text: async () => "not found" };
  };
  try {
    const result = await persistVideoArtifact({
      userId: "u", jobId: "j", shotId: "s",
      bytes: new Uint8Array([1, 2, 3, 4]),
      contentType: "video/mp4",
    });
    // 顺序：先 upload 后 sign
    assert.ok(calls.length >= 2, `expected >= 2 fetch calls, got ${calls.length}`);
    assert.match(calls[0].url, /\/storage\/v1\/object\/storyboard-videos\//);
    assert.equal(calls[0].method, "POST");
    assert.match(calls[1].url, /\/storage\/v1\/object\/sign\/storyboard-videos\//);
    assert.equal(calls[1].method, "POST");
    // 返回 storagePath + signedUrl + expiresAt
    assert.match(result.storagePath, /^u\/j\/s\.mp4$/);
    assert.match(result.signedUrl, /^https:\/\/fake\.supabase\.co\//);
    assert.ok(result.expiresAt);
  } finally {
    globalThis.fetch = origFetch;
    if (origUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
    if (origKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
  }
});

test("T6b: uploadVideoArtifact sends x-upsert: true header (idempotent re-upload)", async () => {
  const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-key";
  const origFetch = globalThis.fetch;
  let capturedHeaders = null;
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes("/storage/v1/object/") && !String(url).includes("/sign/")) {
      capturedHeaders = opts?.headers;
    }
    return { ok: true, status: 200, text: async () => "" };
  };
  try {
    await uploadVideoArtifact({
      userId: "u", jobId: "j", shotId: "s",
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "video/mp4",
    });
    assert.ok(capturedHeaders, "upload fetch must be called");
    assert.equal(capturedHeaders["x-upsert"], "true", "x-upsert must be true for idempotent re-upload");
    assert.equal(capturedHeaders["Content-Type"], "video/mp4");
  } finally {
    globalThis.fetch = origFetch;
    if (origUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
    if (origKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
  }
});

// ---------------------------------------------------------------------------
// T7-T16: [jobId] route 源码契约
// ---------------------------------------------------------------------------

async function readJobRoute() {
  return read("../app/api/storyboard/jobs/[jobId]/route.ts");
}

test("T7: [jobId] route defines 5 state machine branches", async () => {
  const route = await readJobRoute();
  // branch 1: running + provider_task_id → poll + transfer
  assert.match(route, /job\.status === "running"[\s\S]*?provider_task_id/);
  // branch 2: result_ingesting + provider_task_id → retry-transfer
  assert.match(route, /job\.status === "result_ingesting"[\s\S]*?provider_task_id/);
  // branch 3: partial_failure + storage_path → re-sign only
  assert.match(route, /job\.status === "partial_failure"[\s\S]*?job\.storage_path/);
  // branch 4: completed + storage_path → re-sign result_url (§9.2)
  assert.match(route, /job\.status === "completed"[\s\S]*?job\.storage_path/);
  // branch 5: running + provider error → failed
  assert.match(route, /result\.status === "error"[\s\S]*?"failed"/);
});

test("T8: downloadAndTransfer returns tagged union (success / ingesting_error / partial_error)", async () => {
  const route = await readJobRoute();
  assert.match(route, /kind:\s*"success";\s*signedUrl:\s*string;\s*storagePath:\s*string/);
  assert.match(route, /kind:\s*"ingesting_error";\s*error:\s*string/);
  assert.match(route, /kind:\s*"partial_error";\s*storagePath:\s*string;\s*error:\s*string/);
});

test("T9: success → completed + result_url=signedUrl + storage_path", async () => {
  const route = await readJobRoute();
  assert.match(route, /transfer\.kind === "success"[\s\S]*?status:\s*"completed"[\s\S]*?result_url:\s*transfer\.signedUrl[\s\S]*?storage_path:\s*transfer\.storagePath/);
});

test("T10: ingesting_error → result_ingesting + result_url=null + storage_path=null", async () => {
  const route = await readJobRoute();
  assert.match(route, /transfer\.kind === "ingesting_error"[\s\S]*?status:\s*"result_ingesting"[\s\S]*?result_url:\s*null[\s\S]*?storage_path:\s*null/);
});

test("T11: partial_error → partial_failure + storage_path=已上传 + result_url=null", async () => {
  const route = await readJobRoute();
  assert.match(route, /transfer\.kind === "partial_error"[\s\S]*?status:\s*"partial_failure"[\s\S]*?storage_path:\s*transfer\.storagePath[\s\S]*?result_url:\s*null/);
});

test("T12: providerTempUrl is always null in DB writes (>= 5 explicit null assignments)", async () => {
  const route = await readJobRoute();
  const matches = route.match(/providerTempUrl:\s*null/g) || [];
  assert.ok(matches.length >= 5, `expected >= 5 providerTempUrl:null, got ${matches.length}`);
  // 永远不赋非 null 值
  assert.doesNotMatch(route, /providerTempUrl:\s*(?!null)\S/);
});

test("T13: retry-transfer branch only polls, never calls provider.submit (no double billing)", async () => {
  const route = await readJobRoute();
  // 整个 [jobId] route 不应出现 provider.submit
  assert.doesNotMatch(route, /provider\.submit\(/);  // 只匹配真实调用（带开括号），注释里是中文逗号
  // result_ingesting 分支必须 poll
  assert.match(route, /job\.status === "result_ingesting"[\s\S]*?provider\.poll\(job\.provider_task_id\)/);
});

test("T14: partial_failure + storage_path branch only calls signStoredVideo, not provider/download/upload", async () => {
  const route = await readJobRoute();
  // 定位 partial_failure 分支块
  const startIdx = route.indexOf('job.status === "partial_failure"');
  assert.ok(startIdx > 0, "partial_failure branch must exist");
  // 取该分支后 1500 字符窗口
  const window = route.slice(startIdx, startIdx + 1500);
  assert.match(window, /signStoredVideo\(job\.storage_path\)/);
  // 该窗口内不应调用 provider or downloadAndTransfer or uploadVideoArtifact
  assert.doesNotMatch(window, /provider\.poll/);
  assert.doesNotMatch(window, /downloadAndTransfer/);
  assert.doesNotMatch(window, /uploadVideoArtifact/);
});

test("T15: completed + storage_path → re-sign; failure does NOT downgrade status", async () => {
  const route = await readJobRoute();
  // 定位 completed re-sign 分支（§9.2）—— 取最后一个 'completed' 出现位置（branch 5 在文件末尾）
  const idx = route.lastIndexOf('job.status === "completed"');
  assert.ok(idx > 0, "completed re-sign branch must exist");
  const window = route.slice(idx, idx + 1000);
  assert.match(window, /signStoredVideo\(job\.storage_path\)/);
  // catch 块存在（re-sign 失败不抛到外层）
  assert.match(window, /catch\s*\{/);
  // 失败 catch 不写 status=failed（PRD §9.2：过期 signed URL 不得让 job 变成失败）
  assert.doesNotMatch(window, /status:\s*"failed"/);
});

test("T16: PATCH body never includes providerTempUrl with non-null value", async () => {
  const route = await readJobRoute();
  // patchJob body 构造逻辑只 push status/result_url/storage_path/error/result_metadata
  // 不应直接写 providerTempUrl 到顶层 body
  assert.doesNotMatch(route, /body\.providerTempUrl/);
});

// ---------------------------------------------------------------------------
// T17-T19: jobs/route.ts 源码契约
// ---------------------------------------------------------------------------

async function readJobsListRoute() {
  return read("../app/api/storyboard/jobs/route.ts");
}

test("T17: jobs list route select includes storage_path", async () => {
  const route = await readJobsListRoute();
  assert.match(route, /select=[^"]*storage_path/);
});

test("T18: jobs list route re-signs completed + storage_path via signStoredVideo", async () => {
  const route = await readJobsListRoute();
  assert.match(route, /row\.status === "completed"[\s\S]*?row\.storage_path[\s\S]*?signStoredVideo\(row\.storage_path\)/);
});

test("T19: jobs list route re-sign failure does NOT downgrade status (returns original row)", async () => {
  const route = await readJobsListRoute();
  // catch 块返回 row（不修改 status）
  assert.match(route, /signStoredVideo\(row\.storage_path\)[\s\S]*?catch[\s\S]*?return row/);
});

// ---------------------------------------------------------------------------
// T20. migration: status CHECK 约束包含 result_ingesting 和 partial_failure
// ---------------------------------------------------------------------------

test("T20: generation_jobs status CHECK constraint includes result_ingesting and partial_failure", async () => {
  // v4 core tables migration 定义了 status CHECK
  const migration = await read("../supabase/migrations/20260717010000_v4_core_tables.sql");
  assert.match(migration, /result_ingesting/);
  assert.match(migration, /partial_failure/);
  // 必须在 CHECK 约束中（不是注释）
  assert.match(migration, /CHECK\s*\([^)]*result_ingesting[^)]*\)/);
  assert.match(migration, /CHECK\s*\([^)]*partial_failure[^)]*\)/);
});
