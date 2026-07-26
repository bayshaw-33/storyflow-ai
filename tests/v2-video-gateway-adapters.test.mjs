/**
 * TRAE-V2-05 Video Gateway Adapters
 * Runway + Seedance adapter 行为测试（fetch mock）
 *
 * 验证目标：
 *   1. Runway adapter：API Key 缺失时 submit/poll 抛 PROVIDER_UNAVAILABLE
 *   2. Runway adapter：submit 成功返回 providerTaskId
 *   3. Runway adapter：poll 成功映射状态和 videoUrl
 *   4. Runway adapter：HTTP 4xx/5xx 错误映射
 *   5. Runway adapter：网络超时映射 PROVIDER_TIMEOUT
 *   6. Runway adapter：cancel 返回 boolean
 *   7. Seedance adapter：API Key 缺失时抛 PROVIDER_UNAVAILABLE
 *   8. Seedance adapter：submit 成功返回 providerTaskId
 *   9. Seedance adapter：poll 成功映射状态和 videoUrl
 *  10. Seedance adapter：HTTP 404 映射 JOB_NOT_FOUND
 *  11. Seedance adapter：不支持 cancel（cancel 方法为 undefined）
 *
 * 运行：node --test tests/v2-video-gateway-adapters.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createRunwayGatewayProvider } from "../lib/video-gateway/adapters/runway.ts";
import { createSeedanceGatewayProvider } from "../lib/video-gateway/adapters/seedance.ts";
import { VideoGatewayError, isVideoGatewayError } from "../lib/video-gateway/types.ts";

// ============================================================
// fetch mock 工具
// ============================================================

/** 临时替换 globalThis.fetch，返回预设响应，并在调用时记录请求 */
function mockFetch(responder) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return await responder(url, init);
  };
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function networkError(message) {
  return new Error(message);
}

// ============================================================
// Runway Adapter 测试
// ============================================================

test("Runway adapter: API Key 缺失时 submit 抛 PROVIDER_UNAVAILABLE", async () => {
  const saved = process.env.RUNWAY_API_KEY;
  delete process.env.RUNWAY_API_KEY;
  try {
    const provider = createRunwayGatewayProvider();
    await assert.rejects(
      () => provider.submit({
        prompt: "test",
        firstframeUrl: "https://example.com/img.jpg",
        duration: 5,
        aspectRatio: "9:16",
      }),
      (err) => {
        assert.ok(isVideoGatewayError(err));
        assert.equal(err.code, "PROVIDER_UNAVAILABLE");
        assert.equal(err.details.provider, "runway");
        return true;
      },
    );
  } finally {
    if (saved !== undefined) process.env.RUNWAY_API_KEY = saved;
  }
});

test("Runway adapter: submit 成功返回 providerTaskId", async () => {
  const savedKey = process.env.RUNWAY_API_KEY;
  const savedModel = process.env.RUNWAY_VIDEO_MODEL;
  process.env.RUNWAY_API_KEY = "test-key";
  delete process.env.RUNWAY_VIDEO_MODEL;
  try {
    const mock = mockFetch(() => jsonResponse(200, { id: "runway-task-123" }));
    try {
      const provider = createRunwayGatewayProvider();
      const result = await provider.submit({
        prompt: "一只猫在跑",
        firstframeUrl: "https://example.com/cat.jpg",
        duration: 5,
        aspectRatio: "9:16",
      });
      assert.equal(result.providerTaskId, "runway-task-123");
      assert.equal(result.provider.name, "runway");
      assert.equal(result.provider.model, "gen4_turbo");

      // 校验请求格式
      assert.equal(mock.calls.length, 1);
      const call = mock.calls[0];
      assert.ok(call.url.includes("/v1/image_to_video"));
      assert.equal(call.init.method, "POST");
      assert.equal(call.init.headers.Authorization, "Bearer test-key");
      assert.equal(call.init.headers["X-Runway-Version"], "2024-11-06");
      const body = JSON.parse(call.init.body);
      assert.equal(body.model, "gen4_turbo");
      assert.equal(body.promptText, "一只猫在跑");
      assert.equal(body.promptImage, "https://example.com/cat.jpg");
      assert.equal(body.ratio, "720:1280");
      assert.equal(body.duration, 5);
      assert.equal(body.position, "first");
    } finally {
      mock.restore();
    }
  } finally {
    if (savedKey !== undefined) process.env.RUNWAY_API_KEY = savedKey;
    else delete process.env.RUNWAY_API_KEY;
    if (savedModel !== undefined) process.env.RUNWAY_VIDEO_MODEL = savedModel;
  }
});

