import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("the production source passes the TypeScript gate used by Vercel", () => {
  const result = spawnSync(
    process.execPath,
    ["node_modules/typescript/bin/tsc", "--noEmit", "--pretty", "false"],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stdout || result.stderr);
});
