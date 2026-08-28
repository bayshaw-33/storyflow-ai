import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React, { act } from "react";
import TestRenderer from "react-test-renderer";
import ts from "typescript";

process.env.NEXT_PUBLIC_USE_JOB_FIXTURE = "false";
process.env.NEXT_PUBLIC_USE_KK_FIXTURE = "false";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const projectRoot = resolve(new URL("../../..", import.meta.url).pathname);
const supabaseClientModule = "kk-test:supabase-client";

function resolveProjectModule(specifier) {
  const base = resolve(projectRoot, specifier.slice(2));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`]) {
    if (existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  throw new Error(`Unable to resolve test module alias: ${specifier}`);
}

function resolveRelativeModule(specifier, parentURL) {
  const base = resolve(dirname(fileURLToPath(parentURL)), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`]) {
    if (existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/supabase/client" || (specifier.startsWith(".") && context.parentURL?.startsWith("file:") && resolve(dirname(fileURLToPath(context.parentURL)), specifier) === resolve(projectRoot, "lib/supabase/client.ts"))) {
      return { url: supabaseClientModule, shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      return { url: resolveProjectModule(specifier), shortCircuit: true };
    }
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const url = resolveRelativeModule(specifier, context.parentURL);
      if (url) return { url, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === supabaseClientModule) {
      return {
        format: "module",
        shortCircuit: true,
        source: "export function getSupabaseBrowserClient() { return globalThis.__kkTestSupabaseClient; }",
      };
    }
    if (url.endsWith(".tsx")) {
      const source = readFileSync(new URL(url), "utf8");
      return {
        format: "module",
        shortCircuit: true,
        source: ts.transpileModule(source, {
          compilerOptions: {
            jsx: ts.JsxEmit.ReactJSX,
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
          fileName: new URL(url).pathname,
        }).outputText,
      };
    }
    return nextLoad(url, context);
  },
});

const { KkRuntimeProvider } = await import("../../../components/v2/kk/KkRuntimeProvider.tsx");
const { useKkRuntime } = await import("../../../components/v2/kk/useKkRuntime.ts");

test("KK retries a transient runtime outage without stopping job polling", async () => {
  globalThis.__kkTestSupabaseClient = {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "token", user: { id: "u" } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  };
  const originalFetch = globalThis.fetch;
  const originalInterval = globalThis.setInterval;
  const originalClear = globalThis.clearInterval;
  const ticks = new Map();
  let counter = 0;
  globalThis.setInterval = (fn) => { const id = ++counter; ticks.set(id, fn); return id; };
  globalThis.clearInterval = (id) => ticks.delete(id);
  let runtimeCalls = 0;
  let jobsCalls = 0;
  globalThis.fetch = async (input) => {
    if (String(input) === "/api/v2/kk") {
      runtimeCalls++;
      return runtimeCalls === 1 ? Response.json({ success: false }, { status: 503 }) : Response.json(runtimeResponse());
    }
    if (String(input) === "/api/v2/jobs") {
      jobsCalls++;
      return Response.json({ success: true, items: [], hasMore: false });
    }
    return Response.json({ success: true, events: [], nextCursor: 0 });
  };
  let latest;
  function Probe() { latest = useKkRuntime(); return null; }
  let renderer;
  try {
    await act(async () => { renderer = TestRenderer.create(React.createElement(KkRuntimeProvider, { allowFixtureFallback: false }, React.createElement(Probe))); });
    await settle();
    assert.equal(latest.error?.code, "service_unavailable");
    assert.ok(ticks.size > 0, "an outage must not disable recovery polling");
    await act(async () => { for (const tick of [...ticks.values()]) tick(); });
    await settle();
    assert.ok(runtimeCalls >= 2);
    assert.ok(jobsCalls >= 2);
    assert.equal(latest.error, null);
    assert.notEqual(latest.connectionState, "offline");
  } finally {
    await act(async () => renderer?.unmount());
    globalThis.fetch = originalFetch;
    globalThis.setInterval = originalInterval;
    globalThis.clearInterval = originalClear;
    delete globalThis.__kkTestSupabaseClient;
  }
});

