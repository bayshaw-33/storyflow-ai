# Song Workbench Document Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the song workbench around chat-produced document cards on the left and a golden-ratio audio generation center on the right, while preserving Atlas quick generation and Suno V6 professional handoff.

**Architecture:** Keep the existing song state and audio job APIs, but replace the right-side lyric/translation/style panels with a document-card flow and an audio studio. Add a small document model with stable IDs and card versions, a centered preview/editor dialog, and explicit content selection per generation mode. Treat the V6 style prompt as the professional source of truth, with an Atlas adapter for quick generation.

**Tech Stack:** Next.js App Router, React client components, TypeScript, existing Supabase/project persistence, existing Atlas audio provider, Node test scripts, Playwright.

## Global Constraints

- Desktop layout uses 38.2% chat and 61.8% generation center.
- AI generations create new cards; manual editing updates the current card.
- Only lyrics and Suno V6 style prompt are document types; SFX uses a chat result card.
- Translation is an action inside the lyrics preview and never creates a translation card.
- V6 style prompt is measured in UTF-8 bytes and must be <= 1000 bytes at every save/copy/Suno handoff.
- Instrumental mode must exclude vocals, singing, humming, chanting, choir, spoken word and vocal textures in both prompt and provider payload.
- Atlas quick generation remains MiniMax Music 3.0 or Suno V5; Suno website handoff remains the professional V6 path.

---

### Task 1: Add document card and preview state boundaries

**Files:**
- Create: `components/song-workbench/SongDocumentCard.tsx`
- Create: `components/song-workbench/SongDocumentPreview.tsx`
- Modify: `app/song-workbench/page.tsx`
- Test: `tests/song-document-ui.test.mjs`

**Interfaces:**
- `SongDocument = { id: string; kind: "lyrics" | "v6_style" | "sfx_description"; version: number; title: string; content: string; createdAt: string; updatedAt: string; source: "ai" | "manual" }`.
- `SongDocumentCard` consumes a `SongDocument` and `onOpen(document)`.
- `SongDocumentPreview` consumes `{ document, onClose, onSave, onTranslate, onCopy, onOpenSuno }` and exposes read-only/edit states.

- [ ] Write tests for card labels, document kind routing, 1000-byte counter, manual save callback, and lyrics-only translation action.
- [ ] Run `node --test tests/song-document-ui.test.mjs` and confirm failure before implementation.
- [ ] Implement the two focused components with accessible buttons, a centered overlay, read-only preview, edit mode, copy action, translation action for lyrics only, Suno action for V6 style only, and UTF-8 byte validation.
- [ ] Add page state for `documents`, `activeDocumentId`, `documentPreviewMode`, and temporary `translatedLyrics`; load/store document cards in the existing draft snapshot while reading legacy `lyrics` and `stylePrompt` into initial cards.
- [ ] Make AI generation append new documents and manual save replace only the matching document ID.
- [ ] Run the document tests and TypeScript check; expect all new tests and existing type checks to pass.
- [ ] Commit `feat(song): add document cards and preview editor`.

### Task 2: Move AI outputs into chat document cards

**Files:**
- Modify: `app/song-workbench/page.tsx`
- Modify: `lib/ai/prompts.ts`
- Test: `tests/song-document-generation.test.mjs`

**Interfaces:**
- `parseSongGeneration` returns `{ lyrics, stylePrompt, compositionPrompt }`; page converts each non-empty result into a new `SongDocument`.
- `getMusicModeInstruction(mode)` remains the shared mode instruction for generation and revision input.

- [ ] Write tests proving a complete AI result creates two cards, a lyrics-only revision creates one lyrics card, and a style-only revision creates one V6 style card.
- [ ] Run the test file and confirm failure against the current right-panel state.
- [ ] Update song prompt rules to make lyrics and V6 style prompt separate deliverables, with fewer precise style anchors and section-level production direction; remove the requirement that instrumental/SFX modes produce lyrics.
- [ ] Update chat-generation and full song-generation handlers to append new cards, select the newest relevant cards, and retain old cards.
- [ ] Render document cards in the chat transcript at the AI result position and remove the large right lyric, translation, and style panels.
- [ ] Keep existing project snapshots/export compatibility by deriving legacy `lyrics`, `stylePrompt`, and `translatedLyrics` from the latest selected documents.
- [ ] Run targeted tests and TypeScript; expect the document generation tests and existing song tests to pass.
- [ ] Commit `feat(song): surface AI song outputs as chat documents`.

