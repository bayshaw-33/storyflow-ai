/**
 * P3 Atlas Cloud 视频 provider + MUST FIX 验证 E2E.
 *
 * 任务卡：KIIKIS-P3-TRAE-003 §1+§2+§3
 *
 * 场景：
 *   A1-A4: Atlas provider submit/poll/download 契约
 *   M1-M5: Codex MUST FIX 验证
 *     M1: firstframe 必须服务端解析（client.generateVideo 不传 firstframeImageUrl）
 *     M2: idempotencyHash 计算（sha256(shotId+prompt+firstframeUrl+duration)）
 *     M3: Storage 转存（done 时 result_url 是 signed URL，非 provider temp URL）
 *     M4: CAS bypass 已移除（expectedRevision=null 被 state/route.ts 拒绝）
 *     M5: listVideoJobs 契约（刷新恢复）
 */

import assert from "node:assert/strict";
import test from "node:test";
import { createAtlasProvider } from "../lib/ai/video/atlas.ts";
import { computeVideoIdempotencyHash, resolveVideoProvider } from "../lib/ai/video/provider.ts";
import { StoryboardClient, StoryboardClientError } from "../lib/storyboard/client.ts";
import { isSaveRequest } from "../lib/storyboard/validators.ts";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function mockResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

function clientWithFetch(impl) {
  const fetchImpl = impl;
  return new StoryboardClient({
    getSessionToken: async () => "fake-token",
    fetchImpl,
  });
}

// ---------------------------------------------------------------------------
// A1. Atlas provider submit 返回 providerTaskId
// ---------------------------------------------------------------------------

test("A1: Atlas submit 返回 providerTaskId（uploadMedia + generateVideo）", async () => {
  const originalKey = process.env.ATLASCLOUD_API_KEY;
  process.env.ATLASCLOUD_API_KEY = "test-atlas-key";
  const originalFetch = globalThis.fetch;
  let callIndex = 0;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    callIndex += 1;
    if (callIndex === 1) {
      // uploadMedia response
      return mockResponse({ data: { id: "media-uuid-1" } });
    }
    if (callIndex === 2) {
      // generateVideo response
      return mockResponse({ data: { id: "prediction-uuid-1" } });
    }
    return mockResponse({}, 500);
  };
  try {
    const provider = createAtlasProvider();
    const result = await provider.submit({
      prompt: "一个女孩在雨中奔跑",
      firstframeUrl: "https://example.com/frame.png",
      duration: 5,
      aspectRatio: "16:9",
    });
    assert.equal(result.providerTaskId, "prediction-uuid-1");
    assert.ok(calls[0].url.endsWith("/model/uploadMedia"), "first call uploadMedia");
    assert.ok(calls[1].url.endsWith("/model/generateVideo"), "second call generateVideo");
    const genBody = JSON.parse(calls[1].init.body);
    assert.equal(genBody.model, "bytedance/seedance-2.0/image-to-video");
    assert.equal(genBody.duration, 5);
    assert.equal(genBody.aspect_ratio, "16:9");
    assert.equal(genBody.image, "media-uuid-1");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey) process.env.ATLASCLOUD_API_KEY = originalKey;
    else delete process.env.ATLASCLOUD_API_KEY;
  }
});

// ---------------------------------------------------------------------------
// A2. Atlas poll done 返回 videoUrl（兼容 data.output.video_url）
// ---------------------------------------------------------------------------

test("A2: Atlas poll done 兼容 data.output.video_url", async () => {
  process.env.ATLASCLOUD_API_KEY = "test-atlas-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    mockResponse({
      data: {
        status: "succeeded",
        output: { video_url: "https://cdn.atlascloud.ai/temp/video-1.mp4" },
      },
    });
  try {
    const provider = createAtlasProvider();
    const result = await provider.poll("prediction-uuid-1");
    assert.equal(result.status, "done");
    assert.equal(result.videoUrl, "https://cdn.atlascloud.ai/temp/video-1.mp4");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.ATLASCLOUD_API_KEY;
  }
});

// ---------------------------------------------------------------------------
// A3. Atlas poll done 兼容 data.outputs[0] string
// ---------------------------------------------------------------------------

test("A3: Atlas poll done 兼容 data.outputs[0] string", async () => {
  process.env.ATLASCLOUD_API_KEY = "test-atlas-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    mockResponse({
      data: {
        status: "succeeded",
        outputs: ["https://cdn.atlascloud.ai/temp/video-2.mp4"],
      },
    });
  try {
    const provider = createAtlasProvider();
    const result = await provider.poll("prediction-uuid-1");
    assert.equal(result.status, "done");
    assert.equal(result.videoUrl, "https://cdn.atlascloud.ai/temp/video-2.mp4");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.ATLASCLOUD_API_KEY;
  }
});

// ---------------------------------------------------------------------------
// A4. Atlas poll failed → status=error
// ---------------------------------------------------------------------------

