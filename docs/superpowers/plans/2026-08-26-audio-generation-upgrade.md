# Kiikis Audio Generation Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Kiikis 歌曲创作与配音从文本/同步试听能力升级为可追踪、可转存、可审核、可沉淀到 Universe 的异步音频生产闭环，并接入 MiniMax 官方双账号与 GMI 备用通道。

**Architecture:** 复用 `storyflow_generation_jobs`、私有 Storage、KK creative events 和现有 Voice Profile/Voice Line 数据结构。新增统一 Audio Provider Gateway，MiniMax 官方、GMI 和 OpenAI 适配器实现同一 Music/TTS 接口；歌曲工作台和配音工作台只消费网关与任务 API，不直接依赖供应商协议。

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase/PostgREST, Node `node:test`, React 19, private Supabase Storage.

## Global Constraints

- API Key 只从服务端环境变量读取，不入库、不进入日志和客户端。
- Provider 临时 URL 不入库；完成结果必须先转存私有 Storage，再生成签名 URL。
- 生成请求必须支持幂等，不能因重复点击重复提交同一 Provider 任务。
- Provider 没有真实百分比时不得伪造百分比，KK 只播报阶段和真实事件。
- MiniMax 官方账号 A 为生产主通道，账号 B 为授权范围内的热备；不得用账号轮换规避限流或活动规则。
- 现有未跟踪用户文件 `amp`、`docs/kiikis-2.1/nas-docs-backup/`、`lib/client/v2/navigation/nas-nav-backup/` 不得修改或删除。
- 每个任务先写失败测试并确认 RED，再写最小生产代码；每个工作包完成后只做一次该包测试和一次集成测试。

### Task 1: Audio Provider Gateway and capability contract

**Files:**
- Create: `lib/audio/types.ts`
- Create: `lib/audio/provider.ts`
- Create: `lib/audio/capabilities.ts`
- Test: `tests/audio-provider-contract.test.mjs`

**Interfaces:**
- Produces `AudioProviderName`, `MusicSubmitInput`, `TTSSubmitInput`, `AudioPollResult`, `AudioProvider`, `resolveAudioProvider(kind)` and `getAudioCapabilities()`.
- Consumes only environment configuration; no route or UI imports.

- [ ] **Step 1: Write the failing contract test**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync("lib/audio/provider.ts", "utf8");
const types = readFileSync("lib/audio/types.ts", "utf8");

test("audio provider contract has music, tts, poll and capability methods", () => {
  for (const name of ["MusicSubmitInput", "TTSSubmitInput", "AudioPollResult", "AudioProvider"]) {
    assert.ok(types.includes(name), `${name} must exist`);
  }
  for (const name of ["resolveAudioProvider", "getAudioCapabilities"]) {
    assert.ok(source.includes(name), `${name} must exist`);
  }
});

