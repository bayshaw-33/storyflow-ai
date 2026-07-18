/**
 * actor-portrayal-auth tests — PRD v3.0 §8.4 casting/portrayal RLS 边界
 *
 * 覆盖：
 * - PATCH /api/actors/:actorId/primary-version 跨 owner 403
 * - GET /api/actors/portrayals/counts 跨 owner 隔离（只统计自己可读的）
 * - POST /api/actors/portrayals 跨 owner 创建 403
 * - GET /api/actors/portrayals 跨 owner 读取隔离
 *
 * 运行：node --test tests/actor-portrayal-auth.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
      return { url: pathToFileURL(require.resolve("next/server.js")).href, shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      const base = path.join(ROOT, specifier.slice(2));
      for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) {
        if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context, nextResolve);
  },
});

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test-key";

const primaryVersionRoute = await import("../app/api/actors/[actorId]/primary-version/route.ts");
const portrayalsCountsRoute = await import("../app/api/actors/portrayals/counts/route.ts");
const portrayalsRoute = await import("../app/api/actors/portrayals/route.ts");

const USER_A = "user-a-0001";
const USER_B = "user-b-0002";
const TOKENS = {
  "tok-a": { id: USER_A, email: "a@example.com" },
  "tok-b": { id: USER_B, email: "b@example.com" },
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function mockFetch(restHandler) {
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("/auth/v1/user")) {
      const headers = init.headers || {};
      const auth = headers.Authorization || headers.authorization || "";
      const token = auth.replace(/^Bearer\s+/i, "").trim();
      const user = TOKENS[token];
      return user ? jsonResponse(user) : jsonResponse({ message: "invalid token" }, 401);
    }
    return restHandler(url, init);
  };
}

function makeRequest(pathname, { token, method = "GET", body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function params(...args) {
  const obj = {};
  for (let i = 0; i < args.length; i += 2) obj[args[i]] = args[i + 1];
  return Promise.resolve(obj);
}

// 1. PATCH primary-version 跨 owner 403
test("PATCH primary-version 跨 owner 返回 403", async () => {
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_actor_profiles")) {
      // actor 属于 USER_B；USER_A 查询时 getActorForUser 抛 ACTOR_FORBIDDEN
      return jsonResponse([
        {
          id: "actor-b",
          owner_id: USER_B,
          team_id: null,
          visibility: "private",
          name: "B 的演员",
          status: "ready",
        },
      ]);
    }
    return jsonResponse([]);
  });

  const res = await primaryVersionRoute.PATCH(
    makeRequest("/api/actors/actor-b/primary-version", {
      token: "tok-a",
      method: "PATCH",
      body: { versionId: "v-1" },
    }),
    { params: params("actorId", "actor-b") },
  );
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.ok(body.requestId);
});

// 2. PATCH primary-version version 属于别人的 art_project 403
test("PATCH primary-version version 挂在别人的 art_project 下返回 403", async () => {
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_actor_profiles")) {
      return jsonResponse([{ id: "actor-a", owner_id: USER_A, team_id: null, visibility: "private", name: "A", status: "ready" }]);
    }
    if (url.includes("/rest/v1/storyflow_art_asset_versions")) {
      return jsonResponse([{ id: "v-1", variant_id: "var-1", metadata: {} }]);
    }
    if (url.includes("/rest/v1/storyflow_art_asset_variants")) {
      return jsonResponse([{ id: "var-1", asset_id: "asset-1" }]);
    }
    if (url.includes("/rest/v1/storyflow_art_assets")) {
      return jsonResponse([{ id: "asset-1", project_id: "art-1" }]);
    }
    if (url.includes("/rest/v1/storyflow_art_projects")) {
      // art_project 属于 USER_B —— USER_A 不得修改
      return jsonResponse([{ id: "art-1", owner_id: USER_B, source_project_id: "actor:actor-a" }]);
    }
    return jsonResponse([]);
  });

  const res = await primaryVersionRoute.PATCH(
    makeRequest("/api/actors/actor-a/primary-version", {
      token: "tok-a",
      method: "PATCH",
      body: { versionId: "v-1" },
    }),
    { params: params("actorId", "actor-a") },
  );
  assert.equal(res.status, 403);
});

test("PATCH primary-version 只更新 variant.approved_version_id，不覆盖版本 metadata", async () => {
  const writes = [];
  mockFetch((url, init = {}) => {
    if (url.includes("/rest/v1/storyflow_actor_profiles")) {
      return jsonResponse([{ id: "actor-a", owner_id: USER_A, team_id: null, visibility: "private", name: "A", status: "ready" }]);
    }
    if (url.includes("/rest/v1/storyflow_art_asset_versions")) {
      if ((init.method || "GET").toUpperCase() === "PATCH") writes.push({ url, body: JSON.parse(init.body) });
      return jsonResponse([{ id: "v-1", variant_id: "var-1" }]);
    }
    if (url.includes("/rest/v1/storyflow_art_asset_variants")) {
      if ((init.method || "GET").toUpperCase() === "PATCH") {
        writes.push({ url, body: JSON.parse(init.body) });
        return jsonResponse([]);
      }
      return jsonResponse([{ id: "var-1", asset_id: "asset-1" }]);
    }
    if (url.includes("/rest/v1/storyflow_art_assets")) return jsonResponse([{ id: "asset-1", project_id: "art-1" }]);
    if (url.includes("/rest/v1/storyflow_art_projects")) {
      return jsonResponse([{ id: "art-1", owner_id: USER_A, actor_id: "actor-a" }]);
    }
    return jsonResponse([]);
  });

  const res = await primaryVersionRoute.PATCH(
    makeRequest("/api/actors/actor-a/primary-version", { token: "tok-a", method: "PATCH", body: { versionId: "v-1" } }),
    { params: params("actorId", "actor-a") },
  );
  assert.equal(res.status, 200);
  assert.equal(writes.length, 1);
  assert.match(writes[0].url, /storyflow_art_asset_variants/);
  assert.equal(writes[0].body.approved_version_id, "v-1");
  assert.equal(writes[0].body.metadata, undefined);
});

// 3. GET portrayals/counts 跨 owner 隔离：只统计自己可读的
test("GET portrayals/counts 只统计当前用户可读的 portrayal", async () => {
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_team_members")) return jsonResponse([]);
    if (url.includes("/rest/v1/storyflow_character_portrayals")) {
      // 模拟 RLS：只返回 USER_A 拥有的 portrayal
      return jsonResponse([
        { actor_profile_id: "actor-a" },
        { actor_profile_id: "actor-a" },
        { actor_profile_id: "actor-a" },
        // actor-b 的 portrayal 不应出现（RLS 过滤）
      ]);
    }
    return jsonResponse([]);
  });

  const res = await portrayalsCountsRoute.GET(
    makeRequest("/api/actors/portrayals/counts?ids=actor-a,actor-b", { token: "tok-a" }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.counts["actor-a"], 3);
  assert.equal(body.counts["actor-b"], 0, "跨 owner 的 actor 计数必须为 0");
});

// 4. POST portrayals 跨 owner 创建 403
test("POST portrayals 跨 owner actor 返回 403", async () => {
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_actor_profiles")) {
      return jsonResponse([{ id: "actor-b", owner_id: USER_B, team_id: null, visibility: "private" }]);
    }
    return jsonResponse([]);
  });

  const res = await portrayalsRoute.POST(
    makeRequest("/api/actors/portrayals", {
      token: "tok-a",
      method: "POST",
      body: { actor_profile_id: "actor-b", character_id: "char-1" },
    }),
  );
  assert.ok(res.status >= 400, "跨 owner 创建必须失败");
});

// 5. portrayals/counts ids 参数为空时返回空 counts
test("portrayals/counts 无 ids 参数返回空 counts", async () => {
  mockFetch(() => jsonResponse([]));

  const res = await portrayalsCountsRoute.GET(
    makeRequest("/api/actors/portrayals/counts", { token: "tok-a" }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.counts, {});
});

// 6. portrayals/counts ids 超过 100 截断
test("portrayals/counts ids 超过 100 截断", async () => {
  let queryUrl = "";
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_team_members")) return jsonResponse([]);
    if (url.includes("/rest/v1/storyflow_character_portrayals")) {
      queryUrl = url;
      return jsonResponse([]);
    }
    return jsonResponse([]);
  });

  const ids = Array.from({ length: 150 }, (_, i) => `actor-${i}`).join(",");
  const res = await portrayalsCountsRoute.GET(
    makeRequest(`/api/actors/portrayals/counts?ids=${encodeURIComponent(ids)}`, { token: "tok-a" }),
  );
  assert.equal(res.status, 200);
  // 验证查询时只用了前 100 个 id
  assert.match(queryUrl, /actor-99/, "包含第 100 个");
  assert.ok(!queryUrl.includes("actor-100_id") && !queryUrl.includes("actor-149"), "截断到前 100 个");
});
