# Kiikis Creation Workbench V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `/novel-workbench` into a seven-stage novel/script workbench with per-unit creation, structured screenplay formats, optional translation, paired localization outputs, and merged Markdown/DOCX/ZIP delivery.

**Architecture:** Add a versioned `creationWorkspace` aggregate to the existing `DramaProject` so legacy fields remain readable while V2 data is isolated. Keep novel units as Markdown and screenplay units as structured scenes rendered by pure formatters. Reuse the current AI endpoint with new task options and parsers; keep exports deterministic and independent of AI.

**Tech Stack:** Next.js 15, React 19, TypeScript, Node test runner, Supabase project persistence, `docx`, `jszip`.

## Global Constraints

- Work only in the NAS worktree and do not modify the legacy script workbench.
- UI layout remains 38% assistant / 62% document on desktop and non-overflowing tabs on mobile.
- Stage order is Background & World, Character Bible, Plot & Outline, Manuscript, Translation, Localization & Similarity, Export.
- Novel and screenplay content are separate and never overwrite each other.
- Novel units are chapters; screenplay units are episodes; one unit is the default generation range.
- Screenplay default format is `international_production`; alternatives are `hollywood_spec` and `asian_production`.
- Translation is optional. Export formats are Markdown and real DOCX only; the full package is ZIP. PDF is out of scope.
- Preserve Universe, art workbench, and storyboard/video handoff.
- Every behavior change starts with a failing test and ends with focused verification.

---

### Task 1: V2 Creation Domain and Legacy Normalization

**Files:**
- Create: `lib/creation/types.ts`
- Create: `lib/creation/state.ts`
- Modify: `lib/projects.ts`
- Test: `tests/creation-state.test.mjs`

**Interfaces:**
- Produces `CreationWorkspaceV2`, `CreationArc`, `CreationUnit`, `ScreenplayEpisode`, `ScreenplayScene`, `ScreenplayBlock`.
- Produces `createCreationWorkspace(project)`, `normalizeCreationWorkspace(value, project)`, `updateCreationUnit(workspace, mode, unitId, patch)`, `reorderCreationStructure(workspace, arcs)`.
- `DramaProject.creationWorkspace` is optional for backward compatibility and normalized on read.

- [ ] Write failing tests proving legacy fields map to the new three documents, novel chapters remain separate, and screenplay units do not overwrite novel units.
- [ ] Run `node --experimental-strip-types --test tests/creation-state.test.mjs`; expect missing-module failure.
- [ ] Implement focused domain types and immutable state helpers. Use stable IDs and `draft | reviewed | locked` status.
- [ ] Extend `DramaProject` and normalization without deleting or rewriting legacy fields.
- [ ] Rerun the focused tests; expect all passing.
- [ ] Commit `Add structured creation workspace state`.

### Task 2: Screenplay Mother Model, Three Formatters, and Validator

**Files:**
- Create: `lib/creation/screenplay.ts`
- Test: `tests/screenplay-formats.test.mjs`

**Interfaces:**
- Consumes `ScreenplayEpisode` and `ScreenplayFormat` from `lib/creation/types.ts`.
- Produces `renderScreenplayEpisode(episode, format, languages): string`.
- Produces `validateScreenplayEpisode(episode, format): ScreenplayValidationResult`.
- Produces `autoFixScreenplayEpisode(episode, format): ScreenplayEpisode`; it may normalize names, headings, punctuation, and paragraph length only.

- [ ] Write failing tests for identical story facts across all formats, Hollywood scene-number omission, Asian day/interior labels, international scene numbers/characters/INT-EXT, Spanish punctuation, and non-mutating auto-fix.
- [ ] Run the focused test; expect missing exports.
- [ ] Implement the three pure Markdown renderers using the supplied screenplay format instruction as the source of truth.
- [ ] Implement validation warnings and safe normalization without changing dialogue text or scene order.
- [ ] Rerun focused tests; expect all passing.
- [ ] Commit `Add screenplay format renderers`.

### Task 3: Outline Structure, Generation Parsing, and Version Safety

**Files:**
- Create: `lib/creation/parsers.ts`
- Modify: `lib/creation/state.ts`
- Test: `tests/creation-parsers.test.mjs`

**Interfaces:**
- Produces `parseArcStructure(markdown, mode): CreationArc[]`.
- Produces `parseNovelUnitOutput(output, unit): CreationUnit`.
- Produces `parseScreenplayUnitOutput(output, unit): CreationUnit`.
- Produces `applyUnitGeneration(workspace, mode, unitId, output, metadata)` and rejects locked units or malformed responses without mutation.

- [ ] Write failing tests for 12 arcs × variable child counts, one-arc batch splitting, malformed-output rejection, locked-unit rejection, and old-version snapshots.
- [ ] Run focused tests; expect failures.
- [ ] Implement conservative parsers with explicit output markers and no speculative content recovery.
- [ ] Implement version snapshots and partial batch application.
- [ ] Rerun focused tests; expect all passing.
- [ ] Commit `Add unit generation parsing and history`.

### Task 4: AI Tasks, Language Rules, and Seven-Stage Prompts

**Files:**
- Modify: `lib/ai/prompts.ts`
- Modify: `lib/ai/generate.ts`
- Modify: `lib/ai/providers/index.ts`
- Test: `tests/creation-prompts.test.mjs`

