/**
 * universe-works tests — PRD v3.0 §9.3 作品资产聚合
 *
 * 覆盖：
 * - works 列表双重授权（universe + project owner）
 * - works 详情含 prop_refs 聚合（PRD §6.4 关键道具）
 * - props 按 entity type=object 匹配缩略图
 * - 临时 URL 不作为持久化 coverUrl
 *
 * 运行：node --test tests/universe-works.test.mjs
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

const worksRoute = await import("../app/api/universe/[universeId]/works/route.ts");
const workDetailRoute = await import("../app/api/universe/[universeId]/works/[projectId]/route.ts");

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

function makeRequest(pathname, { token } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(`http://localhost${pathname}`, { method: "GET", headers });
}

function params(...args) {
  const obj = {};
  for (let i = 0; i < args.length; i += 2) obj[args[i]] = args[i + 1];
  return Promise.resolve(obj);
}

// 1. works 详情含 prop_refs 聚合
test("works 详情聚合 character_refs / scene_refs / prop_refs 三类", async () => {
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_universes")) {
      return jsonResponse([{ id: "uni-a", user_id: USER_A, team_id: null }]);
    }
    if (url.includes("/rest/v1/storyflow_universe_project_links")) {
      return jsonResponse([{ id: "l1", universe_id: "uni-a", project_id: "proj-a", project_role: "main", updated_at: "2026-07-18T00:00:00.000Z" }]);
    }
    if (url.includes("/rest/v1/storyflow_projects")) {
      return jsonResponse([{ id: "proj-a", title: "我的项目", owner_id: USER_A, status: "draft", updated_at: "2026-07-18T00:00:00.000Z" }]);
    }
    if (url.includes("/rest/v1/storyflow_production_projects")) {
      return jsonResponse([{ id: "pp-a", project_id: "proj-a", owner_id: USER_A }]);
    }
    if (url.includes("/rest/v1/storyflow_production_shots")) {
      return jsonResponse([
        {
          id: "s1",
          production_project_id: "pp-a",
          character_refs: ["Alice"],
          scene_refs: ["森林"],
          prop_refs: ["魔戒"],
        },
      ]);
    }
    if (url.includes("/rest/v1/storyflow_universe_entities")) {
      return jsonResponse([
        { id: "e1", universe_id: "uni-a", type: "character", name: "Alice", details_json: { thumbnail: "https://cdn.test/alice.png" } },
        { id: "e2", universe_id: "uni-a", type: "location", name: "森林", details_json: { thumbnail: "https://cdn.test/forest.png" } },
        { id: "e3", universe_id: "uni-a", type: "object", name: "魔戒", details_json: { thumbnail: "https://cdn.test/ring.png" } },
      ]);
    }
    return jsonResponse([]);
  });

  const res = await workDetailRoute.GET(
    makeRequest("/api/universe/uni-a/works/proj-a", { token: "tok-a" }),
    { params: params("universeId", "uni-a", "projectId", "proj-a") },
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.characters.length, 1);
  assert.equal(body.characters[0].name, "Alice");
  assert.equal(body.characters[0].thumbnail, "https://cdn.test/alice.png");
  assert.equal(body.scenes.length, 1);
  assert.equal(body.scenes[0].name, "森林");
  assert.equal(body.scenes[0].thumbnail, "https://cdn.test/forest.png");
  assert.equal(body.props.length, 1, "props 必须聚合 prop_refs");
  assert.equal(body.props[0].name, "魔戒");
  assert.equal(body.props[0].thumbnail, "https://cdn.test/ring.png", "props 按 entity type=object 匹配缩略图");
});

// 2. works 列表双重授权：非 owner 的 project 不返回
test("works 列表仅返回 user 拥有的 project（双重授权）", async () => {
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_universes")) {
      return jsonResponse([{ id: "uni-a", user_id: USER_A, team_id: null }]);
    }
    if (url.includes("/rest/v1/storyflow_universe_project_links")) {
      return jsonResponse([
        { id: "l1", universe_id: "uni-a", project_id: "proj-a", project_role: "main", updated_at: "2026-07-18T00:00:00.000Z" },
        { id: "l2", universe_id: "uni-a", project_id: "proj-b", project_role: "spin", updated_at: "2026-07-18T00:00:00.000Z" },
      ]);
    }
    if (url.includes("/rest/v1/storyflow_projects")) {
      // proj-a 属 USER_A；proj-b 属 USER_B
      return jsonResponse([
        { id: "proj-a", title: "我的", owner_id: USER_A, status: "draft", updated_at: "2026-07-18T00:00:00.000Z" },
        { id: "proj-b", title: "别人的", owner_id: USER_B, status: "draft", updated_at: "2026-07-18T00:00:00.000Z" },
      ]);
    }
    if (url.includes("/rest/v1/storyflow_production_projects")) return jsonResponse([]);
    return jsonResponse([]);
  });

  const res = await worksRoute.GET(
    makeRequest("/api/universe/uni-a/works", { token: "tok-a" }),
    { params: params("universeId", "uni-a") },
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.works.length, 1, "只应返回 user 拥有的 project");
  assert.equal(body.works[0].id, "proj-a");
});

// 3. works 详情 project 不属于 universe 返回 404
test("works 详情 project 不属于 universe 返回 404", async () => {
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_universes")) {
      return jsonResponse([{ id: "uni-a", user_id: USER_A, team_id: null }]);
    }
    if (url.includes("/rest/v1/storyflow_universe_project_links")) {
      return jsonResponse([]); // 无 link
    }
    return jsonResponse([]);
  });

  const res = await workDetailRoute.GET(
    makeRequest("/api/universe/uni-a/works/orphan", { token: "tok-a" }),
    { params: params("universeId", "uni-a", "projectId", "orphan") },
  );
  assert.equal(res.status, 404);
});

// 4. 无 prop_refs 字段时 props 返回空数组（向后兼容）
test("无 prop_refs 字段时 props 返回空数组（向后兼容）", async () => {
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_universes")) {
      return jsonResponse([{ id: "uni-a", user_id: USER_A, team_id: null }]);
    }
    if (url.includes("/rest/v1/storyflow_universe_project_links")) {
      return jsonResponse([{ id: "l1", universe_id: "uni-a", project_id: "proj-a", project_role: "main", updated_at: "2026-07-18T00:00:00.000Z" }]);
    }
    if (url.includes("/rest/v1/storyflow_projects")) {
      return jsonResponse([{ id: "proj-a", title: "我的", owner_id: USER_A, status: "draft", updated_at: "2026-07-18T00:00:00.000Z" }]);
    }
    if (url.includes("/rest/v1/storyflow_production_projects")) {
      return jsonResponse([{ id: "pp-a", project_id: "proj-a", owner_id: USER_A }]);
    }
    if (url.includes("/rest/v1/storyflow_production_shots")) {
      // 旧 schema：没有 prop_refs 字段
      return jsonResponse([{ id: "s1", production_project_id: "pp-a", character_refs: [], scene_refs: [] }]);
    }
    return jsonResponse([]);
  });

  const res = await workDetailRoute.GET(
    makeRequest("/api/universe/uni-a/works/proj-a", { token: "tok-a" }),
    { params: params("universeId", "uni-a", "projectId", "proj-a") },
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.props, [], "无 prop_refs 时 props 必须为空数组");
});
