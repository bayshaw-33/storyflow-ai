# Atlas Cloud Music Model Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-owned Atlas Cloud music provider and a song-workbench selector for MiniMax Music 3.0 or Suno V5, with vocal-song, instrumental, and experimental sound-effect generation modes.

**Architecture:** Keep the existing audio job, polling, storage, A/B candidate, and persistent-player pipeline. Add an Atlas Cloud adapter behind the existing `AudioProvider` interface, a fixed server-side music-model catalog, and pass the selected model through the batch and retry APIs. The song UI consumes only the catalog's music entries and never renders TTS/ASR capabilities.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Node's built-in test runner, Playwright, Supabase-backed audio jobs and storage.

## Global Constraints

- Support only `minimax/music-3.0` and `suno/chirp-v5` in the song model selector.
- Support generation modes `vocal`, `instrumental`, and `sfx`; label `sfx` as experimental because the selected models are not dedicated sound-effect models.
- Do not expose TTS, voice-clone, or ASR models in the song workbench.
- Use `POST https://api.atlascloud.ai/api/v1/model/generateAudio` and the provider prediction polling endpoint.
- Keep API keys server-side; use `ATLASCLOUD_API_KEY` and never return authorization headers or raw secrets.
- Switching models must not clear lyrics, style prompt, existing candidates, history, or player state.
- A retry must use the original candidate's provider/model/music mode, not the currently selected values.
- Preserve the existing song-workbench layout; the selector must wrap cleanly at 390px without horizontal overflow.
- Execute implementation from a fresh local worktree based on the current `origin/main`; do not edit the NAS copy or overwrite the dirty canonical checkout.

---

### Task 1: Define the fixed Atlas Cloud music catalog and capability contract

**Files:**
- Create: `lib/audio/music-models.ts`
- Modify: `lib/audio/types.ts`
- Modify: `lib/audio/provider.ts`
- Modify: `app/api/audio/capabilities/route.ts`
- Test: `tests/atlascloud-music-models.test.mjs`
- Test: `tests/audio-provider-contract.test.mjs`
- Test: `tests/audio-route-contract.test.mjs`

**Interfaces:**
- Produces `ATLAS_CLOUD_MUSIC_MODELS`, `getAtlasCloudMusicModels()`, `isAtlasCloudMusicModel(value)`, and `getDefaultAtlasCloudMusicModel()` from `lib/audio/music-models.ts`.
- Extends `AudioProviderName` with `"atlascloud"`.
- Adds a safe capability shape containing `id`, `label`, `kind: "music"`, `provider: "atlascloud"`, and `available`; no secret fields.
- `GET /api/audio/capabilities` returns `musicModels` containing exactly the two allowed options and keeps existing provider capability data for other workbenches.

- [ ] **Step 1: Write the failing catalog tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync("lib/audio/music-models.ts", "utf8");

test("Atlas Cloud song catalog contains only MiniMax Music 3.0 and Suno V5", () => {
  assert.match(source, /minimax\/music-3\.0/);
  assert.match(source, /suno\/chirp-v5/);
  assert.doesNotMatch(source, /minimax\/music-2\.6/);
  assert.doesNotMatch(source, /speech|tts|asr/i);
});

