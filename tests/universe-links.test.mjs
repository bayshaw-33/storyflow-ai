/**
 * universe-links tests — 宇宙增强 · project_links 断链修复（P0）
 *
 * 覆盖：
 * 1. buildProjectLink 的确定性 id 与默认值；
 * 2. createUniverseFromProject 本地模式创建 + 同项目二次调用复用宇宙（不重复造宇宙）；
 * 3. 孤儿 link（有 link 无宇宙行）按原 universe_id 重建修复；
 * 4. 远端模式写入顺序：项目行 → 宇宙行 → link；
 * 5. link 远端写失败必须抛出（且本地仍留痕，便于重试修复）；
 * 6. upsertUniverse 远端失败返回 { synced:false } 并 console.error；
 * 7. getProjectUniverseLink 远端优先 / 失败回退本地并 console.error；
 * 8. getUniverseEntityThumbnail 解析优先级。
 *
 * 运行：node tests/universe-links.test.mjs （或 pnpm run test:unit）
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProjectLink,
  createUniverseFromProject,
  getProjectUniverseLink,
  getUniverseEntityThumbnail,
  upsertUniverse,
  upsertUniverseProjectLink,
  UNIVERSE_LINK_STORAGE_KEY,
  UNIVERSE_STORAGE_KEY,
} from "../lib/universe.ts";

const SUPABASE_URL = "https://supabase.test";
const SUPABASE_ANON_KEY = "anon-key-for-tests";
const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];

function makeAccessToken(sub = "user-1") {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `${encode({ alg: "none" })}.${encode({ sub })}.signature`;
}

function makeFakeStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => void store.set(key, String(value)),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
    _store: store,
  };
}

function readStored(key) {
  return JSON.parse(globalThis.localStorage.getItem(key) || "[]");
}

function makeProject(overrides = {}) {
  return {
    id: "project-1",
    title: "复仇千金",
    genre: "都市复仇",
    targetLanguage: "中文",
    market: "东南亚",
    seasonNumber: 1,
    inheritanceSettings: null,
    ...overrides,
  };
}

function makeForm(overrides = {}) {
  return {
    name: "复仇千金宇宙",
    description: "重生复仇短剧宇宙",
    genre: "",
    default_language: "",
    target_markets: [],
    tone: "紧张",
    ...overrides,
  };
}

function makeLink(overrides = {}) {
  return {
    id: "universe-project-link-u1-p1",
    universe_id: "u1",
    project_id: "p1",
    user_id: "user-1",
    project_role: "main_season",
    season_number: 1,
    inheritance_settings: {},
    created_at: "2026-07-18T00:00:00.000Z",
    updated_at: "2026-07-18T00:00:00.000Z",
    ...overrides,
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function withHarness(t, options = {}) {
  const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  if (options.remote) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
  } else {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }

  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const originalConsoleError = console.error;
  const calls = [];
  const consoleErrors = [];

  globalThis.localStorage = makeFakeStorage();
  console.error = (...args) => {
    consoleErrors.push(args.map(String).join(" "));
  };
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: (init.method || "GET").toUpperCase() });
    if (options.fetch) return options.fetch(String(url), init);
    return jsonResponse([]);
  };

  t.after(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  });

  return { calls, consoleErrors };
}

test("buildProjectLink 生成数据库兼容的 UUID 并填充默认值", () => {
  const link = buildProjectLink({
    universeId: "universe-1",
    projectId: "project-1",
    userId: "user-1",
    projectRole: "main_season",
  });

  assert.match(link.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(link.universe_id, "universe-1");
  assert.equal(link.project_id, "project-1");
  assert.equal(link.project_role, "main_season");
  assert.equal(link.season_number, null);
  assert.equal(link.inheritance_settings.core_world, true);
});

test("本地模式创建宇宙，同项目二次调用复用宇宙而不重复创建", async (t) => {
  withHarness(t);

  const first = await createUniverseFromProject({ project: makeProject(), form: makeForm() });
  assert.equal(first.reused, false);
  assert.equal(first.sync.synced, true);
  assert.equal(readStored(UNIVERSE_STORAGE_KEY).length, 1);
  assert.equal(readStored(UNIVERSE_LINK_STORAGE_KEY).length, 1);

  const second = await createUniverseFromProject({
    project: makeProject(),
    form: makeForm({ name: "换一个名字也不该新建" }),
  });
  assert.equal(second.reused, true);
  assert.equal(second.universe.id, first.universe.id);
  assert.equal(second.link.id, first.link.id);
  // 宇宙与 link 都只有一份 —— 重复宇宙被消灭。
  assert.equal(readStored(UNIVERSE_STORAGE_KEY).length, 1);
  assert.equal(readStored(UNIVERSE_LINK_STORAGE_KEY).length, 1);
});

test("孤儿 link（有 link 无宇宙行）按原 universe_id 重建修复", async (t) => {
  withHarness(t);

  const orphanLink = makeLink({ universe_id: "universe-orphan", project_id: "project-1" });
  globalThis.localStorage.setItem(UNIVERSE_LINK_STORAGE_KEY, JSON.stringify([orphanLink]));

  const result = await createUniverseFromProject({ project: makeProject(), form: makeForm() });
  assert.equal(result.reused, true);
  assert.equal(result.universe.id, "universe-orphan");
  assert.equal(result.universe.metadata.healed_orphaned_link, true);

  const universes = readStored(UNIVERSE_STORAGE_KEY);
  assert.equal(universes.length, 1);
  assert.equal(universes[0].id, "universe-orphan");
  // link 没有新增，仍是原来那条。
  assert.equal(readStored(UNIVERSE_LINK_STORAGE_KEY).length, 1);
});

test("远端模式写入顺序：项目行 → 宇宙行 → link", async (t) => {
  const { calls } = withHarness(t, {
    remote: true,
    fetch: (url, init) => {
      const method = (init.method || "GET").toUpperCase();
      if (method === "GET") return jsonResponse([]);
      return jsonResponse(null, 201);
    },
  });

  const order = [];
  const result = await createUniverseFromProject({
    project: makeProject(),
    form: makeForm(),
    accessToken: makeAccessToken(),
    ensureProjectSynced: async () => {
      order.push("ensure-project");
    },
  });

  assert.equal(result.reused, false);
  const writes = calls.filter((call) => call.method === "POST").map((call) => call.url);
  assert.equal(writes.length, 2);
  assert.ok(writes[0].includes("storyflow_universes"), `应先写宇宙行，实际：${writes[0]}`);
  assert.ok(writes[1].includes("storyflow_universe_project_links"), `应后写 link，实际：${writes[1]}`);
  assert.deepEqual(order, ["ensure-project"], "项目行必须先于 link 写入");
});

test("link 远端写失败必须抛出，且本地仍留痕便于重试", async (t) => {
  withHarness(t, {
    remote: true,
    fetch: (url, init) => {
      const method = (init.method || "GET").toUpperCase();
      if (method === "GET") return jsonResponse([]);
      if (url.includes("storyflow_universe_project_links")) {
        return jsonResponse({ message: "insert or update on table violates foreign key constraint" }, 409);
      }
      return jsonResponse(null, 201);
    },
  });

  await assert.rejects(
    createUniverseFromProject({
      project: makeProject(),
      form: makeForm(),
      accessToken: makeAccessToken(),
      ensureProjectSynced: async () => {},
    }),
    /Supabase request failed: 409/,
  );

  // 本地仍写入 link —— 下一次调用走「复用」路径，可顺势修复远端。
  assert.equal(readStored(UNIVERSE_LINK_STORAGE_KEY).length, 1);

  await assert.rejects(
    upsertUniverseProjectLink(makeLink(), { accessToken: makeAccessToken() }),
    /Supabase request failed: 409/,
  );
});

test("upsertUniverse 远端失败返回 synced:false 并 console.error", async (t) => {
  const { consoleErrors } = withHarness(t, {
    remote: true,
    fetch: () => jsonResponse({ message: "row level security" }, 403),
  });

  const universe = {
    id: "u1",
    user_id: "user-1",
    team_id: null,
    name: "测试宇宙",
    description: "",
    genre: "",
    default_language: "中文",
    target_markets: [],
    tone: "",
    status: "active",
    access_level: "studio_annual",
    metadata: {},
    created_at: "2026-07-18T00:00:00.000Z",
    updated_at: "2026-07-18T00:00:00.000Z",
  };

  const result = await upsertUniverse(universe, { accessToken: makeAccessToken() });
  assert.equal(result.synced, false);
  assert.match(result.error || "", /403/);
  assert.equal(consoleErrors.length, 1);
  assert.match(consoleErrors[0], /upsertUniverse/);
  // 本地副本仍在。
  assert.equal(readStored(UNIVERSE_STORAGE_KEY).length, 1);
});

test("getProjectUniverseLink 远端优先，失败回退本地并 console.error", async (t) => {
  const remoteLink = makeLink({ id: "remote-link", updated_at: "2026-07-18T01:00:00.000Z" });
  const localLink = makeLink({ id: "local-link" });

  // 远端命中：直接返回远端，不读本地。
  const okHarness = withHarness(t, {
    remote: true,
    fetch: (url, init) => {
      const method = (init.method || "GET").toUpperCase();
      if (method === "GET" && url.includes("storyflow_universe_project_links")) return jsonResponse([remoteLink]);
      return jsonResponse([]);
    },
  });
  globalThis.localStorage.setItem(UNIVERSE_LINK_STORAGE_KEY, JSON.stringify([localLink]));
  const remoteHit = await getProjectUniverseLink("p1", { accessToken: makeAccessToken() });
  assert.equal(remoteHit.id, "remote-link");
  assert.equal(okHarness.consoleErrors.length, 0);
  okHarness.calls.length = 0;

  // 远端失败：console.error 后回退本地。
  const failHarness = withHarness(t, {
    remote: true,
    fetch: () => jsonResponse({ message: "boom" }, 500),
  });
  globalThis.localStorage.setItem(UNIVERSE_LINK_STORAGE_KEY, JSON.stringify([localLink]));
  const fallback = await getProjectUniverseLink("p1", { accessToken: makeAccessToken() });
  assert.equal(fallback.id, "local-link");
  assert.equal(failHarness.consoleErrors.length, 1);
});

test("getUniverseEntityThumbnail 解析优先级：直挂字段 → variant 图 → visual_assets", () => {
  assert.equal(
    getUniverseEntityThumbnail({ details_json: { thumbnail: "https://img.test/direct.png" } }),
    "https://img.test/direct.png",
  );

  assert.equal(
    getUniverseEntityThumbnail({
      details_json: {
        appearance_variants: [
          { id: "v1", visual_assets: [{ public_url: "https://img.test/variant.png" }] },
        ],
      },
    }),
    "https://img.test/variant.png",
  );

  assert.equal(
    getUniverseEntityThumbnail({
      details_json: { visual_assets: [{ imageUrl: "https://img.test/asset.png" }] },
    }),
    "https://img.test/asset.png",
  );

  assert.equal(getUniverseEntityThumbnail({ details_json: {} }), "");
  assert.equal(getUniverseEntityThumbnail({ details_json: null }), "");
});