test("Runway adapter: ratio 映射正确（16:9 → 1280:720，1:1 → 960:960）", async () => {
  process.env.RUNWAY_API_KEY = "test-key";
  try {
    const mock = mockFetch(() => jsonResponse(200, { id: "x" }));
    try {
      const provider = createRunwayGatewayProvider();
      await provider.submit({
        prompt: "test",
        firstframeUrl: "https://example.com/a.jpg",
        aspectRatio: "16:9",
      });
      let body = JSON.parse(mock.calls[0].init.body);
      assert.equal(body.ratio, "1280:720");

      await provider.submit({
        prompt: "test",
        firstframeUrl: "https://example.com/a.jpg",
        aspectRatio: "1:1",
      });
      body = JSON.parse(mock.calls[1].init.body);
      assert.equal(body.ratio, "960:960");
    } finally {
      mock.restore();
    }
  } finally {
    delete process.env.RUNWAY_API_KEY;
  }
});

test("Runway adapter: duration 被 clamp 到 [2, 10]", async () => {
  process.env.RUNWAY_API_KEY = "test-key";
  try {
    const mock = mockFetch(() => jsonResponse(200, { id: "x" }));
    try {
      const provider = createRunwayGatewayProvider();
      await provider.submit({
        prompt: "test",
        firstframeUrl: "https://example.com/a.jpg",
        duration: 1,
      });
      let body = JSON.parse(mock.calls[0].init.body);
      assert.equal(body.duration, 2);

      await provider.submit({
        prompt: "test",
        firstframeUrl: "https://example.com/a.jpg",
        duration: 30,
      });
      body = JSON.parse(mock.calls[1].init.body);
      assert.equal(body.duration, 10);
    } finally {
      mock.restore();
    }
  } finally {
    delete process.env.RUNWAY_API_KEY;
  }
});

test("Runway adapter: HTTP 401 抛 PROVIDER_UNAVAILABLE", async () => {
  process.env.RUNWAY_API_KEY = "bad-key";
  try {
    const mock = mockFetch(() => jsonResponse(401, { error: "unauthorized" }));
    try {
      const provider = createRunwayGatewayProvider();
      await assert.rejects(
        () => provider.submit({
          prompt: "test",
          firstframeUrl: "https://example.com/a.jpg",
        }),
        (err) => {
          assert.equal(err.code, "PROVIDER_UNAVAILABLE");
          assert.ok(err.message.includes("HTTP 401"));
          return true;
        },
      );
    } finally {
      mock.restore();
    }
  } finally {
    delete process.env.RUNWAY_API_KEY;
  }
});

test("Runway adapter: HTTP 500 抛 PROVIDER_CALL_FAILED", async () => {
  process.env.RUNWAY_API_KEY = "test-key";
  try {
    const mock = mockFetch(() => jsonResponse(500, { error: "internal" }));
    try {
      const provider = createRunwayGatewayProvider();
      await assert.rejects(
        () => provider.submit({
          prompt: "test",
          firstframeUrl: "https://example.com/a.jpg",
        }),
        (err) => {
          assert.equal(err.code, "PROVIDER_CALL_FAILED");
          return true;
        },
      );
    } finally {
      mock.restore();
    }
  } finally {
    delete process.env.RUNWAY_API_KEY;
  }
});

test("Runway adapter: 网络超时抛 PROVIDER_TIMEOUT", async () => {
  process.env.RUNWAY_API_KEY = "test-key";
  try {
    const mock = mockFetch(() => {
      throw networkError("request timeout after 30s");
    });
    try {
      const provider = createRunwayGatewayProvider();
      await assert.rejects(
        () => provider.submit({
          prompt: "test",
          firstframeUrl: "https://example.com/a.jpg",
        }),
        (err) => {
          assert.equal(err.code, "PROVIDER_TIMEOUT");
          return true;
        },
      );
    } finally {
      mock.restore();
    }
  } finally {
    delete process.env.RUNWAY_API_KEY;
  }
});

