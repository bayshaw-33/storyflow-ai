/**
 * Screenplay Studio authentication contract.
 *
 * The browser session is persisted by Supabase in the client, while the
 * screenplay route handlers also support the server cookie session. Requests
 * must carry the current access token so both session arrangements work.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { buildScreenplayStudioHeaders } from "../../../lib/client/v2/screenplay-studio/auth.ts";

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
