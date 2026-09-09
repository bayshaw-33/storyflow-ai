import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => existsSync(path) ? readFileSync(path, "utf8") : "";
const submit = read("app/api/audio/jobs/route.ts");
const batch = read("app/api/audio/jobs/batch/route.ts");

test("song audio jobs validate the Atlas Cloud music model allowlist", () => {
  assert.match(submit, /isAtlasCloudMusicModel/);
  assert.match(submit, /atlascloud/);
  assert.match(batch, /model/);
  assert.match(batch, /provider/);
});

test("batch child requests keep the selected model", () => {
  assert.match(batch, /model:\s*body\.model/);
});

test("music mode is validated and forwarded", () => {
  assert.match(submit, /musicMode/);
  assert.match(batch, /musicMode:\s*body\.musicMode/);
});