test("Runway adapter: 网络错误抛 PROVIDER_CALL_FAILED", async () => {
  process.env.RUNWAY_API_KEY = "test-key";
  try {
    const mock = mockFetch(() => {
      throw networkError("ECONNRESET");
    });
    try {
      const provider = createRunwayGatewayProvider();
      await assert.rejects(
        () => provider.submit({
          prompt: "test",
          firstframeUrl: "https://example.com/a.jpg",
        }),
        (err) => {
          assert.equal(err.code, "PROVIDER_CALL_FAILED");
          return true;
        },
      );
    } finally {
      mock.restore();
    }
  } finally {
    delete process.env.RUNWAY_API_KEY;
  }
});

test("Runway adapter: poll 成功映射 SUCCEEDED → done + videoUrl", async () => {
  process.env.RUNWAY_API_KEY = "test-key";
  try {
    const mock = mockFetch(() => jsonResponse(200, {
      id: "task-1",
      status: "SUCCEEDED",
      output: ["https://cdn.runwayml.com/video.mp4"],
    }));
    try {
      const provider = createRunwayGatewayProvider();
      const result = await provider.poll("task-1");
      assert.equal(result.status, "done");
      assert.equal(result.videoUrl, "https://cdn.runwayml.com/video.mp4");
      assert.equal(result.rawStatus, "SUCCEEDED");
    } finally {
      mock.restore();
    }
  } finally {
    delete process.env.RUNWAY_API_KEY;
  }
});

test("Runway adapter: poll 映射 RUNNING → running", async () => {
  process.env.RUNWAY_API_KEY = "test-key";
  try {
    const mock = mockFetch(() => jsonResponse(200, {
      id: "task-1",
      status: "RUNNING",
    }));
    try {
      const provider = createRunwayGatewayProvider();
      const result = await provider.poll("task-1");
      assert.equal(result.status, "running");
      assert.equal(result.videoUrl, undefined);
    } finally {
      mock.restore();
    }
  } finally {
    delete process.env.RUNWAY_API_KEY;
  }
});

test("Runway adapter: poll 映射 FAILED → error + metadata", async () => {
  process.env.RUNWAY_API_KEY = "test-key";
  try {
    const mock = mockFetch(() => jsonResponse(200, {
      id: "task-1",
      status: "FAILED",
      failureCode: "CONTENT_MODERATION",
      failure: "内容审核未通过",
    }));
    try {
      const provider = createRunwayGatewayProvider();
      const result = await provider.poll("task-1");
      assert.equal(result.status, "error");
      assert.deepEqual(result.metadata, {
        failureCode: "CONTENT_MODERATION",
        failure: "内容审核未通过",
      });
    } finally {
      mock.restore();
    }
  } finally {
    delete process.env.RUNWAY_API_KEY;
  }
});

test("Runway adapter: poll 404 抛 JOB_NOT_FOUND", async () => {
  process.env.RUNWAY_API_KEY = "test-key";
  try {
    const mock = mockFetch(() => jsonResponse(404, { error: "not found" }));
    try {
      const provider = createRunwayGatewayProvider();
      await assert.rejects(
        () => provider.poll("nonexistent-task"),
        (err) => {
          assert.equal(err.code, "JOB_NOT_FOUND");
          return true;
        },
      );
    } finally {
      mock.restore();
    }
  } finally {
    delete process.env.RUNWAY_API_KEY;
  }
});

test("Runway adapter: cancel 成功返回 true", async () => {
  process.env.RUNWAY_API_KEY = "test-key";
  try {
    const mock = mockFetch(() => jsonResponse(200, {}));
    try {
      const provider = createRunwayGatewayProvider();
      const ok = await provider.cancel("task-1");
      assert.equal(ok, true);
      assert.equal(mock.calls[0].init.method, "POST");
      assert.ok(mock.calls[0].url.includes("/tasks/task-1/cancel"));
    } finally {
      mock.restore();
    }
  } finally {
    delete process.env.RUNWAY_API_KEY;
  }
});

test("Runway adapter: cancel 在无 API Key 时返回 false", async () => {
  delete process.env.RUNWAY_API_KEY;
  const provider = createRunwayGatewayProvider();
  const ok = await provider.cancel("task-1");
  assert.equal(ok, false);
});