test("provider names include minimax, gmi and openai", () => {
  assert.match(types, /minimax/);
  assert.match(types, /gmi/);
  assert.match(types, /openai/);
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node --test tests/audio-provider-contract.test.mjs`

Expected: FAIL because `lib/audio/provider.ts` and `lib/audio/types.ts` do not exist.

- [ ] **Step 3: Implement the minimal contract**

Define the shared types with `submitMusic`, `submitTTS`, `poll`, `download`, `isAvailable`, and `capabilities`; resolve only registered server-side providers and return a capability matrix instead of exposing keys.

- [ ] **Step 4: Run the test to verify GREEN**

Run: `node --test tests/audio-provider-contract.test.mjs`

Expected: PASS.

### Task 2: MiniMax official, GMI, and fallback adapters

**Files:**
- Create: `lib/audio/providers/minimax.ts`
- Create: `lib/audio/providers/gmi.ts`
- Create: `lib/audio/providers/openai.ts`
- Modify: `lib/voice/provider.ts`
- Modify: `lib/voice/types.ts`
- Test: `tests/audio-provider-adapters.test.mjs`

**Interfaces:**
- Consumes Task 1 types.
- Produces `createMiniMaxAudioProvider`, `createGmiAudioProvider`, `createOpenAIAudioProvider`, and `resolveTTSProvider` support for `minimax`, `gmi`, and `openai`.

- [ ] **Step 1: Write failing adapter tests**

Test missing-key errors, MiniMax submit/poll mapping, GMI OpenAI-compatible text configuration isolation, and provider-name resolution using `globalThis.fetch` responders. Do not use real credentials.

- [ ] **Step 2: Run RED**

Run: `node --test tests/audio-provider-adapters.test.mjs`

Expected: FAIL because the new adapters and resolver branches are absent.

- [ ] **Step 3: Implement adapters**

Use `MINIMAX_API_KEY`, `MINIMAX_API_KEY_SECONDARY`, `GMI_API_KEY`, `TTS_PROVIDER`, `MUSIC_PROVIDER`, and provider-specific base URL/model variables. MiniMax and GMI jobs must return provider task IDs and poll results; OpenAI remains synchronous TTS fallback. Never log request bodies containing user voice data.

- [ ] **Step 4: Fix voice type and resolver compatibility**

Add `minimax` and `gmi` to `VoiceProviderName`; make `resolveTTSProvider()` and `isTTSProviderAvailable()` recognize them while preserving placeholder behavior.

- [ ] **Step 5: Run GREEN**

Run: `node --test tests/audio-provider-adapters.test.mjs tests/v2-voice.test.mjs`

Expected: PASS.

### Task 3: Unified async audio job lifecycle and storage

**Files:**
- Create: `lib/audio/jobs.ts`
- Create: `lib/audio/storage.ts`
- Modify: `app/api/voice-lines/[voiceLineId]/generate/route.ts`
- Create: `app/api/audio/jobs/route.ts`
- Create: `app/api/audio/jobs/[jobId]/route.ts`
- Create: `supabase/migrations/20260827000000_audio_generation_upgrade.sql`
- Test: `tests/audio-jobs.test.mjs`

**Interfaces:**
- Consumes Task 1–2 provider interfaces and existing `storyflow_generation_jobs`, `storyflow_assets`, Voice Line queries, and private Storage helpers.
- Produces POST/GET audio job APIs returning `queued`, `generating`, `result_ingesting`, `completed`, `failed`, and `provider_timeout` states.

- [ ] **Step 1: Write failing lifecycle tests**

Cover idempotent job creation, async submit storing `provider_task_id`, poll `done` downloading and persisting bytes, provider failure, and the rule that an external temporary URL is absent from the persisted result metadata.

- [ ] **Step 2: Run RED**

Run: `node --test tests/audio-jobs.test.mjs`

Expected: FAIL because no generic audio lifecycle exists.

- [ ] **Step 3: Add migration**

Extend job constraints and metadata indexes needed by audio jobs, add the audio target fields required by song versions, and add any consent/audit columns for cloned voices without weakening existing RLS.

- [ ] **Step 4: Implement lifecycle helpers and routes**

POST creates or returns the idempotent job, submits once, and returns `202`; GET polls at most once per request, persists completed bytes, updates the job, and returns a stable signed URL. Use `generating` consistently; remove the voice route's obsolete `running` write.

- [ ] **Step 5: Run GREEN**

Run: `node --test tests/audio-jobs.test.mjs tests/v2-voice.test.mjs tests/v2-video-gateway.test.mjs`

Expected: PASS.

### Task 4: Song project/version domain and song workbench

**Files:**
- Create: `lib/song/audio.ts`
- Create: `app/api/song-projects/[projectId]/audio/route.ts`
- Modify: `app/song-workbench/page.tsx`
- Modify: `lib/song/prompt.ts`
- Create: `components/song-workbench/AudioCandidates.tsx`
- Create: `components/song-workbench/AudioPlayer.tsx`
- Test: `tests/song-audio-contract.test.mjs`

**Interfaces:**
- Consumes Task 1–3 audio capabilities and job APIs; preserves current lyrics, translation, style prompt, and 38/62 layout.
- Produces candidate generation, playback, A/B comparison, retry, lock-master, and Universe-link actions.

- [ ] **Step 1: Write failing UI contract tests**

Assert the page no longer states that it has no audio generation, exposes an audio generation action, renders candidate status, and keeps lyrics/translation/style panels.

- [ ] **Step 2: Run RED**

Run: `node --test tests/song-audio-contract.test.mjs`

Expected: FAIL because the current workbench has no audio generation controls or candidate component.

- [ ] **Step 3: Implement song audio API and components**

Create song version payloads from the existing creative brief, submit one job per candidate, poll through the shared job API, display stage-based status, and persist the selected master as an audio asset. Do not add a second complex form; use existing KK conversation output plus a compact generation control.

- [ ] **Step 4: Run GREEN and existing song regression tests**

Run: `node --test tests/song-audio-contract.test.mjs tests/song-prompt.test.mjs tests/song-translation.test.mjs tests/creation-workbench-ui.test.mjs`

Expected: PASS.

### Task 5: Dubbing workbench and consent-aware voice profiles

**Files:**
- Create: `app/dubbing-workbench/page.tsx`
- Create: `components/dubbing-workbench/VoiceCasting.tsx`
- Create: `components/dubbing-workbench/DialogueBatch.tsx`
- Create: `components/dubbing-workbench/LineReview.tsx`
- Modify: `components/character-passport/VoiceSection.tsx`
- Modify: `lib/voice/queries.ts`
- Test: `tests/dubbing-workbench-contract.test.mjs`

**Interfaces:**
- Consumes existing Voice Profile/Voice Line DTOs and Task 3 audio jobs.
- Produces project/scene/role batch generation, voice cloning consent gate, line review, approval, and export entry points.

- [ ] **Step 1: Write failing contract tests**

Cover scene/role grouping, batch generation action, consent-required clone flow, and approval only after an asset exists.

- [ ] **Step 2: Run RED**

Run: `node --test tests/dubbing-workbench-contract.test.mjs`

Expected: FAIL because the dedicated workbench and consent metadata are absent.

- [ ] **Step 3: Implement the minimum dubbing workflow**

Reuse the existing voice data model, add consent metadata and audit fields, route batch lines through the async audio job API, show per-line status, and preserve approved-line locking.

- [ ] **Step 4: Run GREEN**

Run: `node --test tests/dubbing-workbench-contract.test.mjs tests/v2-voice.test.mjs`

Expected: PASS.

### Task 6: KK progress events and Universe asset binding

**Files:**
- Create: `lib/audio/kk-events.ts`
- Modify: `lib/client/v2/kk/task-projection.ts`
- Modify: `app/api/v2/kk/events/route.ts` only if audio payload normalization is required
- Create: `lib/audio/universe-links.ts`
- Test: `tests/audio-kk-universe.test.mjs`

**Interfaces:**
- Consumes Task 3 audio job status transitions and existing creative event stream.
- Produces configurable key-node announcements, task detail navigation, completed audio result navigation, and song/voice asset links to Universe.

- [ ] **Step 1: Write failing event tests**

Assert that queued, generating, ingesting, completed, and failed audio jobs produce localized KK messages with same-origin detail links; assert no fake percentage appears when provider progress is unknown.

- [ ] **Step 2: Run RED**

Run: `node --test tests/audio-kk-universe.test.mjs`

Expected: FAIL because audio-specific progress and Universe binding are absent.

- [ ] **Step 3: Implement event projection and binding**

Emit only persisted job transitions, support user-selected notification frequency with key-node default, and attach completed Song Version/Voice Line assets to the relevant Universe entity or project without exposing Provider URLs.

- [ ] **Step 4: Run GREEN and existing KK tests**

Run: `node --test tests/audio-kk-universe.test.mjs tests/ui-v2/kk/kk-task-projection.test.mjs tests/kiikis-21-kk-api.test.mjs`

Expected: PASS.

### Task 7: Integration, deployment checklist, and Coze acceptance package

**Files:**
- Create: `docs/kiikis-2.2/audio/COZE-AUDIO-ACCEPTANCE.md`
- Create: `docs/kiikis-2.2/audio/MINIMAX-GMI-ENV.md`
- Modify: `README.md` only if required for runtime configuration
- Test: existing unit suite plus targeted Playwright flows

- [ ] **Step 1: Run targeted unit suite**

Run: `npm run test:unit -- tests/audio-provider-contract.test.mjs tests/audio-provider-adapters.test.mjs tests/audio-jobs.test.mjs tests/song-audio-contract.test.mjs tests/dubbing-workbench-contract.test.mjs tests/audio-kk-universe.test.mjs`

- [ ] **Step 2: Run build and route checks**

Run: `npm run build`

Expected: build completes without TypeScript or route errors.

- [ ] **Step 3: Write Coze acceptance package**

Include provider capability checks, one music generation, one single-line TTS generation, one batch dubbing run, one failure/degrade path, KK key-node updates, private-storage verification, consent rejection, and Universe asset lookup. Include test account setup but never include API keys.

- [ ] **Step 4: Push the completed Codex implementation**

Run: `git status --short`, `git diff --check`, `git add <only audio upgrade files>`, `git commit -m "feat: upgrade song and dubbing audio generation"`, then push the current branch. Do not stage the pre-existing unrelated untracked files.

- [ ] **Step 5: Hand off to Coze for the single terminal acceptance gate**

Coze runs `docs/kiikis-2.2/audio/COZE-AUDIO-ACCEPTANCE.md`. If a check fails, Codex fixes only that failure and Coze rechecks only the failed item.

## Spec coverage review

- MiniMax official dual-account routing and GMI promotional fallback: Tasks 1–2 and 7.
- Async music and TTS generation: Tasks 2–4.
- Private persistence and idempotency: Task 3.
- Song creation UX and candidate comparison: Task 4.
- Dubbing, voice identity, consent, and batch review: Task 5.
- KK progress reporting and user-selected frequency: Task 6.
- Universe asset persistence: Tasks 4–6.
- One-time Coze verification and no TRAE implementation work: Task 7.
