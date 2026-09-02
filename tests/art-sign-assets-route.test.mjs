import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("art signing route authenticates and only signs paths owned by the current user", async () => {
  const route = await readFile(new URL("../app/api/art/sign-assets/route.ts", import.meta.url), "utf8");
  assert.match(route, /authenticateRequest\(request\)/);
  assert.match(route, /assertArtStoragePathBelongsToUser/);
  assert.match(route, /signStoredArtImage/);
  assert.match(route, /paths\.slice\(0, 100\)/);
});

test("art asset detail resolves the same user-project-work scope as the embedded workbench", async () => {
  const detail = await readFile(new URL("../components/art/ArtAssetDetail.tsx", import.meta.url), "utf8");
  assert.match(detail, /searchParams\.get\("workId"\)/);
  assert.match(detail, /resolveArtDraftKey\(\{ userId: session\?\.user\.id, projectId: ctxProjectId, workId: ctxWorkId \}\)/);
  assert.match(detail, /\/api\/art\/sign-assets/);
});

test("all authenticated art-detail requests use the shared token-refreshing fetch", async () => {
  const detail = await readFile(new URL("../components/art/ArtAssetDetail.tsx", import.meta.url), "utf8");
  for (const endpoint of ["/api/art/upload-reference", "/api/art/generate-image", "/api/actors"]) {
    assert.match(detail, new RegExp(`fetchWithAuthRetry\\(\\"${endpoint.replaceAll("/", "\\/")}`));
  }
  assert.doesNotMatch(detail, /await fetch\(\s*[`"]\/api\/(?:art|actors)/, "captured access tokens become stale after idle sessions");
});

test("image generation route allows the provider polling window to finish on Vercel", async () => {
  const route = await readFile(new URL("../app/api/art/generate-image/route.ts", import.meta.url), "utf8");
  assert.match(route, /export const maxDuration = 300/);
});

test("standalone asset detail returns to the standalone art repository", async () => {
  const detail = await readFile(new URL("../components/art/ArtAssetDetail.tsx", import.meta.url), "utf8");
  assert.match(detail, /`\/art-workbench\$\{ctxSetup \? "\?setup=1" : ""\}`/);
});