// ============================================================
// Seedance Adapter 测试
// ============================================================

test("Seedance adapter: API Key 缺失时 submit 抛 PROVIDER_UNAVAILABLE", async () => {
  const savedArk = process.env.ARK_API_KEY;
  const savedVolc = process.env.VOLC_ARK_API_KEY;
  delete process.env.ARK_API_KEY;
  delete process.env.VOLC_ARK_API_KEY;
  try {
    const provider = createSeedanceGatewayProvider();
    await assert.rejects(
      () => provider.submit({
        prompt: "test",
        firstframeUrl: "https://example.com/a.jpg",
      }),
      (err) => {
        assert.equal(err.code, "PROVIDER_UNAVAILABLE");
        assert.equal(err.details.provider, "seedance");
        return true;
      },
    );
  } finally {
    if (savedArk !== undefined) process.env.ARK_API_KEY = savedArk;
    else delete process.env.ARK_API_KEY;
    if (savedVolc !== undefined) process.env.VOLC_ARK_API_KEY = savedVolc;
    else delete process.env.VOLC_ARK_API_KEY;
  }
});

test("Seedance adapter: submit 成功返回 providerTaskId", async () => {
  process.env.ARK_API_KEY = "test-ark-key";
  try {
    const mock = mockFetch(() => jsonResponse(200, { id: "cgt-2025-xxx" }));
    try {
      const provider = createSeedanceGatewayProvider();
      const result = await provider.submit({
        prompt: "一只猫在跑",
        firstframeUrl: "https://example.com/cat.jpg",
        duration: 5,
        aspectRatio: "9:16",
      });
      assert.equal(result.providerTaskId, "cgt-2025-xxx");
      assert.equal(result.provider.name, "seedance");
      assert.equal(result.provider.model, "doubao-seedance-2-0-260128");

      // 校验请求
      assert.equal(mock.calls.length, 1);
      const call = mock.calls[0];
      assert.ok(call.url.includes("/contents/generations/tasks"));
      assert.equal(call.init.method, "POST");
      assert.equal(call.init.headers.Authorization, "Bearer test-ark-key");

      const body = JSON.parse(call.init.body);
      assert.equal(body.model, "doubao-seedance-2-0-260128");
      assert.equal(body.ratio, "9:16");
      assert.equal(body.duration, 5);
      assert.equal(body.generate_audio, false);
      assert.equal(body.watermark, false);
      // content 数组包含 text 和 image_url
      assert.ok(Array.isArray(body.content));
      assert.equal(body.content[0].type, "text");
      assert.equal(body.content[0].text, "一只猫在跑");
      assert.equal(body.content[1].type, "image_url");
      assert.equal(body.content[1].image_url.url, "https://example.com/cat.jpg");
      assert.equal(body.content[1].role, "first_frame");
    } finally {
      mock.restore();
    }
  } finally {
    delete process.env.ARK_API_KEY;
  }
});

test("Seedance adapter: poll 成功映射 succeeded → done + videoUrl", async () => {
  process.env.ARK_API_KEY = "test-key";
  try {
    const mock = mockFetch(() => jsonResponse(200, {
      id: "cgt-xxx",
      status: "succeeded",
      content: {
        video_url: "https://ark-content.tos-cn-beijing.volces.com/video.mp4",
        last_frame_url: "https://ark-content.tos-cn-beijing.volces.com/last.png",
      },
      seed: 42,
      resolution: "720p",
      ratio: "9:16",
      duration: 5,
      usage: { completion_tokens: 1000, total_tokens: 1000 },
    }));
    try {
      const provider = createSeedanceGatewayProvider();
      const result = await provider.poll("cgt-xxx");
      assert.equal(result.status, "done");
      assert.equal(result.videoUrl, "https://ark-content.tos-cn-beijing.volces.com/video.mp4");
      assert.equal(result.metadata.seed, 42);
      assert.equal(result.metadata.resolution, "720p");
      assert.equal(result.metadata.ratio, "9:16");
      assert.equal(result.metadata.duration, 5);
      assert.equal(result.metadata.last_frame_url, "https://ark-content.tos-cn-beijing.volces.com/last.png");
    } finally {
      mock.restore();
    }
  } finally {
    delete process.env.ARK_API_KEY;
  }
});

