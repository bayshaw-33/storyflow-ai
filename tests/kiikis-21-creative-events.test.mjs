import assert from "node:assert/strict";
import test from "node:test";

const { parseCreativeEvent, CreativeEventError, SENSITIVE_PAYLOAD_KEYS } = await import(
  "../lib/contracts/v2/creative-events.ts"
);

const USER_ID = "11111111-1111-1111-1111-111111111111";
const PROJECT_ID = "proj-umbral-ep06";
const TASK_ID = "22222222-2222-2222-2222-222222222222";
const NOW = "2026-08-13T10:00:00.000Z";

function validEvent(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    sequence: 1,
    eventType: "task.progressed",
    schemaVersion: 1,
    actorType: "system",
    actorId: null,
    ownerId: USER_ID,
    resourceType: "project",
    resourceId: PROJECT_ID,
    taskId: TASK_ID,
    idempotencyKey: "task-1:progress:7",
    visibility: "private",
    payload: { completed: 7, total: 12, unit: "frame" },
    occurredAt: NOW,
    createdAt: NOW,
    ...overrides,
  };
}

test("K21-EV-001: parses a fully valid creative event", () => {
  const event = parseCreativeEvent(validEvent());
  assert.equal(event.schemaVersion, 1);
  assert.equal(event.eventType, "task.progressed");
  assert.equal(event.ownerId, USER_ID);
  assert.equal(event.idempotencyKey, "task-1:progress:7");
  assert.equal(event.visibility, "private");
  assert.deepEqual(event.payload, { completed: 7, total: 12, unit: "frame" });
});

test("K21-EV-001: assigns a generated id when omitted", () => {
  const { id: _omit, ...withoutId } = validEvent();
  const event = parseCreativeEvent(withoutId);
  assert.ok(event.id, "id should be generated");
  assert.equal(typeof event.id, "string");
});

test("K21-EV-001: schemaVersion must be a positive integer", () => {
  assert.throws(() => parseCreativeEvent(validEvent({ schemaVersion: 0 })), /schema_version/i);
  assert.throws(() => parseCreativeEvent(validEvent({ schemaVersion: -1 })), /schema_version/i);
  assert.throws(() => parseCreativeEvent(validEvent({ schemaVersion: 1.5 })), /schema_version/i);
  assert.throws(() => parseCreativeEvent(validEvent({ schemaVersion: "1" })), /schema_version/i);
});

test("K21-EV-001: rejects unknown visibility", () => {
  assert.throws(() => parseCreativeEvent(validEvent({ visibility: "secret" })), /visibility/i);
  assert.throws(() => parseCreativeEvent(validEvent({ visibility: "PUBLIC" })), /visibility/i);
  assert.throws(() => parseCreativeEvent(validEvent({ visibility: null })), /visibility/i);
  assert.throws(() => parseCreativeEvent(validEvent({ visibility: "" })), /visibility/i);
  for (const v of ["private", "collaborators", "public"]) {
    assert.doesNotThrow(() => parseCreativeEvent(validEvent({ visibility: v })), `visibility ${v} should be allowed`);
  }
});

test("K21-EV-001: rejects invalid actorType", () => {
  assert.throws(() => parseCreativeEvent(validEvent({ actorType: "bot" })), /actor_type/i);
  assert.throws(() => parseCreativeEvent(validEvent({ actorType: null })), /actor_type/i);
});

test("K21-EV-001: actorType=user requires a non-empty actorId", () => {
  assert.throws(() => parseCreativeEvent(validEvent({ actorType: "user", actorId: null })), /actor_id/i);
  assert.throws(() => parseCreativeEvent(validEvent({ actorType: "user", actorId: "" })), /actor_id/i);
  assert.doesNotThrow(() => parseCreativeEvent(validEvent({ actorType: "user", actorId: USER_ID })));
});

test("K21-EV-004: rejects empty or missing idempotency key", () => {
  assert.throws(() => parseCreativeEvent(validEvent({ idempotencyKey: "" })), /idempotency/i);
  assert.throws(() => parseCreativeEvent(validEvent({ idempotencyKey: null })), /idempotency/i);
  assert.throws(() => parseCreativeEvent(validEvent({ idempotencyKey: "   " })), /idempotency/i);
});

test("K21-EV-003: sequence must be a positive integer", () => {
  assert.throws(() => parseCreativeEvent(validEvent({ sequence: 0 })), /sequence/i);
  assert.throws(() => parseCreativeEvent(validEvent({ sequence: -1 })), /sequence/i);
  assert.throws(() => parseCreativeEvent(validEvent({ sequence: 1.5 })), /sequence/i);
  assert.throws(() => parseCreativeEvent(validEvent({ sequence: "1" })), /sequence/i);
});

