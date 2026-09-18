import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => existsSync(path) ? readFileSync(path, "utf8") : "";
const page = read("app/song-workbench/page.tsx");
const audio = read("components/song-workbench/AudioCandidates.tsx");
const listRoute = read("app/api/audio/jobs/route.ts");
const jobRoute = read("app/api/audio/jobs/[jobId]/route.ts");
const coverRoute = read("app/api/audio/jobs/[jobId]/cover/route.ts");

test("vocal direction offers male, female, and unrestricted choices only for vocal mode", () => {
  assert.match(page + audio, /voiceGender/);
  assert.match(audio, /男声|Male/);
  assert.match(audio, /女声|Female/);
  assert.match(audio, /不限|Unrestricted/);
  assert.match(audio, /musicMode\s*===\s*["']vocal["']/);
});

test("vocal direction is passed to AI generation and audio submission", () => {
  assert.match(page, /voiceGender/);
  assert.match(page, /voiceGender.*(?:buildSongGenerationInput|buildSongRevisionInput|inputParams)/s);
  assert.match(page, /inputParams: \{[^}]*voiceGender/s);
});

test("music candidates expose persisted cover metadata and cover actions", () => {
  assert.match(audio, /coverUrl/);
  assert.match(audio, /生成封面|Generate cover/);
  assert.match(audio, /下载封面|Download cover/);
  assert.match(page, /api\/audio\/jobs\/.*cover/);
});

test("cover generation is Flux 2 Max, square, persisted, and scoped", () => {
  assert.match(coverRoute, /export async function POST/);
  assert.match(coverRoute, /export async function GET/);
  assert.match(coverRoute, /flux-2-max/);
  assert.match(coverRoute, /aspectRatio:\s*["']1:1["']/);
  assert.match(coverRoute, /owner_id=eq\./);
  assert.match(coverRoute, /project_id=eq\./);
  assert.match(coverRoute, /result_metadata/);
  assert.match(coverRoute, /persistRemoteArtImage/);
  assert.match(listRoute, /coverUrl/);
});

test("history deletion cleans up a persisted cover", () => {
  assert.match(jobRoute, /coverStoragePath/);
  assert.match(jobRoute, /ART_BUCKET/);
});
