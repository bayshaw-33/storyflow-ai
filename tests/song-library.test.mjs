import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("song library page exists and exposes song-only audio actions", () => {
  assert.ok(existsSync("app/song-library/page.tsx"));
  assert.ok(existsSync("components/song-workbench/SongLibraryClient.tsx"));
  const source = readFileSync("components/song-workbench/SongLibraryClient.tsx", "utf8");
  assert.match(source, /fetchProjectLibrary/);
  assert.match(source, /\/api\/audio\/jobs/);
  assert.match(source, /workflowType.*song|workflowType === "song"/);
  assert.match(source, /<audio/);
  assert.match(source, /\/api\/audio\/jobs\/\$\{encodeURIComponent\(.*jobId/);
  assert.match(source, /song-workbench\?projectId=/);
});