test("K21-EV-001: rejects empty owner / resource", () => {
  assert.throws(() => parseCreativeEvent(validEvent({ ownerId: null })), /owner_id/i);
  assert.throws(() => parseCreativeEvent(validEvent({ ownerId: "" })), /owner_id/i);
  assert.throws(() => parseCreativeEvent(validEvent({ resourceType: "" })), /resource_type/i);
  assert.throws(() => parseCreativeEvent(validEvent({ resourceType: null })), /resource_type/i);
  assert.throws(() => parseCreativeEvent(validEvent({ resourceId: "" })), /resource_id/i);
  assert.throws(() => parseCreativeEvent(validEvent({ resourceId: null })), /resource_id/i);
});

test("K21-EV-001: rejects missing occurredAt / createdAt", () => {
  assert.throws(() => parseCreativeEvent(validEvent({ occurredAt: null })), /occurred_at/i);
  assert.throws(() => parseCreativeEvent(validEvent({ occurredAt: "not-a-date" })), /occurred_at/i);
  assert.throws(() => parseCreativeEvent(validEvent({ createdAt: null })), /created_at/i);
});

test("K21-EV-001: payload defaults to empty object when omitted or null", () => {
  const withoutPayload = { ...validEvent() };
  delete withoutPayload.payload;
  assert.deepEqual(parseCreativeEvent(withoutPayload).payload, {});
  assert.deepEqual(parseCreativeEvent(validEvent({ payload: null })).payload, {});
});

test("K21-EV-005: rejects payload containing sensitive keys (denylist)", () => {
  for (const key of [
    "apiKey",
    "apikey",
    "API_KEY",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",
    "serviceRoleKey",
    "service_role_key",
    "secret",
    "token",
    "password",
    "storagePath",
    "storage_path",
    "privateKey",
    "private_key",
  ]) {
    assert.throws(
      () => parseCreativeEvent(validEvent({ payload: { [key]: "leak" } })),
      /sensitive/i,
      `payload key "${key}" should be rejected`
    );
  }
});

test("K21-EV-005: rejects payload containing full prompt or private path", () => {
  assert.throws(
    () => parseCreativeEvent(validEvent({ payload: { prompt: "Draw a cat in cinematic lighting" } })),
    /sensitive/i
  );
  assert.throws(
    () => parseCreativeEvent(validEvent({ payload: { promptVersion: "v1", fullPrompt: "..." } })),
    /sensitive/i
  );
  assert.throws(
    () => parseCreativeEvent(validEvent({ payload: { path: "/var/data/private/x.json" } })),
    /sensitive/i
  );
});

test("K21-EV-005: rejects sensitive keys nested inside objects or arrays", () => {
  assert.throws(
    () =>
      parseCreativeEvent(
        validEvent({ payload: { meta: { info: { token: "leak" } } } })
      ),
    /sensitive/i
  );
  assert.throws(
    () => parseCreativeEvent(validEvent({ payload: { items: [{ apiKey: "leak" }] } })),
    /sensitive/i
  );
});

test("K21-EV-005: does NOT reject safe payload keys that merely contain sensitive substrings", () => {
  // "tokenizer" contains "token" but is a model field, not a secret.
  assert.doesNotThrow(() =>
    parseCreativeEvent(validEvent({ payload: { tokenizer: "cl100k_base", tokenCount: 42 } }))
  );
  // "pathCount" is a number, not a storage path.
  assert.doesNotThrow(() => parseCreativeEvent(validEvent({ payload: { pathCount: 3 } })));
});

test("K21-EV-005: exposes the denylist for audit tooling", () => {
  assert.ok(Array.isArray(SENSITIVE_PAYLOAD_KEYS));
  assert.ok(SENSITIVE_PAYLOAD_KEYS.length >= 8);
  for (const key of ["apiKey", "token", "secret", "storagePath", "prompt"]) {
    assert.ok(
      SENSITIVE_PAYLOAD_KEYS.some((k) => k.toLowerCase() === key.toLowerCase()),
      `denylist should contain ${key}`
    );
  }
});

test("K21-EV-001: freezes the returned event object", () => {
  const event = parseCreativeEvent(validEvent());
  assert.equal(Object.isFrozen(event), true);
});

test("CreativeEventError carries a stable code", () => {
  try {
    parseCreativeEvent(validEvent({ visibility: "bogus" }));
    assert.fail("expected throw");
  } catch (err) {
    assert.ok(err instanceof CreativeEventError);
    assert.equal(err.code, "invalid_creative_event");
    assert.match(err.message, /visibility/i);
  }
});

test("K21-EV-001: accepts the three visibility tiers and resource_version", () => {
  for (const v of ["private", "collaborators", "public"]) {
    const event = parseCreativeEvent(validEvent({ visibility: v }));
    assert.equal(event.visibility, v);
  }
  const withVersion = parseCreativeEvent(validEvent({ resourceVersion: "v3" }));
  assert.equal(withVersion.resourceVersion, "v3");
});

test("K21-EV-001: actorId is nullable when actorType=system", () => {
  const event = parseCreativeEvent(validEvent({ actorType: "system", actorId: null }));
  assert.equal(event.actorId, null);
});

test("K21-EV-004: idempotency key is trimmed before validation", () => {
  const event = parseCreativeEvent(validEvent({ idempotencyKey: "  task-1:progress:7  " }));
  assert.equal(event.idempotencyKey, "task-1:progress:7");
});
