# ElevenLabs Voice Workbench Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-side ElevenLabs voice directory and TTS provider to the existing voice workbench, including personal voices, shared Voice Library voices, selection, preview, generation, and Kiikis-owned audio downloads.

**Architecture:** Keep ElevenLabs credentials server-only. Add a small provider adapter using the official REST endpoints, expose a user-authenticated voice directory route that returns sanitized metadata and preview URLs, and reuse the existing `storyflow_generation_jobs` plus private `voice-lines` Storage ingestion path for generated audio. The workbench will select an ElevenLabs `voice_id`; it will not affect the music workbench or treat TTS voices as singing voices.

**Tech Stack:** Next.js App Router, TypeScript, React, Supabase Storage/PostgREST, Node built-in test runner, Playwright.

## Global Constraints

- ElevenLabs API keys must remain server-side and must never be returned in API responses or logged.
- Use official ElevenLabs endpoints only: `/v2/voices`, `/v1/shared-voices`, and `/v1/text-to-speech/:voice_id`.
- Voice Library access may depend on the ElevenLabs plan; unavailable directories must return a truthful error.
- Generated audio must be copied into Kiikis private Storage before a download URL is returned.
- The feature is TTS/配音 only; it must not change Atlas Cloud music model routing.
- Preserve existing placeholder behavior when ElevenLabs is not configured.

### Task 1: ElevenLabs Provider Adapter

**Files:**
- Create: `lib/voice/providers/elevenlabs.ts`
- Test: `tests/voice-elevenlabs-provider.test.mjs`
- Modify: `lib/voice/provider.ts`
- Modify: `.env.example`
- Modify: `docs/V2-PROVIDER-KEYS.md`

**Interfaces:**
- Produces `createElevenLabsTTSProvider(options?)` implementing the existing `TTSProvider` interface.
- Produces `listVoices()` and `listSharedVoices(params?)` methods returning sanitized provider voice records.
- Uses `ELEVENLABS_API_KEY`, `ELEVENLABS_BASE_URL`, `ELEVENLABS_TTS_MODEL`, and `ELEVENLABS_OUTPUT_FORMAT`.

- [ ] **Step 1: Write the failing tests** for authenticated voice listing, shared-voice listing, synchronous speech bytes, empty-key availability, provider errors, and the 0.7–1.2 speed clamp.
- [ ] **Step 2: Run `node --test tests/voice-elevenlabs-provider.test.mjs` and verify it fails because the adapter is missing.
- [ ] **Step 3: Implement the minimal adapter** with `xi-api-key` headers, official endpoint paths, non-secret metadata, `audio/mpeg` byte validation, and typed safe errors.
- [ ] **Step 4: Wire `TTS_PROVIDER=elevenlabs` into `resolveTTSProvider`, `isTTSProviderAvailable`, and `getCurrentTTSProviderName`.
- [ ] **Step 5: Add the environment variables and provider setup documentation.
- [ ] **Step 6: Run the focused provider tests and existing audio-provider contract tests; verify they pass.

### Task 2: Authenticated Voice Directory API

**Files:**
- Create: `app/api/voice/elevenlabs/voices/route.ts`
- Test: `tests/voice-elevenlabs-route.test.mjs`
- Modify: `app/api/voice/provider-status/route.ts`

**Interfaces:**
- `GET /api/voice/elevenlabs/voices?source=personal|shared&search=&language=&gender=&pageSize=&pageToken=` returns `{ success, source, voices, hasMore, nextPageToken }`.
- Requires the existing Supabase Bearer authentication and server ElevenLabs configuration.
- Returns only voice metadata needed by the UI: id, name, category, description, labels, preview URL, verified languages, owner/availability flags.

- [ ] **Step 1: Write the failing route contract tests** for authentication, source validation, sanitized response shape, pagination forwarding, and no key leakage.
- [ ] **Step 2: Run the focused route tests and verify the expected missing-route failure.
- [ ] **Step 3: Implement the route** with `authenticateRequest`, `resolveTTSProvider`, query validation, and safe error mapping.
- [ ] **Step 4: Extend provider status with `voiceDirectoryAvailable` and `voiceDirectoryProvider` without exposing credentials.
- [ ] **Step 5: Run focused route tests and existing provider-status tests.

### Task 3: Voice Selector and Preview UI

**Files:**
- Modify: `components/v2/voice-workbench/VoiceLineEditor.tsx`
- Modify: `components/v2/voice-workbench/VoiceWorkbench.tsx`
- Modify: `components/v2/voice-workbench/VoiceWorkbench.module.css`
- Modify: `e2e/v22-voice-workbench.spec.ts`

**Interfaces:**
- The editor exposes `data-testid="elevenlabs-voice-selector"`, source tabs, search, preview buttons, and a selected voice label.
- Selecting a voice stores its `voice_id` as `voiceProviderVoiceId` for the current generation request.
- When the provider is not ElevenLabs or is unavailable, the selector remains truthful and the legacy editor remains usable.

- [ ] **Step 1: Add failing UI contract assertions** for selector, source tabs, preview control, and no API key rendered in the DOM.
- [ ] **Step 2: Run the focused UI contract/E2E test and verify it fails.
- [ ] **Step 3: Implement loading, search, preview, empty/error/loading states, keyboard-accessible buttons, and responsive styling.
- [ ] **Step 4: Replace the free-form `voice-id` field with the selector while retaining a safe fallback for non-ElevenLabs providers.
- [ ] **Step 5: Run the workbench E2E tests locally with placeholder config and verify no false success.

### Task 4: ElevenLabs Generation and Download Regression

**Files:**
- Modify: `app/api/audio/jobs/route.ts`
- Modify: `app/api/voice-lines/[voiceLineId]/generate/route.ts`
- Test: `tests/voice-elevenlabs-generation-contract.test.mjs`
- Test: `tests/voice-download-regression.test.mjs`

**Interfaces:**
- `voiceProviderVoiceId` is validated as the selected ElevenLabs voice ID before TTS submission.
- Synchronous ElevenLabs bytes follow the existing private Storage upload → signed URL → asset/job completion path.
- Provider failures leave jobs in a failed/timeout state and never return a fake download link.

- [ ] **Step 1: Write failing generation/download regression tests** for selected voice propagation, private Storage persistence, content type, and missing-byte failure.
- [ ] **Step 2: Run them and verify the regression tests fail before implementation.
- [ ] **Step 3: Add provider-specific input validation and ensure the existing synchronous ingestion path receives ElevenLabs bytes.
- [ ] **Step 4: Add download URL re-signing or reuse the existing signed download route as required by the actual route contract.
- [ ] **Step 5: Run focused generation/download tests.

### Task 5: Full Verification and Release Readiness

**Files:**
- Modify: `docs/V2-PROVIDER-KEYS.md` if verification reveals missing deployment setup details.
- Modify: `e2e/v22-voice-workbench.spec.ts` only for verified regression coverage.

- [ ] **Step 1: Run `npm run test:unit` and verify zero failures.
- [ ] **Step 2: Run `npx tsc --noEmit --pretty false` and verify zero TypeScript errors.
- [ ] **Step 3: Run `npm run build` and verify exit code 0.
- [ ] **Step 4: Run the relevant Playwright workbench tests and verify provider-unconfigured behavior.
- [ ] **Step 5: If production ElevenLabs credentials are present in the deployment environment, perform one real list/preview/generate/download smoke test; otherwise report that external-provider smoke testing is configuration-blocked, without claiming it passed.
- [ ] **Step 6: Review `git diff`, commit the focused change, and only then push/deploy if the user explicitly requests release.
