# Suno V6 Model Selector Implementation Plan

> **For agentic workers:** Execute this plan inline in the current isolated worktree with TDD checkpoints.

**Goal:** Replace Atlas Cloud's retired Suno V5 option with the three available Suno V6 variants and default the music workbench to `suno/chirp-v6-mini`.

**Architecture:** Keep model IDs server-owned in the existing music catalog and provider adapter. Expose the same three IDs through the capability endpoint and song workbench selector; validate every submit request against that allowlist. Preserve the existing professional Suno website handoff and the instrumental/SFX constraints.

**Tech Stack:** Next.js, TypeScript, Node test runner, Atlas Cloud audio adapter, localStorage-backed song workbench.

## Global Constraints

- Atlas music model IDs: `minimax/music-3.0`, `suno/chirp-v6`, `suno/chirp-v6-wild`, `suno/chirp-v6-mini`.
- Default Suno model: `suno/chirp-v6-mini`.
- No TTS model is added to the music selector.
- Instrumental mode must retain explicit no-vocal constraints.
- Historical V5 rows remain readable; new submissions and retries cannot use V5.

### Task 1: Red regression coverage

**Files:**
- Modify: `tests/atlascloud-music-models.test.mjs`
- Modify: `tests/atlascloud-music-provider.test.mjs`
- Modify: `tests/song-audio-model-selection.test.mjs`
- Modify: `tests/atlascloud-audio-route.test.mjs`

- [ ] Add assertions for all three V6 IDs, their labels, and `chirp-v6-mini` as the default.
- [ ] Run the focused tests and confirm they fail because the current source still contains V5-only assertions.

### Task 2: Server catalog, provider, and submit validation

**Files:**
- Modify: `lib/audio/music-models.ts`
- Modify: `lib/audio/providers/atlascloud.ts`
- Modify: `app/api/audio/jobs/route.ts`

- [ ] Replace the V5 ID with the three V6 IDs in the type, catalog, provider model list, and invalid-model message.
- [ ] Keep the existing model-specific payload mapping and no-vocal behavior intact.
- [ ] Run focused server tests and confirm all pass.

### Task 3: Song workbench selector and persistence

**Files:**
- Modify: `app/song-workbench/page.tsx`

- [ ] Replace the V5 option with V6, V6 Wild, and V6 Mini.
- [ ] Set the initial and invalid-restored fallback to `suno/chirp-v6-mini` while retaining MiniMax as the other provider option.
- [ ] Allow all three V6 IDs through the controlled model change handler and capability response filter.
- [ ] Run selector tests and the TypeScript check.

### Task 4: Documentation and release verification

**Files:**
- Modify: `docs/superpowers/specs/2026-09-09-atlas-cloud-music-model-switch-design.md`
- Modify: `docs/superpowers/plans/2026-09-09-atlas-cloud-music-model-switch.md`
- Modify: `docs/superpowers/specs/2026-09-10-song-workbench-document-studio-design.md`
- Modify: `docs/superpowers/plans/2026-09-10-song-workbench-document-studio.md`

- [ ] Replace active V5 references with the three V6 variants and document Mini as the default; preserve historical wording only where it describes retired behavior.
- [ ] Run the complete unit suite, production build, and a browser smoke check for the model selector.
- [ ] Commit, push `main`, deploy Vercel Production, and verify the production page and protected audio endpoint.
