/**
 * universe-assets tests — PRD v3.0 §9.4 Entity 主图选择
 *
 * 覆盖：
 * - PATCH /api/universe/:universeId/entities/:entityId/primary-asset 设置主图
 * - 越权 403（非 owner/editor）
 * - entity 不存在 404
 * - 拒绝客户端直接提交图片 URL
 *
 * 运行：node --test tests/universe-assets.test.mjs
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

const primaryAssetRoute = await import("../app/api/universe/[universeId]/entities/[entityId]/primary-asset/route.ts");

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

function makeRequest(pathname, { token, method = "PATCH", body } = {}) {
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

// 1. 主图设置成功
test("PATCH primary-asset 设置成功返回 200", async () => {
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_universes")) {
      return jsonResponse([{ id: "uni-a", user_id: USER_A, team_id: null }]);
    }
    if (url.includes("/rest/v1/storyflow_universe_entities")) {
      return jsonResponse([{ id: "ent-a", universe_id: "uni-a", type: "character", name: "Alice" }]);
    }
    // asset_version 链路：versions -> variants -> assets
    if (url.includes("/rest/v1/storyflow_art_asset_versions")) {
      return jsonResponse([{ id: "asset-1", variant_id: "var-1", storage_path: "user/project/generated/asset-1.png" }]);
    }
    if (url.includes("/rest/v1/storyflow_art_asset_variants")) {
      return jsonResponse([{ id: "var-1", asset_id: "asset-art-1" }]);
    }
    // art_assets（注意：必须放在 storyflow_assets 之前，避免被 includes 误匹配）
    if (url.includes("/rest/v1/storyflow_art_assets")) {
      return jsonResponse([{ id: "asset-art-1", project_id: "art-project-1" }]);
    }
    if (url.includes("/rest/v1/storyflow_art_projects")) {
      return jsonResponse([{ id: "art-project-1", owner_id: USER_A, team_id: null }]);
    }
    if (url.includes("/rest/v1/storyflow_assets")) {
      return jsonResponse([{ id: "asset-1", user_id: USER_A, team_id: null, public_url: "https://cdn.test/a.png" }]);
    }
    return jsonResponse([]);
  });

  const res = await primaryAssetRoute.PATCH(
    makeRequest("/api/universe/uni-a/entities/ent-a/primary-asset", {
      token: "tok-a",
      body: { assetVersionId: "asset-1" },
    }),
    { params: params("universeId", "uni-a", "entityId", "ent-a") },
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(body.requestId);
});

// 2. 越权 403（universe 属于别人）
test("PATCH primary-asset 越权返回 403", async () => {
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_universes")) {
      // universe 属于 USER_B；USER_A 查 team_members 返回空 → 读权限失败
      return jsonResponse([{ id: "uni-b", user_id: USER_B, team_id: null }]);
    }
    return jsonResponse([]);
  });

  const res = await primaryAssetRoute.PATCH(
    makeRequest("/api/universe/uni-b/entities/ent-x/primary-asset", {
      token: "tok-a",
      body: { assetVersionId: "asset-1" },
    }),
    { params: params("universeId", "uni-b", "entityId", "ent-x") },
  );
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.ok(body.requestId);
});

// 3. entity 不存在 404
test("PATCH primary-asset entity 不存在返回 404", async () => {
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_universes")) {
      return jsonResponse([{ id: "uni-a", user_id: USER_A, team_id: null }]);
    }
    if (url.includes("/rest/v1/storyflow_universe_entities")) {
      return jsonResponse([]); // entity 不存在
    }
    return jsonResponse([]);
  });

  const res = await primaryAssetRoute.PATCH(
    makeRequest("/api/universe/uni-a/entities/ent-missing/primary-asset", {
      token: "tok-a",
      body: { assetVersionId: "asset-1" },
    }),
    { params: params("universeId", "uni-a", "entityId", "ent-missing") },
  );
  assert.equal(res.status, 404);
});

// 4. 拒绝客户端直接提交图片 URL（必须提交 assetVersionId）
test("PATCH primary-asset 拒绝客户端直接提交 imageUrl 字段", async () => {
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_universes")) {
      return jsonResponse([{ id: "uni-a", user_id: USER_A, team_id: null }]);
    }
    if (url.includes("/rest/v1/storyflow_universe_entities")) {
      return jsonResponse([{ id: "ent-a", universe_id: "uni-a", type: "character", name: "Alice" }]);
    }
    return jsonResponse([]);
  });

  // 客户端尝试直接提交 imageUrl 而非 assetVersionId —— 必须 422
  const res = await primaryAssetRoute.PATCH(
    makeRequest("/api/universe/uni-a/entities/ent-a/primary-asset", {
      token: "tok-a",
      body: { imageUrl: "https://atlas.tmp/xyz.png" },
    }),
    { params: params("universeId", "uni-a", "entityId", "ent-a") },
  );
  assert.ok(res.status >= 400, "不得接受 imageUrl 替代 assetVersionId");
});