test("song capabilities expose music-only model metadata", () => {
  assert.match(source, /kind: [\"']music[\"']/);
  assert.match(source, /provider: [\"']atlascloud[\"']/);
  assert.match(source, /getDefaultAtlasCloudMusicModel/);
});
```

- [ ] **Step 2: Run the catalog test and verify the expected failure**

Run: `node --test tests/atlascloud-music-models.test.mjs`

Expected: FAIL because `lib/audio/music-models.ts` does not exist yet.

- [ ] **Step 3: Write the minimal catalog and type changes**

Create a literal catalog with these two entries and no other model IDs:

```ts
export type AtlasCloudMusicModelId = "minimax/music-3.0" | "suno/chirp-v5";

export type AtlasCloudMusicModel = {
  id: AtlasCloudMusicModelId;
  provider: "atlascloud";
  kind: "music";
  labelZh: string;
  labelEn: string;
  descriptionZh: string;
  descriptionEn: string;
};

export const ATLAS_CLOUD_MUSIC_MODELS: readonly AtlasCloudMusicModel[] = [
  {
    id: "minimax/music-3.0",
    provider: "atlascloud",
    kind: "music",
    labelZh: "MiniMax Music 3.0",
    labelEn: "MiniMax Music 3.0",
    descriptionZh: "歌词、曲风提示词或纯音乐均可生成",
    descriptionEn: "Lyrics, style prompts, or instrumental music",
  },
  {
    id: "suno/chirp-v5",
    provider: "atlascloud",
    kind: "music",
    labelZh: "Suno V5",
    labelEn: "Suno V5",
    descriptionZh: "使用当前歌词和曲风提示词生成歌曲",
    descriptionEn: "Generate a song from the current lyrics and style prompt",
  },
];

export function getAtlasCloudMusicModels() {
  return ATLAS_CLOUD_MUSIC_MODELS;
}

export function isAtlasCloudMusicModel(value: unknown): value is AtlasCloudMusicModelId {
  return ATLAS_CLOUD_MUSIC_MODELS.some((model) => model.id === value);
}

export function getDefaultAtlasCloudMusicModel(): AtlasCloudMusicModelId {
  return "minimax/music-3.0";
}
```

Add `"atlascloud"` to `AudioProviderName`, add the catalog to the capability response, and mark both entries `available` only when `ATLASCLOUD_API_KEY` is configured.

- [ ] **Step 4: Run the catalog and contract tests to verify they pass**

Run: `node --test tests/atlascloud-music-models.test.mjs tests/audio-provider-contract.test.mjs tests/audio-route-contract.test.mjs`

Expected: PASS for the new catalog, provider union, and music-only capability response.

- [ ] **Step 5: Commit the catalog contract**

```bash
git add lib/audio/music-models.ts lib/audio/types.ts lib/audio/provider.ts app/api/audio/capabilities/route.ts tests/atlascloud-music-models.test.mjs tests/audio-provider-contract.test.mjs tests/audio-route-contract.test.mjs
git commit -m "feat(audio): define Atlas Cloud music model catalog"
```

### Task 2: Implement the Atlas Cloud music adapter

**Files:**
- Create: `lib/audio/providers/atlascloud.ts`
- Modify: `lib/audio/provider.ts`
- Modify: `.env.example`
- Test: `tests/atlascloud-music-provider.test.mjs`

**Interfaces:**
- `createAtlasCloudAudioProvider(): AudioProvider` reads `ATLASCLOUD_API_KEY` and optional `ATLASCLOUD_API_BASE_URL`.
- `submitMusic(input)` accepts only the two catalog model IDs plus `musicMode: "vocal" | "instrumental" | "sfx"` and returns `{ kind: "async_submitted", providerTaskId }` from `data.id`.
- `poll(providerTaskId, "music")` calls `/api/v1/model/prediction/{providerTaskId}` and maps queued/running/success/error states to `AudioPollResult`.
- `download(audioUrl)` reuses the existing authenticated audio downloader.

- [ ] **Step 1: Write failing request-shape and poll tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync("lib/audio/providers/atlascloud.ts", "utf8");

test("Atlas adapter uses the unified Atlas Cloud audio endpoint and both model IDs", () => {
  assert.match(source, /api\.atlascloud\.ai\/api\/v1\/model\/generateAudio/);
  assert.match(source, /minimax\/music-3\.0/);
  assert.match(source, /suno\/chirp-v5/);
  assert.match(source, /lyrics_optimizer/);
  assert.match(source, /is_instrumental/);
});

test("Atlas adapter polls prediction IDs and does not implement TTS", () => {
  assert.match(source, /model\/prediction/);
  assert.match(source, /providerTaskId/);
  assert.doesNotMatch(source, /submitTTS|speech|text-to-speech/i);
});
```

- [ ] **Step 2: Run the adapter test and verify the expected failure**

Run: `node --test tests/atlascloud-music-provider.test.mjs`

Expected: FAIL because the adapter file does not exist yet.

- [ ] **Step 3: Implement model-specific request mapping**

For `minimax/music-3.0`, send top-level fields such as `model`, `prompt`, optional `lyrics`, `lyrics_optimizer: false`, `is_instrumental: input.musicMode !== "vocal"`, `format: "mp3"`, `sample_rate: 44100`, and `bitrate: 256000`. For `suno/chirp-v5`, send `model`, `prompt`, `custom: input.musicMode === "vocal" && Boolean(input.lyrics)`, `instrumental: input.musicMode !== "vocal"`, and `vocal_gender: "Female"` only when the existing song input provides a compatible value. Do not send lyrics in instrumental or sfx mode, and do not send MiniMax-only fields to Suno.

For `musicMode === "sfx"`, the adapter receives a prompt assembled by the server-side song AI and keeps the mode in provider metadata. The adapter must not claim that either provider is a dedicated sound-effect generator.

Use `requestJson` for authenticated calls. Extract the prediction ID from `data.id`; extract a completed output URL from `data.outputs`, `data.urls.get`, or the corresponding nested prediction response. Return safe `AudioPollResult` errors when the provider reports failure or no output.

- [ ] **Step 4: Register the provider and document configuration**

Add the `atlascloud` branch in `resolveAudioProvider`. Do not change the existing MiniMax direct provider used by voice/video paths. Add only redacted variable names and example placeholders to `.env.example`:

```text
ATLASCLOUD_API_KEY=your-atlascloud-api-key
ATLASCLOUD_API_BASE_URL=https://api.atlascloud.ai
```

- [ ] **Step 5: Run adapter and existing audio tests**

Run: `node --test tests/atlascloud-music-provider.test.mjs tests/audio-provider-adapters.test.mjs tests/audio-provider-contract.test.mjs`

Expected: PASS with no TTS code added to the Atlas music adapter and no regressions in existing providers.

- [ ] **Step 6: Commit the adapter**

```bash
git add lib/audio/providers/atlascloud.ts lib/audio/provider.ts .env.example tests/atlascloud-music-provider.test.mjs
git commit -m "feat(audio): add Atlas Cloud music provider"
```

### Task 3: Pass and validate the selected model through audio jobs

**Files:**
- Modify: `app/api/audio/jobs/route.ts`
- Modify: `app/api/audio/jobs/batch/route.ts`
- Modify: `lib/audio/jobs.ts`
- Test: `tests/atlascloud-audio-route.test.mjs`
- Test: `tests/audio-route-contract.test.mjs`

**Interfaces:**
- Batch request accepts `provider: "atlascloud"` and `model: AtlasCloudMusicModelId` at the batch level.
- Each child job receives the same selected model and `musicMode`, persists the model in `storyflow_generation_jobs.model`, and persists the mode inside `input_params.musicMode`.
- Single-job route rejects a music request whose provider/model pair is not `atlascloud` plus one of the two allowed IDs.
- Retry requests can preserve the candidate's stored model and provider.

- [ ] **Step 1: Write failing route contract tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const submit = readFileSync("app/api/audio/jobs/route.ts", "utf8");
const batch = readFileSync("app/api/audio/jobs/batch/route.ts", "utf8");

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
```

- [ ] **Step 2: Run the route test and verify the expected failure**

Run: `node --test tests/atlascloud-audio-route.test.mjs`

Expected: FAIL because the current route does not validate or forward the selected Atlas model.

- [ ] **Step 3: Implement server-side validation and propagation**

In the single-job route, for `kind === "music"`, require `providerName === "atlascloud"` and validate `model` with `isAtlasCloudMusicModel`; if absent, assign `getDefaultAtlasCloudMusicModel()`. Validate `musicMode` as `vocal`, `instrumental`, or `sfx`, defaulting to `vocal`. Return `422` with `INVALID_MUSIC_MODEL` for any other model, including TTS/ASR IDs, and `422` with `INVALID_MUSIC_MODE` for any other mode. Keep the existing idempotency hash, which already includes provider and model, and add the mode to the idempotency input so the same prompt in vocal/instrumental/sfx mode cannot reuse the wrong task. Ensure the saved `model` is the full ID and `input_params.musicMode` is persisted.

In the batch route, add `provider`, `model`, and `musicMode` to the request type, validate them once, and pass all three into each child `NextRequest`. Keep A/B request keys distinct. Do not alter result ingestion or status handling.

- [ ] **Step 4: Run route and audio regression tests**

Run: `node --test tests/atlascloud-audio-route.test.mjs tests/audio-route-contract.test.mjs tests/audio-jobs.test.mjs tests/audio-batch-reconciliation.test.mjs`

Expected: PASS; unsupported model IDs are rejected before provider submission, and A/B jobs persist the selected model independently.

- [ ] **Step 5: Commit the route contract**

```bash
git add app/api/audio/jobs/route.ts app/api/audio/jobs/batch/route.ts lib/audio/jobs.ts tests/atlascloud-audio-route.test.mjs tests/audio-route-contract.test.mjs
git commit -m "feat(audio): validate selected Atlas Cloud music model"
```

### Task 4: Add the model selector without disturbing the workbench layout

**Files:**
- Modify: `components/song-workbench/AudioCandidates.tsx`
- Modify: `app/song-workbench/page.tsx`
- Modify: `app/globals.css`
- Test: `tests/song-audio-model-selection.test.mjs`
- Modify: `e2e/song-workbench-p0s03.spec.ts`

**Interfaces:**
- `AudioCandidates` receives `musicModels`, `selectedMusicModel`, `onMusicModelChange`, `musicMode`, `onMusicModeChange`, and `modelSelectionDisabled` props.
- `page.tsx` stores the selected model and generation mode independently from lyrics/style/candidates and includes them in batch and retry requests.
- Candidate retry uses `candidate.provider`, `candidate.model`, and the candidate's stored `musicMode` when present; it never silently adopts the currently selected values.

- [ ] **Step 1: Write failing UI contract tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page = readFileSync("app/song-workbench/page.tsx", "utf8");
const audio = readFileSync("components/song-workbench/AudioCandidates.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

test("song workbench renders a music-only model selector", () => {
  assert.match(audio, /selectedMusicModel/);
  assert.match(audio, /onMusicModelChange/);
  assert.match(audio, /音乐模型|Music model/);
  assert.doesNotMatch(audio, /TTS|ASR/);
});

test("selected model is included in batch and retry requests", () => {
  assert.match(page, /model:\s*selectedMusicModel/);
  assert.match(page, /candidate\.model/);
  assert.match(page, /provider:\s*["']atlascloud["']/);
});

test("generation type changes the AI/audio request mode", () => {
  assert.match(page, /musicMode/);
  assert.match(audio, /纯音乐|Instrumental/);
  assert.match(audio, /音效|Sound effect/);
  assert.match(audio, /实验/);
});

test("selector layout wraps instead of overflowing on narrow screens", () => {
  assert.match(css, /song-audio-model-selector/);
  assert.match(css, /flex-wrap:\s*wrap/);
});
```

- [ ] **Step 2: Run the UI contract test and verify the expected failure**

Run: `node --test tests/song-audio-model-selection.test.mjs`

Expected: FAIL because the selector props and request fields do not exist yet.

- [ ] **Step 3: Add model state and capability loading to the page**

Initialize the selection to `minimax/music-3.0` and the generation mode to `vocal`, load `/api/audio/capabilities` after an authenticated session is available, replace the options with the returned `musicModels`, and preserve both values in page-scoped local-storage keys. If the saved ID is not one of the returned options, use the first available allowed option. Do not clear `lyrics`, `stylePrompt`, `audioCandidates`, or the selected player candidate when either value changes.

Pass the selected model, `provider: "atlascloud"`, and `musicMode` into `/api/audio/jobs/batch`. For retry, use `candidate.model || selectedMusicModel`, `candidate.provider || "atlascloud"`, and the candidate's persisted mode (falling back to the current mode only for pre-feature candidates) so historical candidates remain traceable.

- [ ] **Step 4: Add the selector to the existing audio-candidate header**

Render a labeled native `<select>` immediately before the existing “生成 2 首” button and a three-option segmented control for `人声歌曲`, `纯音乐`, and `音效（实验）`. Each model option shows the readable label and a disabled state when `available` is false. The instrumental and sfx options show a compact note that lyrics remain saved but are not used for this generation; the sfx option also states that the selected models are not dedicated SFX models. During submission, disable the model/mode controls and generation action; after completion or failure, restore them. Existing candidate rows continue to show their persisted provider/model/music mode metadata.

- [ ] **Step 5: Add responsive styles and accessible states**

Add `.song-audio-model-selector` and `.song-audio-mode-switch` styles that use a flex row with `flex-wrap: wrap`, a minimum 44px control height, clear focus state, selected/disabled states, and a narrow-screen rule that lets the select, mode switch, and generate button occupy separate rows. Keep the controls inside the current card header so the vertical song-workbench composition and player remain unchanged. Verify there is no horizontal overflow at 390px.

- [ ] **Step 6: Run UI contract and existing song tests**

Run: `node --test tests/song-audio-model-selection.test.mjs tests/song-audio-layout.test.mjs tests/song-audio-player.test.mjs tests/song-generation-latest-input.test.mjs`

Expected: PASS; model changes preserve the current creative content and player/candidate contracts.

- [ ] **Step 7: Run targeted Playwright layout checks**

Run: `pnpm exec playwright test e2e/song-workbench-p0s03.spec.ts --project=chromium`

Expected: PASS at the existing desktop fixture widths. Add a focused 390px viewport assertion that the model selector and generate button are visible, not overlapped, and the page has no horizontal overflow.

- [ ] **Step 8: Commit the UI**

```bash
git add components/song-workbench/AudioCandidates.tsx app/song-workbench/page.tsx app/globals.css tests/song-audio-model-selection.test.mjs e2e/song-workbench-p0s03.spec.ts
git commit -m "feat(song): add Atlas music model selector"
```

### Task 5: Full verification and real Atlas Cloud generation

**Files:**
- Modify only if verification finds a scoped defect: the files from Tasks 1–4
- Evidence: `reports/2026-09-09-atlas-cloud-music-model-switch-verification.md`

**Interfaces:**
- No new product interface; this task proves the complete path from selector to stored playable audio.

- [ ] **Step 1: Run all focused automated tests**

Run: `pnpm test:unit`

Expected: existing unit suite passes with the new Atlas catalog, adapter, route, and UI contracts included.

- [ ] **Step 2: Run type-check and production build**

Run: `pnpm exec tsc --noEmit`

Expected: exit 0 with no TypeScript errors.

Run: `pnpm build`

Expected: exit 0 and a production build containing `/song-workbench`, `/api/audio/capabilities`, `/api/audio/jobs`, and `/api/audio/jobs/batch`.

- [ ] **Step 3: Run the full song/audio browser evidence**

Run: `pnpm exec playwright test e2e/song-workbench-p0s03.spec.ts e2e/v22-song-history.spec.ts e2e/v22-audiovisual-chain.spec.ts --project=chromium`

Expected: no layout regressions, no horizontal overflow at the tested mobile width, and no fake completed audio state.

- [ ] **Step 4: Run the real MiniMax Music 3.0 generation**

With the server-side `ATLASCLOUD_API_KEY` configured, submit one song using `minimax/music-3.0`. Verify the actual response is accepted, the prediction is polled to completion, the audio bytes are stored in Supabase, the candidate shows `atlascloud · minimax/music-3.0`, and the player can play and download it. Record only status, model, job ID suffix, duration, and storage result; redact the key and authorization header.

- [ ] **Step 5: Run the real Suno V5 generation**

Submit the same or a fresh song using `suno/chirp-v5`. Verify the request uses the Suno mapping, the job is stored with `atlascloud · suno/chirp-v5`, the result is playable/downloadable, and switching from MiniMax to Suno did not clear lyrics, prompt, or the existing MiniMax candidate.

- [ ] **Step 6: Verify the TTS exclusion**

Confirm the selector payload contains exactly the two music IDs and that a direct song job request containing a speech/TTS model returns `422` with `INVALID_MUSIC_MODEL` before any provider submission.

- [ ] **Step 7: Write the verification evidence and report known failures separately**

Create the evidence report with sections for focused unit tests, type-check, build, browser verification, MiniMax real API result, Suno real API result, production state, and known non-blocking failures. Do not claim successful generation unless the provider response and stored playable artifact are both observed.

- [ ] **Step 8: Commit only scoped verification fixes and evidence**

```bash
git add reports/2026-09-09-atlas-cloud-music-model-switch-verification.md
git commit -m "test(song): verify Atlas Cloud music generation"
```

## Completion Checklist

- [ ] Only MiniMax Music 3.0 and Suno V5 appear in the song selector.
- [ ] TTS/ASR models are absent from song UI and rejected by song music routes.
- [ ] Model-specific Atlas Cloud request mapping and vocal/instrumental/sfx mode mapping are covered by tests.
- [ ] A/B candidates and retries preserve the actual provider/model used.
- [ ] Desktop, laptop, and 390px layouts remain readable and overflow-free.
- [ ] Both real music generation paths are verified through playable stored output for the selected mode; sound-effect mode is reported as experimental.
- [ ] Existing dirty canonical-checkout files remain untouched.