function runtimeResponse() {
  return {
    success: true,
    contractVersion: "2.0.0-alpha.1",
    profile: null,
    entitlements: [],
    serverCursor: 0,
    taskProjection: { queued: 0, running: 0, ingesting: 0, completed: 0, failed: 0 },
    pendingConfirmations: [],
    allowedActions: [],
    featureFlags: { kkRealtime: true },
  };
}

async function settle() {
  await act(async () => {
    await new Promise((resolveTick) => setTimeout(resolveTick, 10));
  });
}

test("root KK provider authenticates jobs from the browser session and isolates auth transitions", async () => {
  const authCallbacks = new Set();
  const authHeaders = [];
  let currentToken = "browser-session-token";
  let currentUser = { id: "user-a" };
  let unsubscribed = false;
  let jobsCallCount = 0;
  let releaseFirstJobs;

  globalThis.__kkTestSupabaseClient = {
    auth: {
      async getSession() {
        return { data: { session: { access_token: currentToken, user: currentUser } } };
      },
      onAuthStateChange(callback) {
        authCallbacks.add(callback);
        return {
          data: {
            subscription: {
              unsubscribe() {
                unsubscribed = true;
                authCallbacks.delete(callback);
              },
            },
          },
        };
      },
    },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const authorization = new Headers(init.headers).get("authorization");
    authHeaders.push({ url, authorization });
    if (authorization !== `Bearer ${currentToken}`) {
      return Response.json({ success: false, code: "unauthenticated", error: "Authentication required." }, { status: 401 });
    }
    if (url === "/api/v2/kk") return Response.json(runtimeResponse());
    if (url === "/api/v2/jobs") {
      jobsCallCount += 1;
      if (jobsCallCount === 1) {
        return new Promise((resolveResponse) => {
          releaseFirstJobs = () => resolveResponse(Response.json({
            success: true,
            contractVersion: "2.0.0-alpha.1",
            hasMore: false,
            items: [{
              id: "stale-user-a-job",
              projectId: "project-a",
              workId: "work-a",
              workbenchType: "storyboard",
              resultUrl: "/production?projectId=project-a&workId=work-a&tab=storyboard",
              jobType: "image",
              status: "completed",
              phase: "completed",
              progress: { completed: 1, total: 1 },
              resultReferences: [],
              actions: ["view_results"],
              createdAt: "2026-08-20T04:00:00.000Z",
              completedAt: "2026-08-20T04:01:00.000Z",
            }],
          }));
        });
      }
      return Response.json({ success: true, contractVersion: "2.0.0-alpha.1", hasMore: false, items: [] });
    }
    if (url.startsWith("/api/v2/kk/events")) {
      return Response.json({ success: true, events: [], nextCursor: 0 });
    }
    throw new Error(`Unexpected runtime request: ${url}`);
  };

  const observed = [];
  function RuntimeProbe() {
    observed.push(useKkRuntime());
    return null;
  }

  let renderer;
  try {
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          KkRuntimeProvider,
          { allowFixtureFallback: false, pollingEnabled: false },
          React.createElement(RuntimeProbe),
        ),
      );
    });
    await settle();

    assert.ok(authHeaders.some(({ url, authorization }) => url === "/api/v2/jobs" && authorization === "Bearer browser-session-token"));
    assert.equal(observed.at(-1)?.error, null);
    assert.equal(typeof releaseFirstJobs, "function");

    currentToken = "refreshed-session-token";
    await act(async () => {
      for (const callback of authCallbacks) callback("TOKEN_REFRESHED", { access_token: currentToken, user: currentUser });
    });
    await settle();
    assert.ok(authHeaders.some(({ url, authorization }) => url === "/api/v2/jobs" && authorization === "Bearer refreshed-session-token"));

    currentUser = { id: "user-b" };
    currentToken = "second-user-token";
    await act(async () => {
      for (const callback of authCallbacks) callback("SIGNED_IN", { access_token: currentToken, user: currentUser });
    });
    await settle();
    releaseFirstJobs();
    await settle();
    assert.equal(observed.at(-1)?.messages.length, 0);
  } finally {
    await act(async () => renderer?.unmount());
    globalThis.fetch = originalFetch;
    delete globalThis.__kkTestSupabaseClient;
  }

  assert.equal(unsubscribed, true);
});
