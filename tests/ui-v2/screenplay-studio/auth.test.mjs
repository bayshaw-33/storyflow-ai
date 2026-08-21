/**
 * Screenplay Studio authentication contract.
 *
 * The browser session is persisted by Supabase in the client, while the
 * screenplay route handlers also support the server cookie session. Requests
 * must carry the current access token so both session arrangements work.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildScreenplayStudioHeaders,
  fetchWithScreenplayStudioAuth,
  fetchScreenplayStudio,
} from "../../../lib/client/v2/screenplay-studio/auth.ts";

test("screenplay requests carry the Supabase access token", () => {
  const headers = buildScreenplayStudioHeaders("access-token-1");

  assert.equal(headers.get("Authorization"), "Bearer access-token-1");
  assert.equal(headers.get("Content-Type"), "application/json");
});

test("screenplay request headers preserve caller headers without a token", () => {
  const headers = buildScreenplayStudioHeaders(null, { "X-Request-ID": "req-1" });

  assert.equal(headers.get("Authorization"), null);
  assert.equal(headers.get("Content-Type"), "application/json");
  assert.equal(headers.get("X-Request-ID"), "req-1");
});

test("an unauthenticated response refreshes the session and retries once", async () => {
  const authorization = [];
  let calls = 0;
  const response = await fetchWithScreenplayStudioAuth("/screenplay", { method: "POST", body: "{}" }, {
    getAccessToken: async () => "expired-token",
    refreshAccessToken: async () => "fresh-token",
    fetcher: async (_input, init) => {
      calls += 1;
      authorization.push(new Headers(init?.headers).get("Authorization"));
      return new Response("{}", { status: calls === 1 ? 401 : 200 });
    },
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  assert.deepEqual(authorization, ["Bearer expired-token", "Bearer fresh-token"]);
});

test("non-authentication failures are never replayed", async () => {
  let calls = 0;
  const response = await fetchWithScreenplayStudioAuth("/screenplay", {}, {
    getAccessToken: async () => "token",
    refreshAccessToken: async () => {
      throw new Error("must not refresh");
    },
    fetcher: async () => {
      calls += 1;
      return new Response("{}", { status: 503 });
    },
  });

  assert.equal(response.status, 503);
  assert.equal(calls, 1);
});

test("a second unauthenticated response stops after the single retry", async () => {
  let calls = 0;
  const response = await fetchWithScreenplayStudioAuth("/screenplay", {}, {
    getAccessToken: async () => "expired-token",
    refreshAccessToken: async () => "fresh-token",
    fetcher: async () => {
      calls += 1;
      return new Response("{}", { status: 401 });
    },
  });

  assert.equal(response.status, 401);
  assert.equal(calls, 2);
});

test("the browser fetch wrapper preserves the Window fetch receiver", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = function fetchWithWindowReceiver() {
    assert.equal(this, globalThis);
    return Promise.resolve(new Response("{}", { status: 200 }));
  };

  try {
    const response = await fetchScreenplayStudio("/screenplay");
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
