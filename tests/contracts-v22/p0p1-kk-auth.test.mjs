/**
 * P0-01 — KK 对话、认证与真实错误 契约测试。
 *
 * 撰写时（base b3ba9c1a + P0-05 切片）为 RED：
 *   - getProfile 收到真实 serviceFetch 形状的 406 错误（无 .status 的
 *     SUPABASE_SERVICE_ERROR:406:...）时误判为 service_unavailable，
 *     首次访问用户永远建不出 KK profile → 503 "KK 不可用"。
 *   - kk 错误映射把认证失败伪装成 503，客户端显示"离线"而非引导重登。
 *   - storyboard-chat 等 catch-all 把基础设施故障映射为 401"请先登录"。
 *   - 无共享的 401→refresh→retry fetch。
 *
 * Run: node --test tests/contracts-v22/p0p1-kk-auth.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("getProfile treats a serviceFetch-shaped 406 (plain Error, no .status) as no-row", async () => {
  const { getProfile } = await import("../../lib/server/v2/kk/profile.ts");
  // 真实 serviceFetch 抛的是普通 Error（message 前缀 SUPABASE_SERVICE_ERROR:<status>），
  // 不是带 .status 的对象 —— 现有代码检查 err.status === 406 永远为 false。
  const fetcher = async () => {
    throw new Error('SUPABASE_SERVICE_ERROR:406:{"code":"PGRST108","message":"JSON object requested, multiple (or no) rows returned"}');
  };
  const profile = await getProfile(fetcher, "11111111-1111-1111-1111-111111111111");
  assert.equal(profile, null, "406 = 无匹配行，应返回 null 触发 ensureProfile 自动建号");
});

test("serviceFetch attaches the upstream status to thrown errors", () => {
  const source = read("../../lib/supabase/server.ts");
  assert.match(source, /\.status\s*=\s*response\.status|status:\s*response\.status/, "thrown error must carry .status for 406-object checks");
});

test("kk http mapping returns 401 for auth failures, never masks them as 503", async () => {
  const { classifyKkHttpError } = await import("../../lib/server/v2/kk/error-classify.ts");
  const missing = classifyKkHttpError(new Error("MISSING_AUTH_TOKEN"));
  assert.equal(missing.status, 401);
  assert.equal(missing.code, "unauthenticated");
  const invalid = classifyKkHttpError(new Error("INVALID_AUTH_TOKEN"));
  assert.equal(invalid.status, 401);
  assert.equal(invalid.code, "unauthenticated");
  // 配置缺失是 503，不是 401 —— 未登录提示不能吞掉配置故障
  const unconfigured = classifyKkHttpError(new Error("MISSING_SUPABASE_SERVER_CONFIG"));
  assert.equal(unconfigured.status, 503);
  assert.notEqual(unconfigured.code, "unauthenticated");
  // 其他错误带 requestId，可追踪
  const random = classifyKkHttpError(new Error("fetch failed"));
  assert.match(random.requestId, /^req_/);
});

test("storyboard-chat distinguishes auth failures from infrastructure failures", () => {
  const source = read("../../app/api/production/storyboard-chat/route.ts");
  assert.match(source, /MISSING_AUTH_TOKEN|INVALID_AUTH_TOKEN/, "auth error names must be distinguished");
  assert.match(source, /503/, "infra failures must surface as 503, not a false 401");
});

test("shared auth fetch retries exactly once with a refreshed token after 401", async () => {
  const { fetchWithAuthRetry } = await import("../../lib/client/v2/auth-fetch.ts");
  const calls = [];
  let token = "stale";
  const deps = {
    getAccessToken: async () => token,
    refreshAccessToken: async () => {
      token = "refreshed";
      return token;
    },
    fetcher: async (input, init) => {
      const headers = new Headers(init?.headers);
      calls.push(headers.get("Authorization") ?? "(none)");
      if (calls.length === 1) return new Response("{}", { status: 401 });
      return new Response("{}", { status: 200 });
    },
  };
  const response = await fetchWithAuthRetry("/api/x", { method: "POST", body: "{}" }, deps);
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["Bearer stale", "Bearer refreshed"]);
});

test("shared auth fetch does not retry when refresh fails", async () => {
  const { fetchWithAuthRetry } = await import("../../lib/client/v2/auth-fetch.ts");
  const calls = [];
  const deps = {
    getAccessToken: async () => "stale",
    refreshAccessToken: async () => null,
    fetcher: async (_input, init) => {
      const headers = new Headers(init?.headers);
      calls.push(headers.get("Authorization") ?? "(none)");
      return new Response("{}", { status: 401 });
    },
  };
  const response = await fetchWithAuthRetry("/api/x", {}, deps);
  assert.equal(response.status, 401);
  assert.equal(calls.length, 1, "no second call without a refreshed token");
});

test("shared auth fetch never overrides FormData content type", async () => {
  const { fetchWithAuthRetry } = await import("../../lib/client/v2/auth-fetch.ts");
  let seenContentType = "unset";
  const deps = {
    getAccessToken: async () => "tok",
    refreshAccessToken: async () => null,
    fetcher: async (_input, init) => {
      seenContentType = new Headers(init?.headers).get("Content-Type") ?? "unset";
      return new Response("{}", { status: 200 });
    },
  };
  const form = new FormData();
  form.append("file", new Blob(["x"]), "a.png");
  await fetchWithAuthRetry("/api/upload", { method: "POST", body: form }, deps);
  assert.equal(seenContentType, "unset", "browser must set the multipart boundary itself");
});

test("kk runtime client uses the shared auth retry and keeps 401 as unauthenticated", () => {
  const source = read("../../lib/client/v2/kk/api.ts");
  assert.match(source, /fetchWithAuthRetry/, "kk runtime calls must retry once after 401");
});

test("community discovery resolves the viewer from the supabase session, not an unauthenticated /api/v2/kk call", () => {
  const source = read("../../components/v2/community/DiscoveryFeed.tsx");
  assert.doesNotMatch(source, /fetch\(\s*["']\/api\/v2\/kk["']/, "raw /api/v2/kk fetch without Bearer always fails under Bearer-only auth");
  assert.match(source, /getSession|auth\.getSession|fetchWithAuthRetry/);
});
