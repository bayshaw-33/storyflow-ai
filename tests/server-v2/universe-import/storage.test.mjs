/**
 * Phase 4 Task 4.2 — storage helpers: private keys, upload targets, hash
 * verification reads.
 *
 * Run: node --test tests/server-v2/universe-import/storage.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildObjectKey,
  parseObjectKey,
  signUploadTarget,
  verifyStoredHash,
  MAX_FILE_BYTES,
} from "../../../lib/server/v2/universe-import/storage.ts";

const OWNER = "owner-001";
const SESSION = "session-001";

test("object keys are owner-scoped under the private bucket", () => {
  const key = buildObjectKey({ ownerId: OWNER, sessionId: SESSION, filename: "剧本 第一集.pdf" });
  assert.ok(key.startsWith(`universe-source-imports/${OWNER}/${SESSION}/`));
  assert.ok(!key.includes(".."));
  const parsed = parseObjectKey(key);
  assert.equal(parsed.ownerId, OWNER);
  assert.equal(parsed.sessionId, SESSION);
});

test("parseObjectKey rejects foreign prefixes and traversal", () => {
  assert.throws(() => parseObjectKey("other-bucket/owner/session/f.pdf"));
  assert.throws(() => parseObjectKey("universe-source-imports/../escape.pdf"));
});

test("upload target carries the object key and private acl, never a public URL", () => {
  const target = signUploadTarget({ ownerId: OWNER, sessionId: SESSION, filename: "a.pdf", contentType: "application/pdf" });
  assert.equal(target.objectKey.startsWith("universe-source-imports/"), true);
  assert.equal(target.acl, "private");
  assert.ok(!target.url || !String(target.url).includes("public"));
});

test("verifyStoredHash compares declared hash with storage-reported hash", () => {
  const h = "a".repeat(64);
  assert.equal(verifyStoredHash({ declaredHash: h, storedHash: h }), true);
  assert.equal(verifyStoredHash({ declaredHash: h, storedHash: "b".repeat(64) }), false);
});

test("MAX_FILE_BYTES is 100MB", () => {
  assert.equal(MAX_FILE_BYTES, 100 * 1024 * 1024);
});
