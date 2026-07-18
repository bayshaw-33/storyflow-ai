/**
 * universe-actor-e2e tests — PRD v3.0 §12 阶段 E 真实链路验证
 *
 * 验证 Universe ↔ Work ↔ Character ↔ Actor ↔ Portrayal 的双向追溯：
 * - 正向：universe → works → character（含缩略图）
 * - 反向：actor → portrayals → workTitle / universeName（不暴露 project_id）
 * - 跨链路：从 portrayal 卡片能追溯到 universe 名称
 *
 * 运行：node --test tests/universe-actor-e2e.test.mjs
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
const overviewRoute = await import("../app/api/universe/[universeId]/overview/route.ts");
const worksRoute = await import("../app/api/universe/[universeId]/works/route.ts");
const workDetailRoute = await import("../app/api/universe/[universeId]/works/[projectId]/route.ts");
const actorRoute = await import("../app/api/actors/[actorId]/route.ts");
const portrayalsRoute = await import("../app/api/actors/portrayals/route.ts");
const portrayalsCountsRoute = await import("../app/api/actors/portrayals/counts/route.ts");

const USER_A = "user-a-0001";
const TOKENS = { "tok-a": { id: USER_A, email: "a@example.com" } };

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

// 全链路正向：universe → overview → works → work detail → characters/scenes/props
test("正向链路：universe → overview → works → work detail（含 character/scene/prop 缩略图）", async () => {
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_team_members")) return jsonResponse([]);
    if (url.includes("/rest/v1/storyflow_universes")) {
      return jsonResponse([{
        id: "uni-1", user_id: USER_A, team_id: null,
        name: "陨神之墓", card_summary: "短摘要", description: "", genre: "奇幻",
        default_language: "zh", target_markets: [], tone: "", status: "active",
        cover_asset_version_id: null, metadata: {}, updated_at: "2026-07-18T00:00:00.000Z", archived_at: null,
      }]);
    }
    if (url.includes("/rest/v1/storyflow_universe_entities")) {
      return jsonResponse([
        { id: "e1", universe_id: "uni-1", type: "character", name: "Alice", details_json: { thumbnail: "https://cdn.test/alice.png" } },
        { id: "e2", universe_id: "uni-1", type: "location", name: "森林", details_json: { thumbnail: "https://cdn.test/forest.png" } },
        { id: "e3", universe_id: "uni-1", type: "object", name: "魔戒", details_json: { thumbnail: "https://cdn.test/ring.png" } },
      ]);
    }
    if (url.includes("/rest/v1/storyflow_universe_inbox_items")) return jsonResponse([]);
    if (url.includes("/rest/v1/storyflow_universe_project_links")) {
      return jsonResponse([{ id: "l1", universe_id: "uni-1", project_id: "proj-1", project_role: "main", updated_at: "2026-07-18T00:00:00.000Z" }]);
    }
    if (url.includes("/rest/v1/storyflow_projects")) {
      return jsonResponse([{ id: "proj-1", title: "陨神第一季", owner_id: USER_A, status: "draft", updated_at: "2026-07-18T00:00:00.000Z" }]);
    }
    if (url.includes("/rest/v1/storyflow_production_projects")) {
      return jsonResponse([{ id: "pp-1", project_id: "proj-1", owner_id: USER_A }]);
    }
    if (url.includes("/rest/v1/storyflow_production_shots")) {
      return jsonResponse([{ id: "s1", production_project_id: "pp-1", character_refs: ["Alice"], scene_refs: ["森林"], prop_refs: ["魔戒"] }]);
    }
    if (url.includes("/rest/v1/storyflow_assets")) return jsonResponse([]);
    return jsonResponse([]);
  });

  // 1. summaries 拿 universe 列表
  const summariesRes = await summariesRoute.GET(makeRequest("/api/universe/summaries", { token: "tok-a" }));
  assert.equal(summariesRes.status, 200);
  const summaries = await summariesRes.json();
  assert.equal(summaries.universes[0].name, "陨神之墓");

  // 2. overview 拿 universe 详情
  const overviewRes = await overviewRoute.GET(
    makeRequest("/api/universe/uni-1/overview", { token: "tok-a" }),
    { params: params("universeId", "uni-1") },
  );
  assert.equal(overviewRes.status, 200);

  // 3. works 列表
  const worksRes = await worksRoute.GET(
    makeRequest("/api/universe/uni-1/works", { token: "tok-a" }),
    { params: params("universeId", "uni-1") },
  );
  const works = await worksRes.json();
  assert.equal(works.works[0].title, "陨神第一季");

  // 4. work detail 含 character/scene/prop
  const workDetailRes = await workDetailRoute.GET(
    makeRequest("/api/universe/uni-1/works/proj-1", { token: "tok-a" }),
    { params: params("universeId", "uni-1", "projectId", "proj-1") },
  );
  const workDetail = await workDetailRes.json();
  assert.equal(workDetail.characters[0].name, "Alice");
  assert.equal(workDetail.characters[0].thumbnail, "https://cdn.test/alice.png");
  assert.equal(workDetail.scenes[0].thumbnail, "https://cdn.test/forest.png");
  assert.equal(workDetail.props[0].thumbnail, "https://cdn.test/ring.png");
});

// 反向链路：actor → portrayals → workTitle / universeName（不暴露 project_id）
test("反向链路：actor → portrayals → workTitle/universeName（不暴露 project_id）", async () => {
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_team_members")) return jsonResponse([]);
    if (url.includes("/rest/v1/storyflow_actor_profiles")) {
      return jsonResponse([{
        id: "actor-1", owner_id: USER_A, team_id: null, visibility: "private",
        name: "Astra", status: "ready", bio: "", age_range: "", gender_expression: "",
        ethnicity_style: "", face_description: "", hair_description: "", body_description: "",
        temperament: [], playable_roles: [], base_prompt: "", negative_prompt: "",
        avatar_asset_id: null, reference_sheet_asset_id: null,
        created_at: "2026-07-18T00:00:00.000Z", updated_at: "2026-07-18T00:00:00.000Z",
      }]);
    }
    if (url.includes("/rest/v1/storyflow_assets")) return jsonResponse([]);
    if (url.includes("/rest/v1/storyflow_character_portrayals")) {
      return jsonResponse([{
        id: "pt-1", actor_profile_id: "actor-1", character_id: "Alice", project_id: "proj-1",
        casting_assignment_id: null, portrayal_name: "Alice 形象",
        visual_prompt: "", costume_direction: "白裙", reference_image_url: "https://cdn.test/alice.png",
        is_reusable: true, metadata: {}, owner_id: USER_A, team_id: null,
        created_at: "2026-07-18T00:00:00.000Z", updated_at: "2026-07-18T00:00:00.000Z",
      }]);
    }
    if (url.includes("/rest/v1/storyflow_projects")) {
      return jsonResponse([{ id: "proj-1", title: "陨神第一季" }]);
    }
    if (url.includes("/rest/v1/storyflow_universe_project_links")) {
      return jsonResponse([{ project_id: "proj-1", universe_id: "uni-1" }]);
    }
    if (url.includes("/rest/v1/storyflow_universes")) {
      return jsonResponse([{ id: "uni-1", name: "陨神之墓" }]);
    }
    return jsonResponse([]);
  });

  // 1. actor 单读
  const actorRes = await actorRoute.GET(
    makeRequest("/api/actors/actor-1", { token: "tok-a" }),
    { params: params("actorId", "actor-1") },
  );
  const actorBody = await actorRes.json();
  assert.equal(actorBody.actor.name, "Astra");
  assert.equal(actorBody.actor.portrayalCount, 1, "actor 详情必须返回 portrayalCount");

  // 2. portrayals 列表（语义化，不暴露 project_id）
  const portrayalsRes = await portrayalsRoute.GET(
    makeRequest("/api/actors/portrayals?actorId=actor-1", { token: "tok-a" }),
  );
  const portrayalsBody = await portrayalsRes.json();
  assert.equal(portrayalsBody.portrayals.length, 1);
  const pt = portrayalsBody.portrayals[0];
  assert.equal(pt.workTitle, "陨神第一季", "必须返回语义化 workTitle");
  assert.equal(pt.universeName, "陨神之墓", "必须返回 universeName");
  assert.equal(pt.characterName, "Alice 形象");
  assert.equal(pt.projectId, undefined, "不得暴露 project_id");
  assert.equal(pt.project_id, undefined, "不得暴露 snake_case project_id");
  assert.equal(pt.owner_id, undefined, "不得暴露 owner_id");

  // 3. portrayals/counts 批量
  const countsRes = await portrayalsCountsRoute.GET(
    makeRequest("/api/actors/portrayals/counts?ids=actor-1", { token: "tok-a" }),
  );
  const countsBody = await countsRes.json();
  assert.equal(countsBody.counts["actor-1"], 1);
});

// 链路完整性：从 portrayal 卡片能追溯到 universe 名称
test("链路完整性：portrayal → universeName 必须可追溯", async () => {
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_team_members")) return jsonResponse([]);
    if (url.includes("/rest/v1/storyflow_character_portrayals")) {
      return jsonResponse([{
        id: "pt-x", actor_profile_id: "actor-1", character_id: "Alice",
        project_id: "proj-1", portrayal_name: "Alice",
        visual_prompt: "", costume_direction: "", reference_image_url: null,
        is_reusable: true, metadata: {}, owner_id: USER_A, team_id: null,
        created_at: "2026-07-18T00:00:00.000Z", updated_at: "2026-07-18T00:00:00.000Z",
      }]);
    }
    if (url.includes("/rest/v1/storyflow_projects")) {
      return jsonResponse([{ id: "proj-1", title: "陨神第一季" }]);
    }
    if (url.includes("/rest/v1/storyflow_universe_project_links")) {
      return jsonResponse([{ project_id: "proj-1", universe_id: "uni-1" }]);
    }
    if (url.includes("/rest/v1/storyflow_universes")) {
      return jsonResponse([{ id: "uni-1", name: "陨神之墓" }]);
    }
    return jsonResponse([]);
  });

  const res = await portrayalsRoute.GET(makeRequest("/api/actors/portrayals", { token: "tok-a" }));
  const body = await res.json();
  assert.equal(body.portrayals[0].universeName, "陨神之墓", "portrayal 必须能追溯到 universe 名称");
});

// 链路无 project 时 universeName=null（不伪造）
test("portrayal 无 project 关联时 universeName=null（不伪造）", async () => {
  mockFetch((url) => {
    if (url.includes("/rest/v1/storyflow_team_members")) return jsonResponse([]);
    if (url.includes("/rest/v1/storyflow_character_portrayals")) {
      return jsonResponse([{
        id: "pt-orphan", actor_profile_id: "actor-1", character_id: "Alice",
        project_id: null, portrayal_name: "孤儿",
        visual_prompt: "", costume_direction: "", reference_image_url: null,
        is_reusable: true, metadata: {}, owner_id: USER_A, team_id: null,
        created_at: "2026-07-18T00:00:00.000Z", updated_at: "2026-07-18T00:00:00.000Z",
      }]);
    }
    return jsonResponse([]);
  });

  const res = await portrayalsRoute.GET(makeRequest("/api/actors/portrayals", { token: "tok-a" }));
  const body = await res.json();
  assert.equal(body.portrayals[0].universeName, null, "无 project 关联时 universeName 必须为 null，不得伪造");
  assert.equal(body.portrayals[0].workTitle, "未关联作品", "workTitle 回退到默认文案");
});
