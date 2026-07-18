/**
 * universe-summaries tests — PRD v3.0 §9.1 列表聚合 API
 *
 * 覆盖：
 * - coverUrl 从 cover_asset_version_id 解析（PRD §4.4 缩略图优先级）
 * - cardSummary fallback 到 description（清理 Markdown + 截断）
 * - 35,000 字 description 不进入列表 DTO
 * - archived Universe 默认排除
 * - tags fallback 到 genre
 * - 跨 owner asset 不被读取为 coverUrl
 *
 * 运行：node --test tests/universe-summaries.test.mjs
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

const summariesRoute = await import("../app/api/universe/summaries/route.ts");

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
    const method = (init.method || "GET").toUpperCase();
    if (url.includes("/auth/v1/user")) {
      const headers = init.headers || {};
      const auth = headers.Authorization || headers.authorization || "";
      const token = auth.replace(/^Bearer\s+/i, "").trim();
      const user = TOKENS[token];
      return user ? jsonResponse(user) : jsonResponse({ message: "invalid token" }, 401);
    }
    return restHandler(url, init, method);
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

// 1. coverUrl 从 cover_asset_version_id 解析（owner 匹配）
test("coverUrl 从 cover_asset_version_id 解析为持久化 Storage 签名 URL", async () => {
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_team_members")) return jsonResponse([]);
    if (url.includes("/rest/v1/storyflow_universes")) {
      return jsonResponse([
        {
          id: "uni-1",
          name: "陨神之墓",
          status: "active",
          card_summary: "短摘要。",
          description: "## 长 Bible\n不应出现。",
          cover_asset_version_id: "asset-1",
          metadata: { tags: ["奇幻"] },
          genre: "奇幻",
          updated_at: "2026-07-18T00:00:00.000Z",
          archived_at: null,
        },
      ]);
    }
    if (url.includes("/rest/v1/storyflow_art_asset_versions")) return jsonResponse([{ id: "asset-1", variant_id: "var-1", storage_path: "covers/u1.png" }]);
    if (url.includes("/rest/v1/storyflow_art_asset_variants")) return jsonResponse([{ id: "var-1", asset_id: "art-asset-1" }]);
    if (url.includes("/rest/v1/storyflow_art_assets")) return jsonResponse([{ id: "art-asset-1", project_id: "art-project-1" }]);
    if (url.includes("/rest/v1/storyflow_art_projects")) return jsonResponse([{ id: "art-project-1", owner_id: USER_A, team_id: null }]);
    if (url.includes("/storage/v1/object/sign/art-assets/covers/u1.png")) return jsonResponse({ signedURL: "/object/sign/art-assets/covers/u1.png?token=test" });
    if (url.includes("/rest/v1/storyflow_universe_entities")) return jsonResponse([]);
    if (url.includes("/rest/v1/storyflow_universe_inbox_items")) return jsonResponse([]);
    if (url.includes("/rest/v1/storyflow_universe_project_links")) return jsonResponse([]);
    return jsonResponse([]);
  });

  const res = await summariesRoute.GET(makeRequest("/api/universe/summaries", { token: "tok-a" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.universes[0].coverUrl, "https://supabase.test/storage/v1/object/sign/art-assets/covers/u1.png?token=test");
});

// 2. coverUrl 跨 owner asset 不被读取（服务端二次校验 owner）
test("coverUrl 跨 owner 的 asset 不被读取，返回 null", async () => {
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_team_members")) return jsonResponse([]);
    if (url.includes("/rest/v1/storyflow_universes")) {
      return jsonResponse([
        {
          id: "uni-1",
          name: "X",
          status: "active",
          card_summary: "",
          description: "",
          cover_asset_version_id: "asset-b",
          metadata: {},
          genre: "",
          updated_at: "2026-07-18T00:00:00.000Z",
          archived_at: null,
        },
      ]);
    }
    if (url.includes("/rest/v1/storyflow_art_asset_versions")) return jsonResponse([{ id: "asset-b", variant_id: "var-b", storage_path: "covers/b.png" }]);
    if (url.includes("/rest/v1/storyflow_art_asset_variants")) return jsonResponse([{ id: "var-b", asset_id: "art-asset-b" }]);
    if (url.includes("/rest/v1/storyflow_art_assets")) return jsonResponse([{ id: "art-asset-b", project_id: "art-project-b" }]);
    if (url.includes("/rest/v1/storyflow_art_projects")) return jsonResponse([{ id: "art-project-b", owner_id: USER_B, team_id: null }]);
    return jsonResponse([]);
  });

  const res = await summariesRoute.GET(makeRequest("/api/universe/summaries", { token: "tok-a" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.universes[0].coverUrl, null, "跨 owner asset 不得作为 coverUrl");
});

// 3. 35,000 字 description 不进入列表 DTO
test("35,000 字 description 不进入列表 DTO，cardSummary 截断为 60 字", async () => {
  const hugeDesc = "## 设定\n" + "a".repeat(35000);
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_team_members")) return jsonResponse([]);
    if (url.includes("/rest/v1/storyflow_universes")) {
      return jsonResponse([
        {
          id: "uni-1",
          name: "测试",
          status: "active",
          card_summary: "",
          description: hugeDesc,
          cover_asset_version_id: null,
          metadata: {},
          genre: "",
          updated_at: "2026-07-18T00:00:00.000Z",
          archived_at: null,
        },
      ]);
    }
    return jsonResponse([]);
  });

  const res = await summariesRoute.GET(makeRequest("/api/universe/summaries", { token: "tok-a" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  const item = body.universes[0];
  assert.equal(item.description, undefined, "description 不得出现在列表 DTO");
  assert.ok(item.cardSummary.length <= 61, `cardSummary 必须截断至 60 字+省略号，实际 ${item.cardSummary.length}`);
  assert.ok(item.cardSummary.endsWith("…"), "截断后必须以省略号结尾");
});

// 4. archived Universe 默认排除
test("archived Universe 默认不进入列表（archived_at IS NULL 过滤）", async () => {
  let universesQuery = "";
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_team_members")) return jsonResponse([]);
    if (url.includes("/rest/v1/storyflow_universes")) {
      universesQuery = url;
      return jsonResponse([
        {
          id: "uni-active",
          name: "活跃",
          status: "active",
          card_summary: "",
          description: "",
          cover_asset_version_id: null,
          metadata: {},
          genre: "",
          updated_at: "2026-07-18T00:00:00.000Z",
          archived_at: null,
        },
      ]);
    }
    return jsonResponse([]);
  });

  await summariesRoute.GET(makeRequest("/api/universe/summaries", { token: "tok-a" }));
  assert.match(universesQuery, /archived_at=is\.null/, "列表查询必须带 archived_at=is.null 过滤");
});

// 5. tags fallback 到 genre
test("tags 空时 fallback 到 genre", async () => {
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_team_members")) return jsonResponse([]);
    if (url.includes("/rest/v1/storyflow_universes")) {
      return jsonResponse([
        {
          id: "uni-1",
          name: "X",
          status: "active",
          card_summary: "",
          description: "",
          cover_asset_version_id: null,
          metadata: {},
          genre: "悬疑",
          updated_at: "2026-07-18T00:00:00.000Z",
          archived_at: null,
        },
      ]);
    }
    return jsonResponse([]);
  });

  const res = await summariesRoute.GET(makeRequest("/api/universe/summaries", { token: "tok-a" }));
  const body = await res.json();
  assert.deepEqual(body.universes[0].tags, ["悬疑"]);
});
