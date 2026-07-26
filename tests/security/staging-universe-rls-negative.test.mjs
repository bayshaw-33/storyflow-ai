import assert from "node:assert/strict";
import test from "node:test";

const enabled = process.env.RUN_STAGING_RLS_TESTS === "1";
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

test("staging rejects User B access to User A universe graph", { skip: !enabled }, async () => {
  assert.ok(url && anonKey && serviceKey, "staging Supabase environment variables are required");

  const suffix = crypto.randomUUID();
  const password = `Rls-${crypto.randomUUID()}-Aa1!`;
  const users = [];
  let universeId = null;
  let projectId = null;

  try {
    const userA = await createUser(`v2-rls-a-${suffix}@example.invalid`, password);
    const userB = await createUser(`v2-rls-b-${suffix}@example.invalid`, password);
    users.push(userA.id, userB.id);
    const tokenA = await signIn(`v2-rls-a-${suffix}@example.invalid`, password);
    const tokenB = await signIn(`v2-rls-b-${suffix}@example.invalid`, password);

    const created = await rest("/rest/v1/storyflow_universes", {
      key: anonKey,
      token: tokenA,
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: { id: crypto.randomUUID(), user_id: userA.id, name: `V2 RLS ${suffix}` },
    });
    assert.equal(created.response.status, 201, "User A must create a staging universe");
    universeId = created.body[0]?.id;
    assert.ok(universeId, "created universe ID is required");

    projectId = `v2-rls-${suffix}`;
    const project = await rest("/rest/v1/storyflow_projects", {
      key: anonKey,
      token: tokenA,
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: { id: projectId, user_id: userA.id, title: "V2 RLS project" },
    });
    assert.equal(project.response.status, 201, "User A must create a staging project");

    const entity = await rest("/rest/v1/storyflow_universe_entities", {
      key: anonKey,
      token: tokenA,
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: { id: crypto.randomUUID(), universe_id: universeId, user_id: userA.id, name: "A Character", type: "character" },
    });
    assert.equal(entity.response.status, 201, "User A must create a staging character");

    const readByB = await rest(`/rest/v1/storyflow_universes?id=eq.${universeId}&select=id`, { key: anonKey, token: tokenB });
    assert.deepEqual(readByB.body, [], "User B must not enumerate User A's universe");

    const insertByB = await rest("/rest/v1/storyflow_universe_entities", {
      key: anonKey,
      token: tokenB,
      method: "POST",
      body: { id: crypto.randomUUID(), universe_id: universeId, user_id: userB.id, name: "Intrusion", type: "character" },
    });
    assert.equal(insertByB.response.ok, false, "User B must not add entities to User A's universe");

    const crossUniverseWrites = [
      ["storyflow_universe_inbox_items", { item_type: "character", title: "Intrusion" }],
      ["storyflow_universe_project_links", { project_id: projectId }],
      ["storyflow_universe_relationships", {}],
      ["storyflow_universe_timeline_events", { title: "Intrusion" }],
      ["storyflow_canon_facts", { fact_text: "Intrusion" }],
      ["storyflow_canon_state_snapshots", { title: "Intrusion" }],
      ["storyflow_canon_check_reports", {}],
      ["storyflow_song_universe_links", { song_project_id: projectId }],
    ];
    for (const [table, payload] of crossUniverseWrites) {
      const ownerWrite = await rest(`/rest/v1/${table}`, {
        key: anonKey,
        token: tokenA,
        method: "POST",
        body: { id: crypto.randomUUID(), universe_id: universeId, user_id: userA.id, ...payload },
      });
      assert.equal(ownerWrite.response.ok, true, `User A must add ${table} rows to their own universe`);

      const result = await rest(`/rest/v1/${table}`, {
        key: anonKey,
        token: tokenB,
        method: "POST",
        body: { id: crypto.randomUUID(), universe_id: universeId, user_id: userB.id, ...payload },
      });
      assert.equal(result.response.ok, false, `User B must not add ${table} rows to User A's universe`);
    }

    await rest(`/rest/v1/storyflow_universes?id=eq.${universeId}`, {
      key: anonKey,
      token: tokenB,
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: { name: "Mutated by User B" },
    });
    const verifyUnchanged = await rest(`/rest/v1/storyflow_universes?id=eq.${universeId}&select=name`, { key: anonKey, token: tokenA });
    assert.equal(verifyUnchanged.body[0]?.name, `V2 RLS ${suffix}`, "User B must not update User A's universe");

    await rest(`/rest/v1/storyflow_universes?id=eq.${universeId}`, { key: anonKey, token: tokenB, method: "DELETE" });
    const verifyExists = await rest(`/rest/v1/storyflow_universes?id=eq.${universeId}&select=id`, { key: anonKey, token: tokenA });
    assert.equal(verifyExists.body[0]?.id, universeId, "User B must not delete User A's universe");
  } finally {
    if (universeId) {
      await Promise.all([
        "storyflow_universe_entities",
        "storyflow_universe_inbox_items",
        "storyflow_universe_project_links",
        "storyflow_universe_relationships",
        "storyflow_universe_timeline_events",
        "storyflow_canon_facts",
        "storyflow_canon_state_snapshots",
        "storyflow_canon_check_reports",
        "storyflow_song_universe_links",
      ].map((table) => rest(`/rest/v1/${table}?universe_id=eq.${universeId}`, { key: serviceKey, method: "DELETE" })));
      await rest(`/rest/v1/storyflow_universes?id=eq.${universeId}`, { key: serviceKey, method: "DELETE" });
    }
    if (projectId) await rest(`/rest/v1/storyflow_projects?id=eq.${projectId}`, { key: serviceKey, method: "DELETE" });
    await Promise.all(users.map((userId) => admin(`/auth/v1/admin/users/${userId}`, { method: "DELETE" })));
  }
});

async function createUser(email, password) {
  const result = await admin("/auth/v1/admin/users", { method: "POST", body: { email, password, email_confirm: true } });
  assert.equal(result.response.status, 200, "temporary staging user creation failed");
  return result.body;
}

async function signIn(email, password) {
  const result = await rest("/auth/v1/token?grant_type=password", { key: anonKey, method: "POST", body: { email, password } });
  assert.equal(result.response.status, 200, "temporary staging user sign-in failed");
  return result.body.access_token;
}

function admin(path, init = {}) {
  return request(path, { ...init, key: serviceKey });
}

function rest(path, init = {}) {
  return request(path, init);
}

async function request(path, { key, token, method = "GET", headers = {}, body } = {}) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token || key}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
  return { response, body: parsed };
}
