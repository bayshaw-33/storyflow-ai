import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const room = readFileSync(new URL("../../../components/v2/screenplay-studio/KkScreenplayRoom.tsx", import.meta.url), "utf8");
const studio = readFileSync(new URL("../../../components/v2/screenplay-studio/ScreenplayStudio.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../../../lib/client/v2/screenplay-studio/api.ts", import.meta.url), "utf8");

test("KK conversation exposes the next trilogy generation action", () => {
  assert.match(room, /trilogyState/);
  assert.match(room, /generateNextTrilogyStage/);
  assert.match(room, /data-testid="generate-trilogy-stage"/);
  assert.match(room, /onOpenTrilogyUnit/);
});

test("the parent derives trilogy progress from saved units and opens generated drafts", () => {
  assert.match(studio, /resolveTrilogyState\(units\)/);
  assert.match(studio, /onOpenTrilogyUnit/);
  assert.match(studio, /setMainView\("document"\)/);
  assert.match(studio, /await refreshUnits\(\)/);
});

test("the client API generates trilogy stages without calling manual unit creation", () => {
  assert.match(api, /generateNextTrilogyStage/);
  assert.match(api, /screenplay\/trilogy/);
});
