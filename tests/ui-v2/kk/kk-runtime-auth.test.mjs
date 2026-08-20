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
    if (specifier === "@/lib/supabase/client") {
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
    assert.equal(observed.at(-1)?.messages.length, 0);
  } finally {
    await act(async () => renderer?.unmount());
    globalThis.fetch = originalFetch;
    delete globalThis.__kkTestSupabaseClient;
  }

  assert.equal(unsubscribed, true);
});
