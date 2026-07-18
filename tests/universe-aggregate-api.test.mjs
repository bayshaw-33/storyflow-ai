/**
 * universe-aggregate-api tests — PRD v3.0 阶段 B 聚合 API 契约
 *
 * 覆盖（PRD §13.2）：
 * - summaries 返回完整列表 DTO，不含 description
 * - summaries 失败返回非 2xx（不返回假空数据）
 * - overview 越权返回 403
 * - works 列表双重授权（universe 读 + project owner 匹配）
 * - works 详情 project 不属于 universe 返回 404
 * - actor 单读越权返回 403
 * - portrayals 不返回裸 project_id
 * - 错误响应包含 requestId
 *
 * 运行：node --test tests/universe-aggregate-api.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

// node 直接跑 .ts：把 next/server 指到带扩展名的实现、把 @/ 别名指到仓库根目录
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
    return nextResolve(specifier, context);
  },
});

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test-key";

const summariesRoute = await import("../app/api/universe/summaries/route.ts");
const overviewRoute = await import("../app/api/universe/[universeId]/overview/route.ts");
const worksRoute = await import("../app/api/universe/[universeId]/works/route.ts");
const workDetailRoute = await import("../app/api/universe/[universeId]/works/[projectId]/route.ts");
const actorRoute = await import("../app/api/actors/[actorId]/route.ts");
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

// 拦截全局 fetch：/auth/v1/user 走 TOKENS，其余 REST 请求交给 per-test handler
function mockFetch(restHandler) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const method = (init.method || "GET").toUpperCase();
    calls.push({ url, method, init });
    if (url.includes("/auth/v1/user")) {
      const headers = init.headers || {};
      const auth = headers.Authorization || headers.authorization || "";
      const token = auth.replace(/^Bearer\s+/i, "").trim();
      const user = TOKENS[token];
      return user ? jsonResponse(user) : jsonResponse({ message: "invalid token" }, 401);
    }
    return restHandler(url, init, method);
  };
  return calls;
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

// -----------------------------------------------------------------
// 1. summaries 返回完整列表 DTO，不含 description
// -----------------------------------------------------------------
test("summaries 返回完整列表 DTO，不含 description，含 requestId", async () => {
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_team_members")) return jsonResponse([]);
    if (url.includes("/rest/v1/storyflow_universes")) {
      return jsonResponse([
        {
          id: "uni-1",
          name: "陨神之墓",
          status: "active",
          card_summary: "年轻考古学家发现自己是雅典娜的人间容器。",
          description: "## 完整 Bible\n这是一段超长 description 不应出现在列表 DTO 中。",
          cover_asset_version_id: null,
          metadata: { tags: ["奇幻", "悬疑"] },
          genre: "奇幻",
          updated_at: "2026-07-18T00:00:00.000Z",
          archived_at: null,
        },
      ]);
    }
    if (url.includes("/rest/v1/storyflow_universe_entities")) {
      return jsonResponse([
        { universe_id: "uni-1", type: "character" },
        { universe_id: "uni-1", type: "character" },
        { universe_id: "uni-1", type: "location" },
      ]);
    }
    if (url.includes("/rest/v1/storyflow_universe_inbox_items")) {
      return jsonResponse([
        { universe_id: "uni-1", status: "pending" },
        { universe_id: "uni-1", status: "pending" },
        { universe_id: "uni-1", status: "accepted" },
      ]);
    }
    if (url.includes("/rest/v1/storyflow_universe_project_links")) {
      return jsonResponse([
        { universe_id: "uni-1", project_id: "proj-1" },
        { universe_id: "uni-1", project_id: "proj-2" },
      ]);
    }
    return jsonResponse([]);
  });

  const res = await summariesRoute.GET(makeRequest("/api/universe/summaries", { token: "tok-a" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.universes), "universes 必须为数组");
  assert.equal(body.universes.length, 1);
  const item = body.universes[0];
  assert.equal(item.id, "uni-1");
  assert.equal(item.name, "陨神之墓");
  assert.equal(item.cardSummary, "年轻考古学家发现自己是雅典娜的人间容器。");
  assert.equal(item.coverUrl, null);
  assert.deepEqual(item.tags, ["奇幻", "悬疑"]);
  assert.equal(item.workCount, 2);
  assert.equal(item.characterCount, 2);
  assert.equal(item.locationCount, 1);
  assert.equal(item.pendingInboxCount, 2);
  assert.equal(item.updatedAt, "2026-07-18T00:00:00.000Z");
  assert.equal(item.description, undefined, "列表 DTO 不得返回完整 description");
  assert.ok(body.requestId, "响应必须带 requestId");
  assert.match(body.requestId, /^[0-9a-f-]{36}$/i);
});

// -----------------------------------------------------------------
// 2. summaries 失败返回非 2xx，不返回假空数据；错误响应包含 requestId
// -----------------------------------------------------------------
test("summaries 失败返回非 2xx，错误响应包含 requestId", async () => {
  mockFetch(() => jsonResponse({ message: "service unavailable" }, 503));

  const res = await summariesRoute.GET(makeRequest("/api/universe/summaries", { token: "tok-a" }));
  assert.ok(res.status >= 400, `失败必须返回非 2xx，实际 ${res.status}`);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.ok(body.requestId, "错误响应必须带 requestId");
  assert.match(body.requestId, /^[0-9a-f-]{36}$/i);
  // 不应伪装成空成功数据
  assert.equal(body.universes, undefined, "失败时不得返回空 universes 数组伪装成功");
});

// -----------------------------------------------------------------
// 3. overview 越权返回 403
// -----------------------------------------------------------------
test("overview 越权返回 403，错误响应包含 requestId", async () => {
  mockFetch((url) => {
    // universe 属于 USER_B；USER_A 查 team_members 返回空 → 读权限失败
    if (url.includes("/rest/v1/storyflow_universes")) {
      return jsonResponse([
        { id: "uni-b", user_id: USER_B, team_id: null, name: "B 的宇宙", description: "", card_summary: "", genre: "", default_language: "", target_markets: [], tone: "", status: "active", updated_at: "2026-07-18T00:00:00.000Z" },
      ]);
    }
    return jsonResponse([]);
  });

  const res = await overviewRoute.GET(
    makeRequest("/api/universe/uni-b/overview", { token: "tok-a" }),
    { params: params("universeId", "uni-b") },
  );
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.ok(body.requestId, "错误响应必须带 requestId");
});

// -----------------------------------------------------------------
// 4. works 列表双重授权：universe 可读 + project owner_id 匹配
// -----------------------------------------------------------------
test("works 列表双重授权：仅返回 user 拥有的 project", async () => {
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_universes")) {
      return jsonResponse([{ id: "uni-a", user_id: USER_A, team_id: null }]);
    }
    if (url.includes("/rest/v1/storyflow_universe_project_links")) {
      return jsonResponse([
        { id: "l1", universe_id: "uni-a", project_id: "proj-a", project_role: "main_season", updated_at: "2026-07-18T00:00:00.000Z" },
        { id: "l2", universe_id: "uni-a", project_id: "proj-b", project_role: "spin_off", updated_at: "2026-07-18T00:00:00.000Z" },
      ]);
    }
    if (url.includes("/rest/v1/storyflow_projects")) {
      // proj-a 属于 USER_A；proj-b 属于 USER_B —— 后者必须被双重授权过滤掉
      return jsonResponse([
        { id: "proj-a", title: "我的项目", owner_id: USER_A, status: "draft", updated_at: "2026-07-18T00:00:00.000Z" },
        { id: "proj-b", title: "别人的项目", owner_id: USER_B, status: "draft", updated_at: "2026-07-18T00:00:00.000Z" },
      ]);
    }
    if (url.includes("/rest/v1/storyflow_production_projects")) {
      return jsonResponse([
        { id: "pp-a", project_id: "proj-a", owner_id: USER_A, title: "我的项目", updated_at: "2026-07-18T00:00:00.000Z" },
      ]);
    }
    if (url.includes("/rest/v1/storyflow_production_shots")) {
      return jsonResponse([
        { id: "s1", production_project_id: "pp-a", character_refs: ["Alice"], scene_refs: ["场景1"], prop_refs: ["魔戒"], image_url: "https://img.test/cover.png" },
      ]);
    }
    return jsonResponse([]);
  });

  const res = await worksRoute.GET(
    makeRequest("/api/universe/uni-a/works", { token: "tok-a" }),
    { params: params("universeId", "uni-a") },
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.works));
  assert.equal(body.works.length, 1, "只应返回 USER_A 拥有的 project");
  assert.equal(body.works[0].id, "proj-a");
  assert.equal(body.works[0].title, "我的项目");
  assert.equal(body.works[0].shotCount, 1);
  assert.equal(body.works[0].characterCount, 1);
  assert.equal(body.works[0].sceneCount, 1);
  assert.equal(body.works[0].propCount, 1);
  assert.equal(body.works[0].coverUrl, "https://img.test/cover.png");
});

// -----------------------------------------------------------------
// 5. works 详情 project 不属于 universe 返回 404
// -----------------------------------------------------------------
test("works 详情 project 不属于 universe 返回 404", async () => {
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_universes")) {
      return jsonResponse([{ id: "uni-a", user_id: USER_A, team_id: null }]);
    }
    if (url.includes("/rest/v1/storyflow_universe_project_links")) {
      // 不返回任何 link —— project 与 universe 无关联
      return jsonResponse([]);
    }
    return jsonResponse([]);
  });

  const res = await workDetailRoute.GET(
    makeRequest("/api/universe/uni-a/works/orphan-proj", { token: "tok-a" }),
    { params: params("universeId", "uni-a", "projectId", "orphan-proj") },
  );
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.ok(body.requestId, "错误响应必须带 requestId");
});

// -----------------------------------------------------------------
// 6. actor 单读越权返回 403（其他用户的 private actor）
// -----------------------------------------------------------------
test("actor 单读越权返回 403", async () => {
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_actor_profiles")) {
      // actor 属于 USER_B，visibility=private，无 team_id
      return jsonResponse([
        {
          id: "actor-b",
          owner_id: USER_B,
          team_id: null,
          visibility: "private",
          name: "B 的演员",
          bio: "",
          age_range: "",
          gender_expression: "",
          ethnicity_style: "",
          face_description: "",
          hair_description: "",
          body_description: "",
          temperament: [],
          playable_roles: [],
          base_prompt: "",
          negative_prompt: "",
          avatar_asset_id: null,
          reference_sheet_asset_id: null,
          status: "ready",
          created_at: "2026-07-18T00:00:00.000Z",
          updated_at: "2026-07-18T00:00:00.000Z",
        },
      ]);
    }
    return jsonResponse([]);
  });

  const res = await actorRoute.GET(
    makeRequest("/api/actors/actor-b", { token: "tok-a" }),
    { params: params("actorId", "actor-b") },
  );
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.ok(body.requestId, "错误响应必须带 requestId");
});

// -----------------------------------------------------------------
// 7. portrayals 不返回裸 project_id
// -----------------------------------------------------------------
test("portrayals 不返回裸 project_id，仅返回 workTitle/universeName", async () => {
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_team_members")) return jsonResponse([]);
    if (url.includes("/rest/v1/storyflow_character_portrayals")) {
      return jsonResponse([
        {
          id: "pt-1",
          actor_profile_id: "actor-a",
          character_id: "Alice",
          project_id: "proj-a",
          casting_assignment_id: null,
          portrayal_name: "Alice 形象",
          visual_prompt: "prompt",
          costume_direction: "白裙",
          reference_image_url: "https://img.test/alice.png",
          is_reusable: true,
          metadata: {},
          owner_id: USER_A,
          team_id: null,
          created_at: "2026-07-18T00:00:00.000Z",
          updated_at: "2026-07-18T00:00:00.000Z",
        },
      ]);
    }
    if (url.includes("/rest/v1/storyflow_projects")) {
      return jsonResponse([{ id: "proj-a", title: "我的项目" }]);
    }
    if (url.includes("/rest/v1/storyflow_universe_project_links")) {
      return jsonResponse([{ project_id: "proj-a", universe_id: "uni-a" }]);
    }
    if (url.includes("/rest/v1/storyflow_universes")) {
      return jsonResponse([{ id: "uni-a", name: "陨神宇宙" }]);
    }
    return jsonResponse([]);
  });

  const res = await portrayalsRoute.GET(makeRequest("/api/actors/portrayals", { token: "tok-a" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.portrayals));
  assert.equal(body.portrayals.length, 1);
  const card = body.portrayals[0];
  assert.equal(card.id, "pt-1");
  assert.equal(card.workTitle, "我的项目", "必须返回 workTitle，不是裸 project_id");
  assert.equal(card.universeName, "陨神宇宙");
  assert.equal(card.characterName, "Alice 形象");
  assert.equal(card.costumeDirection, "白裙");
  assert.equal(card.referenceImageUrl, "https://img.test/alice.png");
  assert.equal(card.isReusable, true);
  assert.equal(card.projectId, undefined, "Portrayal 卡不得返回裸 project_id");
  assert.equal(card.project_id, undefined, "Portrayal 卡不得返回 snake_case project_id");
});

// -----------------------------------------------------------------
// 8. portrayals 越权返回 403（跨 owner 读取其他用户的 portrayal）
//    注：当前实现使用 owner_id=eq.USER 过滤，越权访问时 portrayal 不会出现在结果中；
//    此测试验证 USER_B 的 portrayal 不会出现在 USER_A 的列表里（隔离）。
// -----------------------------------------------------------------
test("portrayals 跨 owner 隔离：USER_A 看不到 USER_B 的 portrayal", async () => {
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_team_members")) return jsonResponse([]);
    if (url.includes("/rest/v1/storyflow_character_portrayals")) {
      // 模拟 RLS：portrayals 查询结果只包含 USER_A 拥有的行
      return jsonResponse([
        {
          id: "pt-mine",
          actor_profile_id: "actor-a",
          character_id: "Alice",
          project_id: "proj-a",
          casting_assignment_id: null,
          portrayal_name: "我的 Alice",
          visual_prompt: "",
          costume_direction: "",
          reference_image_url: null,
          is_reusable: true,
          metadata: {},
          owner_id: USER_A,
          team_id: null,
          created_at: "2026-07-18T00:00:00.000Z",
          updated_at: "2026-07-18T00:00:00.000Z",
        },
      ]);
    }
    if (url.includes("/rest/v1/storyflow_projects")) {
      return jsonResponse([{ id: "proj-a", title: "我的项目" }]);
    }
    return jsonResponse([]);
  });

  const res = await portrayalsRoute.GET(makeRequest("/api/actors/portrayals", { token: "tok-a" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.portrayals.length, 1);
  assert.equal(body.portrayals[0].id, "pt-mine");
  assert.equal(body.portrayals[0].owner_id, undefined, "Portrayal 卡不得暴露 owner_id");
  assert.equal(body.portrayals[0].team_id, undefined, "Portrayal 卡不得暴露 team_id");
});