**Interfaces:**
- Add task types `creation_development_chat`, `creation_background_world`, `creation_character_bible`, `creation_plot_outline`, `creation_novel_unit`, `creation_screenplay_unit`, `creation_translate_unit`, `creation_localize_unit`.
- Extend `GenerateOptions` with `interfaceLanguage`, `contentMode`, `sourceLanguage`, `dialogueLanguage`, `screenplayFormat`, `generationScope`, `unitNo`, and `arcTitle`.
- Prompt outputs use explicit machine-readable markers consumed by Task 3.

- [ ] Write failing source/behavior tests for Chinese and English chat language, new stage names/order, novel-vs-screenplay format requirements, optional translation, and paired localization sections.
- [ ] Run focused tests; expect failures.
- [ ] Implement prompt copy and task routing while preserving all legacy task types.
- [ ] Ensure screenplay prompts request structure, not three separately invented drafts.
- [ ] Rerun focused tests; expect all passing.
- [ ] Commit `Update creation workflow AI prompts`.

### Task 5: Deterministic Document Assembly and Real DOCX/ZIP Export

**Files:**
- Create: `lib/creation/assembly.ts`
- Create: `lib/creation/downloads.ts`
- Modify: `package.json`
- Modify: `package-lock.json` or active lockfile
- Test: `tests/creation-assembly.test.mjs`

**Interfaces:**
- Produces `assembleNovel(workspace, variant): AssembledDocument`.
- Produces `assembleScreenplay(workspace, variant, format): AssembledDocument`.
- Produces `buildDeliveryManifest(project, workspace): DeliveryItem[]`.
- Produces browser functions `downloadMarkdown`, `downloadDocx`, and `downloadDeliveryZip`.

- [ ] Write failing tests for arc/unit ordering, duplicate-title removal, missing-unit diagnostics, bilingual paragraph pairing, screenplay renumbering, dynamic language filenames, and omission of empty translation files.
- [ ] Run focused tests; expect missing-module failure.
- [ ] Install `docx` and `jszip`; do not add a PDF dependency.
- [ ] Implement pure assembly and manifest functions first.
- [ ] Implement true Open XML DOCX generation and ZIP packaging of Markdown, DOCX, manifest, localization changes, and similarity report.
- [ ] Rerun focused tests; expect all passing.
- [ ] Commit `Add deterministic creation delivery exports`.

### Task 6: Seven-Stage Workbench UI and Per-Unit Editing

**Files:**
- Modify: `app/novel-workbench/page.tsx`
- Modify: `app/globals.css`
- Test: `tests/creation-workbench-ui.test.mjs`

**Interfaces:**
- Consumes Tasks 1–5 domain, parser, formatter, assembly, and download APIs.
- Keeps `/novel-workbench` and the 38/62 shell.

- [ ] Write failing UI source tests for exact seven tabs, no unwanted “novel” labels, localized opening messages, separate novel/script stores, language controls, screenplay format selector, current-unit and current-arc generation, localization view toggle, and MD/DOCX/ZIP export actions.
- [ ] Run focused tests; expect failures.
- [ ] Replace the current stage tab model with the approved seven stages.
- [ ] Add editable arc/unit navigation, status/lock controls, one-unit default generation, and current-arc generation.
- [ ] Add novel/script mode controls and the correct language controls for each mode.
- [ ] Add screenplay format rendering/validation without AI regeneration.
- [ ] Add optional translation, paired localization views, and deterministic export panel.
- [ ] Keep upload, Universe, art, and production handoff controls functional.
- [ ] Rerun focused tests and TypeScript; expect passing.
- [ ] Commit `Upgrade creation workbench workflow`.

### Task 7: Handoff Compatibility and End-to-End Verification

**Files:**
- Modify: `lib/creative-handoff.ts`
- Modify: `lib/creative-handoff.test.ts`
- Modify: `components/art/ArtWorkbench.tsx` only if field labels require compatibility.
- Modify: `components/production/ProductionWorkbench.tsx` only if structured screenplay selection requires compatibility.
- Modify: `docs/DEV_HANDOFF_LOG.md`

**Interfaces:**
- `buildCreativeHandoffPackage` selects reviewed/locked assembled content from V2 and falls back to legacy fields.
- Downstream workbenches continue receiving source project ID and Universe ID.

- [ ] Extend handoff tests for novel and screenplay V2 content while preserving legacy fallback.
- [ ] Implement the smallest compatibility changes required.
- [ ] Run all Node tests and TypeScript.
- [ ] Run production build and confirm all routes generate.
- [ ] Start the local production server and verify desktop 1440×900 and mobile 390×844: localized chat, seven stages, unit editing, three screenplay formats, optional translation, localization views, exports, and downstream handoffs.
- [ ] Confirm browser console has zero errors and no overlap/overflow.
- [ ] Update `docs/DEV_HANDOFF_LOG.md` with scope, files, tests, commit, risks, and next steps.
- [ ] Commit `Complete creation workbench V2`.

### Task 8: Integrate and Publish

**Files:**
- No product-file changes unless latest `main` creates a real conflict.

- [ ] Fetch latest `origin/main`.
- [ ] Rebase or merge the feature branch without force-pushing and preserve colleague commits.
- [ ] Rerun focused unit tests, full TypeScript, and production build after integration.
- [ ] Push the verified feature commit to GitHub `main` as requested.
- [ ] Verify remote `main` contains the resulting commit.

