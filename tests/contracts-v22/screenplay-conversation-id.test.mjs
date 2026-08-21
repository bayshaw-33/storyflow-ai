import assert from "node:assert/strict";
import test from "node:test";

import { normalizeScreenplayConversationId } from "../../lib/server/v2/screenplays/conversation-id.ts";

const WORK = "aad40704-c277-439e-b744-af74473df210";
const OTHER = "b3533fd2-0a32-48f4-a766-d17d6796d3d4";

test("uses the Work UUID as the stable default conversation identity", () => {
  assert.equal(normalizeScreenplayConversationId(WORK, WORK), WORK);
  assert.equal(normalizeScreenplayConversationId(WORK, ""), WORK);
  assert.equal(normalizeScreenplayConversationId(WORK, null), WORK);
});

test("normalizes the production legacy kk-prefixed identity", () => {
  assert.equal(normalizeScreenplayConversationId(WORK, `kk-${WORK}`), WORK);
});

test("accepts another explicit UUID but rejects malformed identities", () => {
  assert.equal(normalizeScreenplayConversationId(WORK, OTHER), OTHER);
  assert.equal(normalizeScreenplayConversationId(WORK, "not-a-uuid"), null);
  assert.equal(normalizeScreenplayConversationId("not-a-work-uuid", WORK), null);
});
