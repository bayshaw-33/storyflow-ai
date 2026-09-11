import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

const archivePage = readFileSync("app/archive/page.tsx", "utf8");
const songPage = readFileSync("app/song-workbench/page.tsx", "utf8");
const audioCandidates = readFileSync("components/song-workbench/AudioCandidates.tsx", "utf8");
const audioDownloadRoutePath = "app/api/audio/jobs/[jobId]/download/route.ts";

test("archive page loads export archives through the GET list endpoint", () => {
  assert.match(archivePage, /"\/api\/export-archives"/);
  assert.match(archivePage, /`\/api\/export-archives\?\$\{params\.toString\(\)\}`/);
  assert.doesNotMatch(archivePage, /fetch\(`\/api\/exports\?/);
});

test("song audio download uses an authenticated same-origin handler instead of a cross-origin download link", () => {
  assert.match(songPage, /\/api\/audio\/jobs\/\$\{encodeURIComponent\(candidate\.jobId\)\}\/download/);
  assert.match(songPage, /Authorization:\s*`Bearer \$\{session\.access_token\}`/);
  assert.match(songPage, /payload\.downloadUrl/);
  assert.match(audioCandidates, /onDownload/);
  assert.doesNotMatch(audioCandidates, /href=\{candidate\.resultUrl\}\s+download/);
  assert.match(songPage, /fetch\("\/api\/audio\/jobs"/);
  assert.match(songPage, /setAudioCandidates\(\(current\) => current\.length \? current : payload\.jobs/);
  assert.match(songPage, /URL\.createObjectURL/);
  assert.match(songPage, /link\.download\s*=/);
});

test("audio jobs list endpoint returns the signed history for the authenticated owner", () => {
  const jobsRoute = readFileSync("app/api/audio/jobs/route.ts", "utf8");
  assert.match(jobsRoute, /export async function GET/);
  assert.match(jobsRoute, /owner_id=eq\.\$\{encodeURIComponent\(user\.id\)\}/);
  assert.match(jobsRoute, /createSignedUrl/);
  assert.match(jobsRoute, /history|jobs/);
});

test("audio download route is owner-scoped and creates a fresh forced-download URL", () => {
  assert.equal(existsSync(audioDownloadRoutePath), true, "missing authenticated audio download route");
  const route = readFileSync(audioDownloadRoutePath, "utf8");
  assert.match(route, /authenticateRequest\(request\)/);
  assert.match(route, /owner_id=eq\.\$\{encodeURIComponent\(user\.id\)\}/);
  assert.match(route, /storage_path/);
  assert.match(route, /AUDIO_BUCKET/);
  assert.match(route, /createSignedUrl/);
  assert.match(route, /\{\s*download:\s*filename\s*\}/);
  assert.match(route, /downloadUrl:\s*data\.signedUrl/);
});