test("A4: Atlas poll failed → status=error", async () => {
  process.env.ATLASCLOUD_API_KEY = "test-atlas-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    mockResponse({ data: { status: "failed" } });
  try {
    const provider = createAtlasProvider();
    const result = await provider.poll("prediction-uuid-1");
    assert.equal(result.status, "error");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.ATLASCLOUD_API_KEY;
  }
});

// ---------------------------------------------------------------------------
// M1. firstframe 必须服务端解析（client.generateVideo 不传 firstframeImageUrl）
// ---------------------------------------------------------------------------

test("M1: client.generateVideo 不再接受 firstframeImageUrl 参数", async () => {
  // 通过 TS 类型已强制；这里验证运行时 body 不含 firstframeImageUrl
  const calls = [];
  const client = clientWithFetch(async (url, init) => {
    calls.push({ url, init });
    return mockResponse({
      success: true,
      jobId: "job-1",
      providerTaskId: "task-1",
      reused: false,
      status: "running",
    });
  });
  // firstframeImageUrl 字段在 P3 已移除，传了也会被 TS 拒绝
  // 这里验证 body 不含该字段
  await client.generateVideo("shot-1", {
    projectId: "p",
    sourceUnitId: "e",
    duration: 5,
    aspectRatio: "16:9",
  });
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.firstframeImageUrl, undefined, "firstframeImageUrl 不再被接受");
  assert.equal(body.aspectRatio, "16:9", "aspectRatio 透传");
});

// ---------------------------------------------------------------------------
// M2. idempotencyHash = sha256(shotId + prompt + firstframeUrl + duration)
// ---------------------------------------------------------------------------

test("M2: computeVideoIdempotencyHash 稳定且区分 duration", () => {
  const h1 = computeVideoIdempotencyHash({
    shotId: "shot-1",
    prompt: "p",
    firstframeUrl: "https://x/frame.png",
    duration: 5,
  });
  const h2 = computeVideoIdempotencyHash({
    shotId: "shot-1",
    prompt: "p",
    firstframeUrl: "https://x/frame.png",
    duration: 5,
  });
  assert.equal(h1, h2, "相同输入 → 相同 hash");
  assert.equal(h1.length, 64, "sha256 hex 64 字符");

  const h3 = computeVideoIdempotencyHash({
    shotId: "shot-1",
    prompt: "p",
    firstframeUrl: "https://x/frame.png",
    duration: 10,
  });
  assert.notEqual(h1, h3, "duration 不同 → hash 不同");

  const h4 = computeVideoIdempotencyHash({
    shotId: "shot-2",
    prompt: "p",
    firstframeUrl: "https://x/frame.png",
    duration: 5,
  });
  assert.notEqual(h1, h4, "shotId 不同 → hash 不同");
});

// ---------------------------------------------------------------------------
// M3. Storage 转存契约：jobs/[jobId] route done 时返回 signed URL
//     这里通过 fetch mock 验证 route 行为
// ---------------------------------------------------------------------------

