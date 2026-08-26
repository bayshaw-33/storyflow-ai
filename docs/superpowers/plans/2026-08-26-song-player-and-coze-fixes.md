# Song Workbench Player and Coze Acceptance Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a reliable two-track music player, recover GMI jobs whose initial response times out, and close the actionable P1/P2 findings from the Coze production acceptance report.

**Architecture:** Keep the existing audio job table, provider abstraction, polling, and private-storage ingestion path. Add GMI request reconciliation for lost POST responses, a batch endpoint for two independent candidates, and a shared player state in the song workbench. Fix voice-line validation, KK/Assets error contracts, Universe audio visibility, and dubbing layout in separate units.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase PostgREST/service role, Node test runner, Playwright, Vercel.

## Global Constraints

- Implement only in `/Users/kiikis000/Documents/Kiikis/worktrees/song-workbench-player`.
- Never write code to `/Volumes/Kiikis2026/storyflow-ai`.
- Preserve the existing AI-conversation-driven song workflow and private audio storage model.
- Never retry a GMI music POST after a timeout; reconcile accepted requests first.
- Keep provider keys server-side and absent from logs, responses, tests, and screenshots.
- Every production change starts with a focused failing test.
- Baseline after `npm install`: the legacy suite has unrelated pre-existing failures; report focused results separately.

---

### Task 1: GMI adapter contract and request reconciliation

**Files:**
- Modify: `lib/audio/providers/helpers.ts`
- Modify: `lib/audio/providers/gmi.ts`
- Modify: `lib/audio/types.ts`
- Modify: `lib/audio/jobs.ts`
- Create: `lib/audio/providers/gmi-reconciliation.ts`
- Test: `tests/audio-provider-contract.test.mjs`, `tests/audio-provider-adapters.test.mjs`, `tests/audio-jobs.test.mjs`

**Interfaces:** `findAcceptedGmiRequest(input): Promise<{ providerTaskId: string; createdAt: string } | null>`; GMI requests use top-level `lyrics`, `prompt`, `sample_rate`, `bitrate`, `format`, and `lyrics_optimizer`; optional `GMI_ORGANIZATION_ID` becomes `X-Organization-ID`.

- [ ] Write failing tests for top-level music fields, organization header, typed unconfirmed submit timeout, and exact request-list reconciliation.
- [ ] Run `npm test -- tests/audio-provider-contract.test.mjs tests/audio-provider-adapters.test.mjs tests/audio-jobs.test.mjs` and confirm RED.
- [ ] Implement the corrected payload, short bounded music-submit wait, `GMI_SUBMIT_UNCONFIRMED` error, and request-list normalization/matching within a timestamp window.
- [ ] Map an unconfirmed music submission to `reconciling` with user copy stating the task was sent and is being confirmed; keep normal TTS timeout behavior unchanged.
- [ ] Re-run the focused tests and confirm GREEN.
- [ ] Commit: `git add lib/audio/providers tests/audio-provider-* tests/audio-jobs.test.mjs lib/audio/jobs.ts lib/audio/types.ts && git commit -m "fix: reconcile accepted GMI music requests"`.

### Task 2: Audio batch endpoint and self-healing poll

**Files:**
- Modify: `app/api/audio/jobs/route.ts`
- Modify: `app/api/audio/jobs/[jobId]/route.ts`
- Create: `app/api/audio/jobs/batch/route.ts`
- Modify: `lib/audio/jobs.ts`
- Test: `tests/audio-route-contract.test.mjs`, `tests/audio-batch-reconciliation.test.mjs`

**Interfaces:** `POST /api/audio/jobs/batch` accepts one music batch with two `{ label, prompt, lyrics }` candidates and returns two local jobs; `GET /api/audio/jobs/[jobId]` reconciles `reconciling` jobs before polling and returns a completed job after ingestion.

- [ ] Write failing tests for two local jobs, distinct idempotency keys, timeout-to-`reconciling`, no duplicate POST during recovery, and `result_ingesting` to retryable `failed` on ingestion error.
- [ ] Run `npm test -- tests/audio-route-contract.test.mjs tests/audio-batch-reconciliation.test.mjs` and confirm RED.
- [ ] Implement batch creation so both rows persist before provider submission, then patch each accepted ID to `generating` or uncertainty to `reconciling`.
- [ ] Implement self-healing polling and wrap storage, asset, voice-line binding, and final job updates so ingestion errors cannot leave a job permanently in `result_ingesting`.
- [ ] Re-run focused route tests and confirm GREEN.
- [ ] Commit: `git add app/api/audio/jobs lib/audio/jobs.ts tests/audio-route-contract.test.mjs tests/audio-batch-reconciliation.test.mjs && git commit -m "fix: make audio batches recoverable after provider timeout"`.

### Task 3: Song workbench double-track player

**Files:**
- Modify: `components/song-workbench/AudioCandidates.tsx`
- Modify: `app/song-workbench/page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/song-audio-layout.test.mjs`
- Create: `tests/song-audio-player.test.mjs`

**Interfaces:** `AudioCandidates` receives candidates, busy state, locale, `onGenerate`, and `onRetry(candidateId)`; it renders stable track shells for queued, reconciling, generating, completed, and failed states. `generateSongAudio` makes one `/api/audio/jobs/batch` call and polls each returned job.

