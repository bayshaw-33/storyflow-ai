import assert from "node:assert/strict";
import test from "node:test";

import { normalizeArtActions } from "../lib/art/actions.ts";

test("allows safe asset creation actions", () => {
  const actions = normalizeArtActions([{ type: "create_asset", kind: "character", name: "Celeste", narrativeRole: "女反派", description: "冷静而危险" }]);
  assert.equal(actions[0].type, "create_asset");
});

test("turns destructive actions into confirmation requests", () => {
  const actions = normalizeArtActions([{ type: "delete_asset", assetId: "asset-1" }]);
  assert.equal(actions[0].type, "request_confirmation");
});

test("drops unknown action types", () => {
  assert.deepEqual(normalizeArtActions([{ type: "run_shell", command: "rm" }]), []);
});