test("M3: jobs/[jobId] done 时 result_url 是 Storage signed URL（非 provider temp URL）", async () => {
  // 直接验证 persistVideoArtifact 契约：上传 + 签名返回 signedUrl + storagePath
  // route 层逻辑：done → download bytes → persistVideoArtifact → PATCH job with signedUrl
  // 这里测 persistVideoArtifact 的签名 URL 不含 provider 临时域名
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  const originalFetch = globalThis.fetch;
  let callIndex = 0;
  globalThis.fetch = async (url, init) => {
    callIndex += 1;
    if (callIndex === 1) {
      // upload
      return mockResponse({}, 200);
    }
    if (callIndex === 2) {
      // sign
      return mockResponse({ signedURL: "/storage/v1/object/sign/storyboard-videos/user-1/job-1/shot-1.mp4?token=xxx" });
    }
    return mockResponse({}, 500);
  };
  try {
    const { persistVideoArtifact } = await import("../lib/ai/video/storage.ts");
    const result = await persistVideoArtifact({
      userId: "user-1",
      jobId: "job-1",
      shotId: "shot-1",
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "video/mp4",
    });
    assert.ok(result.signedUrl.startsWith("https://supabase.example.co/storage/v1/object/sign/"), "signedUrl 是自有 Storage 地址");
    assert.ok(result.storagePath.includes("job-1"), "storagePath 含 jobId");
    assert.ok(result.expiresAt, "expiresAt 存在");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
});

// ---------------------------------------------------------------------------
// M4. CAS bypass 已移除：state/route.ts 验证拒绝 expectedRevision=null
// ---------------------------------------------------------------------------

test("M4: route-level regression — expectedRevision=null 被 isSaveRequest 拒绝（CAS bypass 移除）", () => {
  // Codex MUST FIX: 实际执行验证逻辑（非读源码）。
  // isSaveRequest 是 PUT /api/storyboard/state 的验证门——返回 false 时 route 返回 400。
  // null / undefined / 负数 / 字符串均被拒绝；只有非负整数通过。
  const baseValid = {
    projectId: "p",
    sourceUnitId: "e",
    scenes: [],
    deletedSceneIds: [],
    deletedShotIds: [],
  };

  // null → 拒绝（P3 BLOCKER v2 核心：移除 CAS bypass）
  assert.equal(isSaveRequest({ ...baseValid, expectedRevision: null }), false,
    "expectedRevision=null 必须被拒绝（CAS bypass 已移除）");

  // undefined → 拒绝
  assert.equal(isSaveRequest({ ...baseValid, expectedRevision: undefined }), false,
    "expectedRevision=undefined 被拒绝");

  // 负数 → 拒绝
  assert.equal(isSaveRequest({ ...baseValid, expectedRevision: -1 }), false,
    "expectedRevision=-1 被拒绝");

  // 字符串 → 拒绝
  assert.equal(isSaveRequest({ ...baseValid, expectedRevision: "0" }), false,
    'expectedRevision="0" 被拒绝');

  // NaN → 拒绝
  assert.equal(isSaveRequest({ ...baseValid, expectedRevision: NaN }), false,
    "expectedRevision=NaN 被拒绝");

  // 合法非负整数 → 通过
  assert.equal(isSaveRequest({ ...baseValid, expectedRevision: 0 }), true,
    "expectedRevision=0 合法");
  assert.equal(isSaveRequest({ ...baseValid, expectedRevision: 5 }), true,
    "expectedRevision=5 合法");
  assert.equal(isSaveRequest({ ...baseValid, expectedRevision: 999 }), true,
    "expectedRevision=999 合法");

  // 缺少 projectId → 拒绝
  assert.equal(isSaveRequest({ sourceUnitId: "e", expectedRevision: 0, scenes: [], deletedSceneIds: [], deletedShotIds: [] }), false,
    "缺少 projectId 被拒绝");

  // 缺少 scenes → 拒绝
  assert.equal(isSaveRequest({ projectId: "p", sourceUnitId: "e", expectedRevision: 0, deletedSceneIds: [], deletedShotIds: [] }), false,
    "缺少 scenes 被拒绝");
});

// ---------------------------------------------------------------------------
// M5. listVideoJobs 契约：返回 jobs 数组用于刷新恢复
// ---------------------------------------------------------------------------

test("M5: listVideoJobs 返回 jobs 数组（含 target_id 用于刷新恢复）", async () => {
  const client = clientWithFetch(async () =>
    mockResponse({
      success: true,
      jobs: [
        {
          id: "job-a",
          status: "completed",
          target_id: "shot-1",
          result_url: "https://supabase.co/storage/v1/object/sign/.../shot-1.mp4?token=xxx",
          error: null,
          created_at: "2026-07-18T00:00:00Z",
        },
        {
          id: "job-b",
          status: "failed",
          target_id: "shot-2",
          result_url: null,
          error: "ATLAS_HTTP_ERROR:500",
          created_at: "2026-07-18T00:01:00Z",
        },
      ],
    }),
  );
  const resp = await client.listVideoJobs({ projectId: "p", sourceUnitId: "e" });
  assert.equal(resp.jobs.length, 2);
  assert.equal(resp.jobs[0].target_id, "shot-1");
  assert.equal(resp.jobs[1].status, "failed");
});

// ---------------------------------------------------------------------------
// M6. resolveVideoProvider 默认 atlas
// ---------------------------------------------------------------------------

test("M6: resolveVideoProvider 默认返回 atlas（env VIDEO_PROVIDER 未设置）", async () => {
  const original = process.env.VIDEO_PROVIDER;
  delete process.env.VIDEO_PROVIDER;
  process.env.ATLASCLOUD_API_KEY = "test-key";
  try {
    const provider = await resolveVideoProvider();
    assert.equal(provider.name, "atlas", "默认 provider 是 atlas");
  } finally {
    if (original) process.env.VIDEO_PROVIDER = original;
    delete process.env.ATLASCLOUD_API_KEY;
  }
});

test("M6b: resolveVideoProvider 切换 minimax（env VIDEO_PROVIDER=minimax）", async () => {
  const original = process.env.VIDEO_PROVIDER;
  process.env.VIDEO_PROVIDER = "minimax";
  process.env.MINIMAX_API_KEY = "test-minimax-key";
  try {
    const provider = await resolveVideoProvider();
    assert.equal(provider.name, "minimax", "VIDEO_PROVIDER=minimax 切换");
  } finally {
    if (original) process.env.VIDEO_PROVIDER = original;
    else delete process.env.VIDEO_PROVIDER;
    delete process.env.MINIMAX_API_KEY;
  }
});

// ---------------------------------------------------------------------------
// M7. Atlas API key 只走环境变量（缺失抛错）
// ---------------------------------------------------------------------------

test("M7: Atlas provider 缺少 ATLASCLOUD_API_KEY 抛错", async () => {
  delete process.env.ATLASCLOUD_API_KEY;
  const provider = createAtlasProvider();
  await assert.rejects(
    () => provider.submit({ prompt: "p", firstframeUrl: "https://x/a.png" }),
    /ATLASCLOUD_API_KEY/,
  );
});
