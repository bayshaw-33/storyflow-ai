import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("song toolkit contains prompt guardrails and health checks", () => {
  assert.ok(existsSync("app/song-toolkit/page.tsx"));
  assert.ok(existsSync("components/song-workbench/SongToolkit.tsx"));
  const source = readFileSync("components/song-workbench/SongToolkit.tsx", "utf8");
  assert.match(source, /validateV6StylePrompt/);
  assert.match(source, /fitV6StylePrompt/);
  assert.match(source, /V6_STYLE_MAX_BYTES/);
  assert.match(source, /1000/);
  assert.match(source, /no vocals|无人声|禁止人声/i);
  assert.match(source, /\/api\/audio\/capabilities/);
  assert.match(source, /\/api\/audio\/jobs/);
  assert.match(source, /song-workbench/);
});