- [ ] Write failing tests for a full-width style prompt, vertically stacked A/B tracks, one persistent player, stable non-ready shells, per-track retry, and one batch request.
- [ ] Run `npm test -- tests/song-audio-layout.test.mjs tests/song-audio-player.test.mjs` and confirm RED.
- [ ] Implement one browser `HTMLAudioElement` state source with selected candidate, play state, current time, duration, and volume.
- [ ] Move style prompt to a full-width block below lyrics/translation; render full-width A/B tracks with cover, waveform/progress, time, status, retry, and download; add the bottom shared player; remove the old lower grid ratio and collapse behavior.
- [ ] Re-run focused UI tests plus `npx tsc --noEmit` and confirm GREEN.
- [ ] Commit: `git add components/song-workbench app/song-workbench/page.tsx app/globals.css tests/song-audio-layout.test.mjs tests/song-audio-player.test.mjs && git commit -m "feat: add full-width song double-track player"`.

### Task 4: Voice Line UUID validation and ingestion recovery

**Files:**
- Modify: `app/api/voice-lines/batch/route.ts`
- Modify: `app/api/voice-lines/generate/route.ts`
- Modify: `app/api/voice-lines/[voiceLineId]/generate/route.ts`
- Modify: `app/api/audio/jobs/[jobId]/route.ts`
- Modify: `lib/voice/queries.ts`
- Test: `tests/dubbing-workbench-contract.test.mjs`
- Create: `tests/voice-line-target-validation.test.mjs`

- [ ] Write failing tests showing synthetic IDs are rejected before DB queries, valid UUIDs remain accepted, and ingestion failures become explicit retryable failures.
- [ ] Run `npm test -- tests/dubbing-workbench-contract.test.mjs tests/voice-line-target-validation.test.mjs` and confirm RED.
- [ ] Add one shared UUID predicate, apply it before all UUID database filters, derive voice-line binding from the authenticated row, and guard final ingestion updates.
- [ ] Re-run focused tests and commit: `git add app/api/voice-lines app/api/audio/jobs/[jobId]/route.ts lib/voice/queries.ts tests/dubbing-workbench-contract.test.mjs tests/voice-line-target-validation.test.mjs && git commit -m "fix: validate voice line UUID targets"`.

### Task 5: KK/Assets fallback and Universe audio visibility

**Files:**
- Modify: `app/api/v2/kk/route.ts`
- Modify: `app/api/v2/assets/route.ts`
- Modify: `lib/server/v2/kk/profile.ts`
- Modify: `lib/server/v2/assets/index.ts`
- Modify: `components/v2/universe/AssetsPanel.tsx`
- Modify: `components/v2/universe/universe.module.css`
- Test: `tests/audio-kk-universe.test.mjs`, `tests/server-v2/assets/assets.test.mjs`

- [ ] Write failing tests for structured retryable KK/Assets errors and an authenticated Universe audio row with a signed playable URL but no raw storage path.
- [ ] Run `npm test -- tests/audio-kk-universe.test.mjs tests/server-v2/assets/assets.test.mjs` and confirm RED.
- [ ] Preserve ownership/auth checks, add request IDs and retry metadata to 503 responses, and render private signed audio previews in the Universe Assets panel.
- [ ] Re-run focused tests and commit: `git add app/api/v2/kk app/api/v2/assets lib/server/v2/kk lib/server/v2/assets components/v2/universe tests/audio-kk-universe.test.mjs tests/server-v2/assets/assets.test.mjs && git commit -m "fix: expose recoverable KK and Universe audio states"`.

### Task 6: Dubbing workbench layout and navigation regression

**Files:**
- Modify: `app/dubbing-workbench/page.tsx`
- Modify: `app/globals.css`
- Modify: `components/v2/voice-workbench/VoiceWorkbench.module.css`
- Modify: `tests/dubbing-workbench-contract.test.mjs`
- Create: `tests/dubbing-workbench-layout.test.mjs`

- [ ] Write failing tests for a bounded two-column form/result layout, no absolute result overlay, and no accidental Settings navigation from form controls.
- [ ] Run `npm test -- tests/dubbing-workbench-contract.test.mjs tests/dubbing-workbench-layout.test.mjs` and confirm RED.
- [ ] Implement responsive `minmax(0, 1fr)` result layout, keep audio controls inside each line card, and make Settings navigation explicit.
- [ ] Re-run focused tests and commit: `git add app/dubbing-workbench app/globals.css components/v2/voice-workbench/VoiceWorkbench.module.css tests/dubbing-workbench-contract.test.mjs tests/dubbing-workbench-layout.test.mjs && git commit -m "fix: stabilize dubbing workbench layout"`.

### Task 7: Integrated verification, push, and Vercel production deployment

**Files:** Existing files from Tasks 1–6 only.

- [ ] Run the focused suite covering all new audio, player, Voice Line, KK/Assets, Universe, and dubbing tests.
- [ ] Run `npx tsc --noEmit` and `npm run build`.
- [ ] Run `npx playwright test e2e/song-workbench-p0s03.spec.ts e2e/v22-voice-workbench.spec.ts --project=chromium` and capture 1440px, 1024px, and 390px screenshots.
- [ ] Inspect `git diff origin/main...HEAD --check`, `git diff origin/main...HEAD --stat`, and `git status --short`; fix only issues from this plan.
- [ ] Push with `git push origin HEAD:main`.
- [ ] Trigger the configured Vercel production deployment, wait for `READY`, and record the deployment URL.
- [ ] Run authenticated production smoke tests: submit two candidates, verify distinct local/provider jobs or `reconciling`, verify at least one playable result, and confirm page refresh preserves state.
