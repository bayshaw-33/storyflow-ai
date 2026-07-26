import assert from "node:assert/strict";
import test from "node:test";

const enabled = process.env.RUN_STAGING_RLS_TESTS === "1";
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

test("staging scopes V2 assets to their project, actor, or job owner", { skip: !enabled }, async () => {
  assert.ok(url && anonKey && serviceKey, "staging Supabase environment variables are required");
  const suffix = crypto.randomUUID();
  const password = `Rls-${crypto.randomUUID()}-Aa1!`;
  const users = [];
  const ids = {};
  const projectId = `v2-assets-${suffix}`;
  try {
    const userA = await createUser(`v2-assets-a-${suffix}@example.invalid`, password);
    const userB = await createUser(`v2-assets-b-${suffix}@example.invalid`, password);
    users.push(userA.id, userB.id);
    const tokenA = await signIn(`v2-assets-a-${suffix}@example.invalid`, password);
    const tokenB = await signIn(`v2-assets-b-${suffix}@example.invalid`, password);
    await create("storyflow_projects", tokenA, { id: projectId, user_id: userA.id, title: "V2 asset RLS" });
    ids.actor = await create("storyflow_actor_profiles", tokenA, { id: crypto.randomUUID(), owner_id: userA.id, name: "RLS Actor", visibility: "private" });
    ids.passport = await create("storyflow_identity_passports", tokenA, { id: crypto.randomUUID(), actor_profile_id: ids.actor, project_id: projectId });
    ids.keyframeSet = await create("storyflow_keyframe_sets", tokenA, { id: crypto.randomUUID(), project_id: projectId, shot_id: "shot-a" });
    ids.keyframeSlot = await create("storyflow_keyframe_slots", tokenA, { id: crypto.randomUUID(), keyframe_set_id: ids.keyframeSet, shot_id: "shot-a" });
    ids.keyframeCandidate = await create("storyflow_keyframe_candidates", tokenA, { id: crypto.randomUUID(), keyframe_slot_id: ids.keyframeSlot });
    ids.take = await create("storyflow_selected_takes", tokenA, { id: crypto.randomUUID(), project_id: projectId, shot_id: "shot-a", video_url: "storage://test/take.mp4" });
    ids.sequence = await create("storyflow_assembly_sequences", tokenA, { id: crypto.randomUUID(), project_id: projectId });
    ids.item = await create("storyflow_assembly_items", tokenA, { id: crypto.randomUUID(), assembly_sequence_id: ids.sequence, shot_id: "shot-a", selected_take_id: ids.take });
    ids.job = await create("storyflow_generation_jobs", null, { id: crypto.randomUUID(), owner_id: userA.id, job_type: "image", provider: "test" }, serviceKey);
    ids.target = await create("storyflow_generation_job_targets", tokenA, { id: crypto.randomUUID(), generation_job_id: ids.job, target_type: "shot", target_id: "shot-a" });
    ids.input = await create("storyflow_input_assets", tokenA, { id: crypto.randomUUID(), generation_job_id: ids.job, asset_type: "image", asset_url: "storage://test/input.png" });

    for (const [table, id] of [["storyflow_identity_passports", ids.passport], ["storyflow_keyframe_sets", ids.keyframeSet], ["storyflow_keyframe_slots", ids.keyframeSlot], ["storyflow_keyframe_candidates", ids.keyframeCandidate], ["storyflow_selected_takes", ids.take], ["storyflow_assembly_sequences", ids.sequence], ["storyflow_assembly_items", ids.item], ["storyflow_generation_job_targets", ids.target], ["storyflow_input_assets", ids.input]]) {
      const result = await rest(`/rest/v1/${table}?id=eq.${id}&select=id`, { token: tokenB });
      assert.deepEqual(result.body, [], `User B must not read User A's ${table}`);
    }
  } finally {
    await Promise.all([
      ["storyflow_identity_passports", ids.passport], ["storyflow_keyframe_sets", ids.keyframeSet], ["storyflow_selected_takes", ids.take], ["storyflow_assembly_sequences", ids.sequence], ["storyflow_generation_jobs", ids.job], ["storyflow_actor_profiles", ids.actor],
    ].filter(([, id]) => id).map(([table, id]) => rest(`/rest/v1/${table}?id=eq.${id}`, { key: serviceKey, method: "DELETE" })));
    await rest(`/rest/v1/storyflow_projects?id=eq.${projectId}`, { key: serviceKey, method: "DELETE" });
    await Promise.all(users.map((id) => admin(`/auth/v1/admin/users/${id}`, { method: "DELETE" })));
  }
});

async function create(table, token, body, key) { const result = await rest(`/rest/v1/${table}`, { key, token, method: "POST", headers: { Prefer: "return=representation" }, body }); assert.equal(result.response.status, 201, `owner must create ${table}`); return result.body[0]?.id; }
async function createUser(email, password) { const result = await admin("/auth/v1/admin/users", { method: "POST", body: { email, password, email_confirm: true } }); assert.equal(result.response.status, 200); return result.body; }
async function signIn(email, password) { const result = await rest("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } }); assert.equal(result.response.status, 200); return result.body.access_token; }
function admin(path, init = {}) { return request(path, { ...init, key: serviceKey }); }
function rest(path, init = {}) { return request(path, init); }
async function request(path, { key = anonKey, token, method = "GET", headers = {}, body } = {}) { const response = await fetch(`${url}${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${token || key}`, "Content-Type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined }); const raw = await response.text(); let parsed = null; try { parsed = raw ? JSON.parse(raw) : null; } catch {} return { response, body: parsed }; }
