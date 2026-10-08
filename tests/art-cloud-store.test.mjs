import assert from "node:assert/strict";
import test, { beforeEach, after } from "node:test";
import { existsSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return { url: pathToFileURL(require.resolve("next/server.js")).href, shortCircuit: true };
    const base = specifier.startsWith("@/") ? path.join(root, specifier.slice(2))
      : specifier.startsWith(".") && context.parentURL ? fileURLToPath(new URL(specifier, context.parentURL)) : null;
    if (base) for (const candidate of [base, `${base}.ts`, path.join(base, "index.ts")]) {
      if (candidate.endsWith(".ts") && existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
    return nextResolve(specifier, context, nextResolve);
  },
});
async function load(relative) {
  const url = new URL(relative, import.meta.url);
  return existsSync(url) ? import(url.href) : {};
}
const store = await load("../lib/art/cloud-store.ts");
const draftRoute = await load("../app/api/art/draft/route.ts");
const jobRoute = await load("../app/api/art/jobs/[jobId]/route.ts");
const downloadRoute = await load("../app/api/art/download/route.ts");
const modelRoute = await load("../app/api/art/models/route.ts");
const signRoute = await load("../app/api/art/sign-assets/route.ts");
const generateRoute = await load("../app/api/art/generate-image/route.ts");
const originalFetch = globalThis.fetch;
const envKeys = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "BFL_API_KEY", "ATLASCLOUD_API_KEY", "ART_ATLAS_ALLOW_ALL_AUTHENTICATED_USERS", "ART_ATLAS_AUTHORIZED_USER_IDS", "ART_ATLAS_AUTHORIZED_EMAILS", "ADMIN_EMAIL"];
const previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
after(() => {
  globalThis.fetch = originalFetch;
  for (const key of envKeys) previousEnv[key] === undefined ? delete process.env[key] : process.env[key] = previousEnv[key];
});
const scope = { projectId: "project-a", workId: "work-a" };
const draft = { state: { assets: [] }, messages: [], jobs: [] };
let objects, calls, generationCount, failGenerate, failStorage, holdGeneration, releaseGeneration;
const json = (body, status = 200) => Response.json(body, { status });
beforeEach(() => {
  objects = new Map(); calls = []; generationCount = 0; failGenerate = false; failStorage = false; holdGeneration = null;
  for (const key of envKeys) delete process.env[key];
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: "https://storage.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-test", SUPABASE_SERVICE_ROLE_KEY: "service-test", BFL_API_KEY: "flux-test-secret" });
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const headers = new Headers(init.headers);
    calls.push({ url: url.href, method: init.method || "GET", headers, body: init.body });
    if (url.pathname === "/auth/v1/user") {
      const token = headers.get("authorization");
      return token === "Bearer alice" || token === "Bearer bob" ? json({ id: token.slice(7), email: `${token.slice(7)}@example.com` }) : json({}, 401);
    }
    if (url.hostname === "api.bfl.ai") {
      generationCount++;
      if (holdGeneration) await holdGeneration;
      if (failGenerate) return json({}, 500);
      return json({ id: `provider-${generationCount}`, polling_url: "https://poll.test/task" });
    }
    if (url.hostname === "poll.test") return json({ status: "Ready", result: { sample: "https://image.test/original.png" } });
    if (url.hostname === "image.test") return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
    if (url.pathname.startsWith("/storage/v1/object/sign/art-assets/")) return json({ signedURL: `/object/sign/art-assets/${url.pathname.split("art-assets/")[1]}?token=fresh` });
    const prefix = "/storage/v1/object/art-assets/";
    assert.ok(url.pathname.startsWith(prefix), `unexpected network request ${url.href}`);
    const key = decodeURIComponent(url.pathname.slice(prefix.length));
    if (failStorage) return json({ message: "storage unavailable" }, 503);
    if (init.method === "POST") {
      if (headers.get("x-upsert") === "false" && objects.has(key)) return json({ statusCode: "409", error: "Duplicate", message: "The resource already exists" }, 409);
      objects.set(key, { body: init.body, type: headers.get("content-type") });
      return json({ Key: key });
    }
    const object = objects.get(key);
    // Supabase Storage reports absent objects as HTTP 400 with statusCode 404.
    return object ? new Response(object.body, { headers: { "content-type": object.type } }) : json({ statusCode: "404", error: "not_found" }, 400);
  };
});
function request(url, body, user = "alice") {
  return new Request(`https://kiikis.test${url}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${user}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}
const generation = (jobId = "job-a", extra = {}) => ({ prompt: "portrait", selection: "flux", scope, jobId, ...extra });
async function generate(body = generation()) { return generateRoute.POST(request("/api/art/generate-image", body)); }

test("scope separates owners, Work and independent drafts without ambiguous keys", () => {
  assert.equal(typeof store.resolveArtCloudScope, "function", "scope resolver is required");
  const prefix = store.resolveArtCloudScope("alice", scope);
  assert.match(prefix, /^alice\/workbench\/[^/]+$/);
  assert.notEqual(prefix, store.resolveArtCloudScope("bob", scope));
  assert.notEqual(prefix, store.resolveArtCloudScope("alice", { ...scope, workId: "work-b" }));
  assert.notEqual(prefix, store.resolveArtCloudScope("alice", { draftId: "work-a" }));
  for (const bad of [{}, { projectId: "p" }, { workId: "w" }, { ...scope, draftId: "d" }, { draftId: "../bob" }, { draftId: "%2e%2e" }]) assert.throws(() => store.resolveArtCloudScope("alice", bad));
});

test("draft is round-tripped in private Storage and missing means null only", async () => {
  assert.equal(typeof store.readArtCloudDraft, "function");
  assert.equal(await store.readArtCloudDraft("alice", scope), null);
  await store.writeArtCloudDraft("alice", scope, draft);
  assert.deepEqual(await store.readArtCloudDraft("alice", scope), draft);
  assert.equal(await store.readArtCloudDraft("bob", scope), null);
  assert.equal(await store.readArtCloudDraft("alice", { ...scope, workId: "other" }), null);
  assert.ok(objects.has(`${store.resolveArtCloudScope("alice", scope)}/draft.json`));
  failStorage = true;
  await assert.rejects(store.readArtCloudDraft("alice", scope), /STORAGE/);
});

test("draft PUT authenticates owner, bounds full payload and GET uses the same scope", async () => {
  assert.equal(typeof draftRoute.PUT, "function");
  const put = request("/api/art/draft", { ...scope, draft, userId: "bob" });
  assert.equal((await draftRoute.PUT(put)).status, 200);
  const query = "?projectId=project-a&workId=work-a";
  assert.deepEqual((await (await draftRoute.GET(request(`/api/art/draft${query}`))).json()).draft, draft);
  assert.equal((await (await draftRoute.GET(request(`/api/art/draft${query}`, undefined, "bob"))).json()).draft, null);
  assert.equal((await draftRoute.GET(request(`/api/art/draft${query}`, undefined, "invalid"))).status, 401);
  assert.equal((await draftRoute.PUT(request("/api/art/draft", { ...scope, draft: { state: {}, messages: [], jobs: [], huge: "x".repeat(1024 * 1024) } }))).status, 413);
  assert.equal((await draftRoute.PUT(request("/api/art/draft", { ...scope, draft: {} }))).status, 400);
  failStorage = true;
  assert.equal((await draftRoute.GET(request(`/api/art/draft${query}`))).status, 502);
});

test("jobs persist all results and expire running without automatically retrying", async () => {
  assert.equal(typeof store.writeArtCloudJob, "function");
  const job = { jobId: "job-a", status: "running", createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), expiresAt: new Date(1).toISOString(), images: [], error: null };
  await store.writeArtCloudJob("alice", scope, job);
  const expired = await store.readArtCloudJob("alice", scope, "job-a");
  assert.equal(expired.status, "failed");
  assert.equal(expired.error, "ART_JOB_EXPIRED");
  assert.equal(await store.readArtCloudJob("bob", scope, "job-a"), null);
  assert.equal((await store.readArtCloudJob("alice", scope, "job-a")).status, "failed");
  await assert.rejects(store.readArtCloudJob("alice", scope, "../escape"));
  assert.equal((await jobRoute.GET(request("/api/art/jobs/job-a?projectId=project-a&workId=work-a"), { params: Promise.resolve({ jobId: "job-a" }) })).status, 200);
});

test("generation saves running before payment and completed results are replayed once", async () => {
  const first = await generate(generation("job-a", { count: 2 }));
  assert.equal(first.status, 200);
  const body = await first.json();
  assert.equal(body.jobId, "job-a");
  assert.equal(body.status, "completed");
  assert.equal(body.images.length, 2);
  assert.equal(generationCount, 2);
  const firstPayment = calls.findIndex(call => call.url.includes("api.bfl.ai"));
  assert.ok(calls.slice(0, firstPayment).some(call => call.method === "POST" && call.url.includes("jobs/job-a.json")));
  const second = await (await generate(generation("job-a", { count: 2 }))).json();
  assert.deepEqual(second.images, body.images);
  assert.equal(generationCount, 2);
  const saved = await store.readArtCloudJob("alice", scope, "job-a");
  assert.equal(saved.status, "completed");
  assert.equal(saved.images.length, 2);
  assert.ok(saved.images.every(image => image.storagePath.startsWith(`${store.resolveArtCloudScope("alice", scope)}/generated/`)));
  assert.deepEqual(await store.readArtCloudJob("alice", { draftId: "other" }, "job-a"), null);
});

test("simultaneous same-id requests make only one paid generation", async () => {
  assert.equal(typeof store.writeArtCloudJob, "function", "durable job claim is required");
  holdGeneration = new Promise(resolve => { releaseGeneration = resolve; });
  const first = generate();
  while (!generationCount) await new Promise(resolve => setImmediate(resolve));
  try {
    const second = await generate();
    assert.equal(second.status, 202);
    assert.equal((await second.json()).status, "running");
    assert.equal(generationCount, 1);
  } finally { releaseGeneration(); }
  assert.equal((await first).status, 200);
});

test("four FLUX candidates run together rather than multiplying the polling time", async () => {
  holdGeneration = new Promise(resolve => { releaseGeneration = resolve; });
  const result = generate(generation("four-candidates", { count: 4 }));
  while (!generationCount) await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  const submittedBeforeCompletion = generationCount;
  releaseGeneration();
  const response = await result;
  assert.equal(response.status, 200);
  assert.equal((await response.json()).images.length, 4);
  assert.equal(submittedBeforeCompletion, 4, "four serial 120s polls can exceed the route's 300s limit");
});

test("racing initial requests use Storage create-only claims across callers", async () => {
  const responses = await Promise.all([generate(), generate()]);
  assert.ok(responses.every(response => [200, 202].includes(response.status)));
  assert.equal(generationCount, 1);
  const claims = calls.filter(call => call.url.includes("jobs/job-a.json") && call.method === "POST" && call.headers.get("x-upsert") === "false");
  assert.equal(claims.length, 2, "both callers observed absence; Storage arbitrates the winner");
  assert.equal((await store.readArtCloudJob("alice", scope, "job-a")).status, "completed");
});

test("Storage's HTTP 400 Duplicate format does not overwrite an existing task", async () => {
  const job = { jobId: "job-a", status: "running", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 330000).toISOString(), images: [], error: null };
  await store.writeArtCloudJob("alice", scope, job, { createOnly: true });
  const fixtureFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const response = await fixtureFetch(input, init);
    return response.status === 409 ? json({ statusCode: "400", error: "Duplicate", message: "The resource already exists" }, 400) : response;
  };
  assert.equal(await store.writeArtCloudJob("alice", scope, { ...job, prompt: "do not replace" }, { createOnly: true }), false);
  assert.deepEqual(await store.readArtCloudJob("alice", scope, "job-a"), job);
});

test("provider failure stays failed and replay never recharges; storage failure prevents payment", async () => {
  failGenerate = true;
  assert.equal((await generate()).status, 502);
  assert.equal(typeof store.readArtCloudJob, "function");
  assert.equal((await store.readArtCloudJob("alice", scope, "job-a")).status, "failed");
  failGenerate = false;
  assert.equal((await generate()).status, 502);
  assert.equal(generationCount, 1);
  failStorage = true;
  assert.equal((await generate(generation("job-b"))).status, 502);
  assert.equal(generationCount, 1);
});

test("references are owner-checked and re-signed; unsafe URLs and encoded traversal never generate", async () => {
  const response = await generate(generation("ref-job", { referencePaths: ["alice/references/ref.png"] }));
  assert.equal(response.status, 200);
  assert.ok(calls.some(call => call.url.includes("/object/sign/art-assets/alice/references/ref.png")));
  for (const bad of ["bob/references/ref.png", "alice/%2e%2e/bob.png", "alice//ref.png", "alice/../ref.png", "alice/ref.png?token=x"]) {
    const before = generationCount;
    assert.equal((await generate(generation(`bad-${before}`, { referencePaths: [bad] }))).status, 403);
    assert.equal(generationCount, before);
  }
  assert.equal((await generate(generation("external", { referenceUrls: ["https://outside.test/image.png"] }))).status, 403);
  assert.equal((await generate(generation("old-ref", { referenceUrls: ["https://storage.test/storage/v1/object/sign/art-assets/alice/references/old.png?token=expired"] }))).status, 200);
  assert.equal((await generate(generation("actor-ref", { referenceUrls: ["https://storage.test/storage/v1/object/sign/art-assets/actor-avatars/alice/portrait.jpg?token=expired"] }))).status, 200);
  assert.equal((await generate(generation("other-actor", { referencePaths: ["actor-avatars/bob/portrait.jpg"] }))).status, 403);
});

test("imported actor avatars can refresh previews without exposing another owner's avatar", async () => {
  const response = await signRoute.POST(request("/api/art/sign-assets", { paths: ["actor-avatars/alice/portrait.jpg"] }));
  assert.equal(response.status, 200);
  assert.ok((await response.json()).urls["actor-avatars/alice/portrait.jpg"]);
  assert.equal((await signRoute.POST(request("/api/art/sign-assets", { paths: ["actor-avatars/bob/portrait.jpg"] }))).status, 403);
});

test("untracked legacy generation remains usable and defaults to portrait", async () => {
  const response = await generate({ prompt: "portrait", selection: "flux" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).images.length, 1);
  const paidRequest = JSON.parse(calls.find(call => call.url.includes("api.bfl.ai")).body);
  assert.deepEqual([paidRequest.width, paidRequest.height], [800, 1408]);
});

test("legacy asset requests preserve an explicitly selected aspect ratio", async () => {
  const response = await generate({ asset: { id: "asset-a", name: "portrait", kind: "character" }, mode: "reference_sheet", aspectRatio: "4:3" });
  assert.equal(response.status, 200);
  const paidRequest = JSON.parse(calls.find(call => call.url.includes("api.bfl.ai")).body);
  assert.deepEqual([paidRequest.width, paidRequest.height], [1408, 1056]);
});

test("download sends original attachment bytes and blocks other owners and path tricks", async () => {
  assert.equal(typeof downloadRoute.POST, "function");
  objects.set("alice/references/original.png", { body: new Uint8Array([137, 80, 78, 71]), type: "image/png" });
  const response = await downloadRoute.POST(request("/api/art/download", { storagePath: "alice/references/original.png", name: "原图\r\n\".png" }));
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([137, 80, 78, 71]));
  assert.match(response.headers.get("content-disposition"), /^attachment;/);
  assert.doesNotMatch(response.headers.get("content-disposition"), /[\r\n]/);
  for (const storagePath of ["bob/references/original.png", "alice/%2e%2e/bob.png", "alice/../bob.png", "alice/workbench/scope/draft.json"]) {
    assert.equal((await downloadRoute.POST(request("/api/art/download", { storagePath }))).status, 403);
  }
  assert.equal((await downloadRoute.POST(request("/api/art/download", { storagePath: "alice/references/original.png" }, "invalid"))).status, 401);
});

test("model directory exposes only configured credentials and authorized capabilities, never secrets", async () => {
  assert.equal(typeof modelRoute.GET, "function");
  process.env.ATLASCLOUD_API_KEY = "atlas-test-secret";
  let response = await (await modelRoute.GET(request("/api/art/models"))).json();
  assert.ok(response.models.length > 0);
  assert.ok(response.models.every(model => model.provider === "flux"));
  process.env.ART_ATLAS_AUTHORIZED_USER_IDS = "alice";
  const directory = await (await modelRoute.GET(request("/api/art/models"))).json();
  assert.ok(directory.models.some(model => model.id === "openai/gpt-image-2/edit"), "unfiltered directory includes reference-edit models for the UI");
  response = await (await modelRoute.GET(request("/api/art/models?hasReferences=true"))).json();
  assert.ok(response.models.some(model => model.provider === "atlas"));
  assert.ok(response.models.every(model => model.capabilities.includes("image-edit")));
  assert.doesNotMatch(JSON.stringify(response), /test-secret/);
  delete process.env.BFL_API_KEY; delete process.env.ATLASCLOUD_API_KEY;
  assert.deepEqual((await (await modelRoute.GET(request("/api/art/models"))).json()).models, []);
  assert.equal((await modelRoute.GET(request("/api/art/models", undefined, "invalid"))).status, 401);
});

test("expired generation returns terminal failure without a second provider charge", async () => {
  await store.writeArtCloudJob("alice", scope, { jobId: "job-a", status: "running", createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), expiresAt: new Date(1).toISOString(), images: [], error: null });
  const response = await generate();
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, "ART_JOB_EXPIRED");
  assert.equal(generationCount, 0);
});

test("job IDs require a scope, invalid scopes never generate, scope alone assigns an ID", async () => {
  for (const body of [{ prompt: "p", jobId: "job-a" }, { prompt: "p", scope: null }, generation("../escape"), generation("job-a", { scope: { projectId: "p" } })]) {
    assert.equal((await generate(body)).status, 400);
  }
  assert.equal(generationCount, 0);
  const response = await generate({ prompt: "portrait", selection: "flux", scope: { draftId: "independent" } });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.ok(body.jobId);
  assert.equal((await store.readArtCloudJob("alice", { draftId: "independent" }, body.jobId)).status, "completed");
});

test("scope and owner cannot be bypassed through generation storage destination", async () => {
  for (const body of [generation("bad-asset", { assetId: "../../bob" }), { prompt: "p", projectId: "../bob" }]) {
    assert.equal((await generate(body)).status, 403);
  }
  assert.equal(generationCount, 0);
  const response = await generate(generation("safe", { projectId: "../bob", userId: "bob" }));
  assert.equal(response.status, 200);
  assert.ok((await response.json()).images.every(image => image.storagePath.startsWith(`${store.resolveArtCloudScope("alice", scope)}/generated/`)));
});

test("malformed JSON values return 400 rather than storage or provider errors", async () => {
  assert.equal((await draftRoute.PUT(request("/api/art/draft", null))).status, 400);
  assert.equal((await downloadRoute.POST(request("/api/art/download", null))).status, 400);
  for (const body of [null, { prompt: 12 }, { prompt: "p", aspectRatio: "invalid" }]) assert.equal((await generate(body)).status, 400);
  assert.equal(generationCount, 0);
});

test("download missing original returns 404, and mismatched non-image content is forbidden", async () => {
  assert.equal((await downloadRoute.POST(request("/api/art/download", { storagePath: "alice/references/missing.png" }))).status, 404);
  objects.set("alice/references/fake.png", { body: "<html>private</html>", type: "text/html" });
  assert.equal((await downloadRoute.POST(request("/api/art/download", { storagePath: "alice/references/fake.png" }))).status, 403);
});

test("corrupt drafts are an error; long histories cannot overwrite a valid draft", async () => {
  const key = `${store.resolveArtCloudScope("alice", scope)}/draft.json`;
  objects.set(key, { body: "broken JSON", type: "application/json" });
  await assert.rejects(store.readArtCloudDraft("alice", scope), /JSON_INVALID/);
  await store.writeArtCloudDraft("alice", scope, draft);
  await assert.rejects(store.writeArtCloudDraft("alice", scope, { ...draft, messages: Array(501).fill({}) }), /TOO_LARGE/);
  await assert.rejects(store.writeArtCloudDraft("alice", scope, { ...draft, jobs: Array(201).fill({}) }), /TOO_LARGE/);
  assert.deepEqual(await store.readArtCloudDraft("alice", scope), draft);
});

test("job lookup cannot read another user, a missing task, or traversal scope", async () => {
  await generate();
  const context = { params: Promise.resolve({ jobId: "job-a" }) };
  const route = "/api/art/jobs/job-a?projectId=project-a&workId=work-a";
  assert.equal((await (await jobRoute.GET(request(route, undefined, "bob"), context)).json()).job, null);
  assert.equal((await jobRoute.GET(request(route, undefined, "invalid"), context)).status, 401);
  assert.equal((await (await jobRoute.GET(request("/api/art/jobs/job-a?draftId=other"), context)).json()).job, null);
  assert.equal((await jobRoute.GET(request("/api/art/jobs/job-a?draftId=..%2Fescape"), context)).status, 400);
});