### Task 3: Rebuild the right-side audio studio around selected documents

**Files:**
- Modify: `components/song-workbench/AudioCandidates.tsx`
- Modify: `app/song-workbench/page.tsx`
- Modify: `app/globals.css` only if existing responsive selectors cannot be reused
- Test: `tests/song-audio-studio.test.mjs`

**Interfaces:**
- `AudioCandidates` receives `documents`, `selectedLyricsDocumentId`, `selectedStyleDocumentId`, `selectedSfxDocumentId`, and selection callbacks.
- `generateSongAudio` receives an explicit `{ mode, lyricsDocument, styleDocument, sfxDocument }` selection snapshot.

- [ ] Write tests for defaulting to latest relevant documents, independent historical combination, song/ instrumental/ SFX content labels, and payload omission of lyrics for non-vocal modes.
- [ ] Run the tests and confirm failure before changing the component.
- [ ] Replace the current right output cards with a 38.2fr/61.8fr workbench grid, a horizontal player, model selector, content type switch, mode-specific content selector, generate action, and generation history list.
- [ ] In song mode show separate lyrics and V6 style selections; in instrumental mode show only V6 style; in SFX mode show only SFX description.
- [ ] Preserve the existing Suno website handoff link in the page shell and make the V6 style preview expose the same action.
- [ ] Add an always-visible instrumental constraint note: `严格无人声：已启用`.
- [ ] Run targeted studio tests, local browser smoke, and TypeScript.
- [ ] Commit `feat(song): rebuild audio generation studio`.

### Task 4: Make the prompt pipeline V6-aware without weakening Atlas modes

**Files:**
- Modify: `lib/ai/prompts.ts`
- Modify: `app/song-workbench/page.tsx`
- Modify: `lib/audio/providers/atlascloud.ts`
- Modify: `app/api/audio/jobs/route.ts`
- Test: `tests/song-v6-prompt.test.mjs`
- Test: `tests/atlascloud-music-provider.test.mjs`

**Interfaces:**
- `buildSongGenerationInput` and `buildSongRevisionInput` carry `musicMode` and the V6 style intent.
- `submitPayload(input, model)` keeps Atlas-specific fields while enforcing `is_instrumental`/`instrumental` for `instrumental` and `sfx`.

- [ ] Write tests for concise V6 style output, UTF-8 byte enforcement, professional Suno content, and dual instrumental exclusions.
- [ ] Run targeted tests and confirm failure for the missing V6/Atlas separation.
- [ ] Refine the song workbench prompt so the master creative brief favors precise anchors, section transitions, arrangement relationships, dynamic arc, mix space, and resolved endings rather than tag accumulation; preserve the no-narration Intro rule.
- [ ] Add a bounded `fitV6StylePrompt` path that compresses overlong generated style prompts while preserving required musical anchors, then rejects any remaining >1000-byte result.
- [ ] Build the Atlas quick-generation payload from the selected documents and mode, omitting lyrics for instrumental/SFX and adding explicit negative vocal constraints to prompt text and provider flags.
- [ ] Keep Suno V5 and MiniMax 3.0 provider identifiers unchanged until Atlas publishes a confirmed V6 mapping.
- [ ] Run provider tests, song tests, TypeScript, and production build.
- [ ] Commit `fix(song): align prompts with Suno V6 and Atlas modes`.

### Task 5: Verify the complete workflow and publish

**Files:**
- Modify: `tests/song-workbench-regression.test.mjs` if an existing regression suite needs coverage
- Modify: `docs/superpowers/specs/2026-09-10-song-workbench-document-studio-design.md` only for verified corrections

- [ ] Run the full Node test suite and record the pass/fail count.
- [ ] Run `pnpm exec tsc --noEmit`.
- [ ] Run `pnpm build`.
- [ ] Start the local app and use Playwright to verify golden-ratio layout, document card insertion, centered preview, edit-save-in-place, lyrics translation, model/content selection, instrumental constraint, and SFX selection.
- [ ] Confirm the worktree contains no secret files or unintended changes.
- [ ] Push the completed branch to GitHub.
- [ ] Deploy the verified branch to Vercel Production and check `/song-workbench` returns 200.
- [ ] Run the production UI smoke check and report the deployment URL, commit, tests, build, and any known Atlas limitation.
