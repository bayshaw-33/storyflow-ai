import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page = readFileSync("app/song-workbench/page.tsx", "utf8");
const listRoute = readFileSync("app/api/audio/jobs/route.ts", "utf8");
const jobRoute = readFileSync("app/api/audio/jobs/[jobId]/route.ts", "utf8");
const component = readFileSync("components/song-workbench/AudioCandidates.tsx", "utf8");

test("song workbench loads audio history only for the active project", () => {
  assert.match(page, /\/api\/audio\/jobs\?projectId=/);
  assert.match(page, /if \(!session\?\.access_token \|\| !songProjectId\)[\s\S]{0,220}setAudioCandidates\(\[\]\)/);
  assert.match(listRoute, /projectId.*project_id=eq\./s);
});

test("audio job deletion is owner- and project-scoped and removes stored artifacts", () => {
  assert.match(jobRoute, /export async function DELETE/);
  assert.match(jobRoute, /owner_id=eq\./);
  assert.match(jobRoute, /project_id=eq\./);
  assert.match(jobRoute, /storage\.from\(AUDIO_BUCKET\)\.remove/);
  assert.match(jobRoute, /storyflow_assets/);
  assert.match(jobRoute, /method: "DELETE"/);
});

test("generation history exposes an accessible delete action", () => {
  assert.match(component, /onDelete/);
  assert.match(component, /Trash2/);
  assert.match(component, /删除|Delete/);
});
