import assert from "node:assert/strict";
import test from "node:test";

import { getCleanupCandidateLabel, getCleanupCandidateSummary } from "../../../lib/client/v2/project-library/lifecycle.ts";

test("empty project preflight is labelled for permanent deletion", () => {
  assert.equal(getCleanupCandidateLabel({ decision: "safe_to_delete", relatedCounts: {} }), "可永久删除");
  assert.match(getCleanupCandidateSummary({ decision: "safe_to_delete", relatedCounts: {} }), /未发现创作内容/);
});

test("linked project preflight is labelled for archive", () => {
  assert.equal(getCleanupCandidateLabel({ decision: "archive_only", relatedCounts: { works: 1 } }), "建议归档");
  assert.match(getCleanupCandidateSummary({ decision: "archive_only", relatedCounts: { works: 1 } }), /1 项关联/);
});

test("unknown project preflight is unavailable for cleanup", () => {
  assert.equal(getCleanupCandidateLabel({ decision: "not_found", relatedCounts: {} }), "不可清理");
});