test("Seedance adapter: poll 映射 running → running", async () => {
  process.env.ARK_API_KEY = "test-key";
  try {
    const mock = mockFetch(() => jsonResponse(200, {
      id: "cgt-xxx",
      status: "running",
    }));
    try {
      const provider = createSeedanceGatewayProvider();
      const result = await provider.poll("cgt-xxx");
      assert.equal(result.status, "running");
      assert.equal(result.videoUrl, undefined);
    } finally {
      mock.restore();
    }
  } finally {
    delete process.env.ARK_API_KEY;
  }
});

test("Seedance adapter: poll 映射 failed → error + errorCode", async () => {
  process.env.ARK_API_KEY = "test-key";
  try {
    const mock = mockFetch(() => jsonResponse(200, {
      id: "cgt-xxx",
      status: "failed",
      error: { code: "CONTENT_VIOLATION", message: "内容违规" },
    }));
    try {
      const provider = createSeedanceGatewayProvider();
      const result = await provider.poll("cgt-xxx");
      assert.equal(result.status, "error");
      assert.equal(result.metadata.errorCode, "CONTENT_VIOLATION");
      assert.equal(result.metadata.errorMessage, "内容违规");
    } finally {
      mock.restore();
    }
  } finally {
    delete process.env.ARK_API_KEY;
  }
});

test("Seedance adapter: poll 映射 expired → error", async () => {
  process.env.ARK_API_KEY = "test-key";
  try {
    const mock = mockFetch(() => jsonResponse(200, {
      id: "cgt-xxx",
      status: "expired",
    }));
    try {
      const provider = createSeedanceGatewayProvider();
      const result = await provider.poll("cgt-xxx");
      assert.equal(result.status, "error");
    } finally {
      mock.restore();
    }
  } finally {
    delete process.env.ARK_API_KEY;
  }
});

test("Seedance adapter: poll 404 抛 JOB_NOT_FOUND", async () => {
  process.env.ARK_API_KEY = "test-key";
  try {
    const mock = mockFetch(() => jsonResponse(404, { error: "not found" }));
    try {
      const provider = createSeedanceGatewayProvider();
      await assert.rejects(
        () => provider.poll("cgt-nonexistent"),
        (err) => {
          assert.equal(err.code, "JOB_NOT_FOUND");
          return true;
        },
      );
    } finally {
      mock.restore();
    }
  } finally {
    delete process.env.ARK_API_KEY;
  }
});

test("Seedance adapter: 不支持 cancel（无 cancel 方法）", () => {
  const provider = createSeedanceGatewayProvider();
  assert.equal(provider.cancel, undefined);
});

test("Seedance adapter: 网络超时抛 PROVIDER_TIMEOUT", async () => {
  process.env.ARK_API_KEY = "test-key";
  try {
    const mock = mockFetch(() => {
      throw networkError("timeout");
    });
    try {
      const provider = createSeedanceGatewayProvider();
      await assert.rejects(
        () => provider.submit({
          prompt: "test",
          firstframeUrl: "https://example.com/a.jpg",
        }),
        (err) => {
          assert.equal(err.code, "PROVIDER_TIMEOUT");
          return true;
        },
      );
    } finally {
      mock.restore();
    }
  } finally {
    delete process.env.ARK_API_KEY;
  }
});

test("Seedance adapter: providerParams 透传 resolution / service_tier / seed", async () => {
  process.env.ARK_API_KEY = "test-key";
  try {
    const mock = mockFetch(() => jsonResponse(200, { id: "cgt-x" }));
    try {
      const provider = createSeedanceGatewayProvider();
      await provider.submit({
        prompt: "test",
        firstframeUrl: "https://example.com/a.jpg",
        providerParams: {
          seed: 123,
          resolution: "1080p",
          service_tier: "flex",
          return_last_frame: true,
        },
      });
      const body = JSON.parse(mock.calls[0].init.body);
      assert.equal(body.seed, 123);
      assert.equal(body.resolution, "1080p");
      assert.equal(body.service_tier, "flex");
      assert.equal(body.return_last_frame, true);
    } finally {
      mock.restore();
    }
  } finally {
    delete process.env.ARK_API_KEY;
  }
});

console.log("✅ V2-05 Video Gateway Adapters 测试完成");
