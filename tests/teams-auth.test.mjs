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

const { GET, POST, PATCH, DELETE } = await import("../app/api/teams/route.ts");
const { apiError } = await import("../lib/api/responses.ts");

const TEAM = "team-1";
const OWNER = "owner-0001";
const EDITOR = "editor-0001";
const OUTSIDER = "outsider-0001";

const OWNER_MEMBER = { id: "m-owner", team_id: TEAM, user_id: OWNER, role: "owner", status: "active", created_at: "t", updated_at: "t" };
const EDITOR_MEMBER = { id: "m-editor", team_id: TEAM, user_id: EDITOR, role: "editor", status: "active", created_at: "t", updated_at: "t" };

const TOKENS = {
  "tok-owner": { id: OWNER, email: "owner@example.com" },
  "tok-editor": { id: EDITOR, email: "editor@example.com" },
  "tok-outsider": { id: OUTSIDER, email: "outsider@example.com" },
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// 拦截全局 fetch：/auth/v1/user 走 TOKENS，其余 REST 请求交给 per-test handler
function mockFetch(restHandler) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    calls.push({ url, init });
    if (url.includes("/auth/v1/user")) {
      const headers = init.headers || {};
      const auth = headers.Authorization || headers.authorization || "";
      const user = TOKENS[auth.replace(/^Bearer\s+/i, "").trim()];
      return user ? jsonResponse(user) : jsonResponse({ message: "invalid token" }, 401);
    }
    return restHandler(url, init);
  };
  return calls;
}

function makeRequest(path, { token, method = "GET", body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// 团队路由统一 stub：成员查询/owner 计数/成员写入都走这里
function teamRestHandler({ memberById, membership, owners, onWrite } = {}) {
  return (url, init) => {
    if (!url.includes("/rest/v1/storyflow_team_members")) throw new Error(`UNEXPECTED FETCH: ${url}`);
    if (init.method === "PATCH" || init.method === "POST") {
      if (onWrite) onWrite(url, init);
      return jsonResponse([]);
    }
    if (url.includes("role=eq.owner")) return jsonResponse(owners || []);
    if (memberById && url.includes(`id=eq.${memberById.id}`)) return jsonResponse([memberById]);
    if (membership && url.includes(`user_id=eq.${membership.user_id}`)) return jsonResponse([membership]);
    return jsonResponse([]);
  };
}

test("apiError 把任意 *_FORBIDDEN 后缀错误映射为 403", async () => {
  for (const code of ["TEAM_FORBIDDEN", "ACTOR_FORBIDDEN", "PROJECT_FORBIDDEN"]) {
    const res = apiError(new Error(code), "兜底。");
    assert.equal(res.status, 403, `${code} 应为 403`);
    const body = await res.json();
    assert.equal(body.success, false);
  }
  const project = await apiError(new Error("PROJECT_FORBIDDEN"), "兜底。").json();
  assert.equal(project.error, "无权访问该项目。", "PROJECT_FORBIDDEN 保留项目专用文案");
  const team = await apiError(new Error("TEAM_FORBIDDEN"), "兜底。").json();
  assert.equal(team.error, "没有执行该操作的权限。");
});

test("GET ?teamId 非团队成员返回 403", async () => {
  mockFetch(teamRestHandler()); // 任何成员查询都返回空 → 非成员
  const res = await GET(makeRequest(`/api/teams?teamId=${TEAM}`, { token: "tok-outsider" }));
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "没有执行该操作的权限。");
});

test("POST invite 非 owner/admin 返回 403", async () => {
  mockFetch(teamRestHandler({ membership: EDITOR_MEMBER }));
  const res = await POST(
    makeRequest("/api/teams", {
      token: "tok-editor",
      method: "POST",
      body: { action: "invite", teamId: TEAM, email: "new@example.com", role: "viewer" },
    }),
  );
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.success, false);
});

test("POST invite role 非白名单返回 422", async () => {
  mockFetch(() => {
    throw new Error("role 校验应先于任何数据库访问");
  });
  const res = await POST(
    makeRequest("/api/teams", {
      token: "tok-owner",
      method: "POST",
      body: { action: "invite", teamId: TEAM, email: "new@example.com", role: "superadmin" },
    }),
  );
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.error, "role 必须是 owner|admin|editor|viewer。");
});

test("PATCH 禁止把最后一名 owner 降级", async () => {
  const calls = mockFetch(teamRestHandler({ memberById: OWNER_MEMBER, membership: OWNER_MEMBER, owners: [{ id: "m-owner" }] }));
  const res = await PATCH(makeRequest("/api/teams", { token: "tok-owner", method: "PATCH", body: { memberId: "m-owner", role: "viewer" } }));
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.ok(!calls.some((c) => c.init.method === "PATCH"), "被拦截时不应写入成员表");
});

test("DELETE 禁止移除最后一名 owner", async () => {
  const calls = mockFetch(teamRestHandler({ memberById: OWNER_MEMBER, membership: OWNER_MEMBER, owners: [{ id: "m-owner" }] }));
  const res = await DELETE(makeRequest(`/api/teams?memberId=m-owner`, { token: "tok-owner", method: "DELETE" }));
  assert.equal(res.status, 409);
  assert.ok(!calls.some((c) => c.init.method === "PATCH"), "被拦截时不应写入成员表");
});

test("owner 正常调整普通成员角色返回 200（正向对照）", async () => {
  mockFetch(teamRestHandler({ memberById: EDITOR_MEMBER, membership: OWNER_MEMBER }));
  const res = await PATCH(makeRequest("/api/teams", { token: "tok-owner", method: "PATCH", body: { memberId: "m-editor", role: "viewer" } }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.updated, true);
});
