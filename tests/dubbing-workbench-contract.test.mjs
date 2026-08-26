import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

const page = existsSync("app/dubbing-workbench/page.tsx") ? readFileSync("app/dubbing-workbench/page.tsx", "utf8") : "";
const route = existsSync("app/api/voice-lines/batch/route.ts") ? readFileSync("app/api/voice-lines/batch/route.ts", "utf8") : "";

test("dubbing workbench supports batch line input and generation", () => {
  assert.match(page, /批量生成|Batch generate/);
  assert.match(page, /voice-lines\/batch/);
  assert.match(page, /<audio/);
});

test("batch voice route creates lines under an owned Universe character", () => {
  assert.match(route, /getUniverseOwnership/);
  assert.match(route, /createVoiceLine/);
  assert.match(route, /lines/);
});
