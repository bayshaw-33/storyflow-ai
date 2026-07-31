# Creation Workbench Recovery and Finalize Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the latest generated manuscript across devices, support explicit unfinalize-and-edit cascading, simplify redundant controls, and keep screenplay terminology episode-based.

**Architecture:** Extend the existing `CreationWorkspaceV2.settings` JSON with optional last-position metadata. The workbench records position/content changes through the existing project persistence path and hydrates the saved position with a deterministic fallback to the latest non-empty unit. State helpers own unfinalize cascade semantics; the component only wires buttons and navigation.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase JSON project rows, Node test runner.

## Global Constraints

- Reuse `creationWorkspace` cloud JSON; do not add a database table or migration.
- Preserve manuscript content and version history when unfinalizing.
- Downstream stages must remain blocked until regenerated/refinalized.
- Remove only the redundant “创作流程” and duplicate content-pane “AI 生成” controls; keep the AI panel generator and mode data.
- Screenplay UI uses “集”; novel UI keeps “章/卷” semantics.

### Task 1: Add persisted last-position metadata and state helpers

**Files:**
- Modify: `/Volumes/Kiikis2026/storyflow-ai/lib/creation/types.ts`
- Modify: `/Volumes/Kiikis2026/storyflow-ai/lib/creation/state.ts`
- Test: `/Volumes/Kiikis2026/storyflow-ai/tests/creation-state.test.mjs`

**Interfaces:**
- Add optional `lastMode`, `lastView`, `lastUnitId`, and `lastUnitUpdatedAt` to `CreationWorkspaceV2.settings`.
- Export `recordCreationPosition(workspace, position)` and `unfinalizeDocument(workspace, docKey)` helpers.
- Export `unfinalizeEpisodePlan(workspace, mode)` and `unfinalizeUnit(workspace, mode, unitId)` helpers.

- [ ] Write tests covering normalization of missing metadata, position recording, document cascade, plan cascade, and unit content preservation.
- [ ] Run `node --import tsx --test tests/creation-state.test.mjs` and confirm the new tests fail before implementation.
- [ ] Implement the smallest immutable helpers, reusing `downgradeAllTracks` and existing status normalization.
- [ ] Run the focused state tests and confirm they pass.
- [ ] Commit the state changes and tests.

### Task 2: Restore the latest generated/edited unit on hydration

**Files:**
- Modify: `/Volumes/Kiikis2026/storyflow-ai/components/creation/CreationWorkbench.tsx`
- Modify: `/Volumes/Kiikis2026/storyflow-ai/lib/creation/state.ts`
- Test: `/Volumes/Kiikis2026/storyflow-ai/tests/creation-workbench-ui.test.mjs`

**Interfaces:**
- Add a component-local `restoreCreationPosition(project)` routine that validates saved mode/unit and falls back to the newest non-empty unit by `updatedAt`.
- Record position through `recordCreationPosition` whenever mode, view, active unit, generation, or manuscript edit changes.

- [ ] Add source assertions for persisted position fields, hydration restore, and newest-non-empty fallback.
- [ ] Run the focused UI test and confirm it fails.
- [ ] Hydrate `activeMode`, `view`, and `activeUnitId` from saved metadata after `projectReady`; use the fallback only when no valid saved position exists.
- [ ] Save the updated workspace via `ensureProjectPersisted`/`saveProject` without changing the Supabase row shape.
- [ ] Run focused UI and state tests.
- [ ] Commit the recovery behavior.

### Task 3: Wire explicit unfinalize-and-edit controls and simplify UI

**Files:**
- Modify: `/Volumes/Kiikis2026/storyflow-ai/components/creation/CreationWorkbench.tsx`
- Modify: `/Volumes/Kiikis2026/storyflow-ai/tests/creation-workbench-ui.test.mjs`

**Interfaces:**
- Replace finalized document/plan/unit button behavior with `unfinalizeDocument`, `unfinalizeEpisodePlan`, and `unfinalizeUnit` calls.
- Keep existing scene-level toggle behavior.

- [ ] Add UI source assertions for “取消定稿并修改”, absence of the top “创作流程” menu, and absence of the duplicate content-pane “AI 生成” button.
- [ ] Run focused UI tests and confirm the new assertions fail.
- [ ] Add the explicit unfinalize button states, preserving content and versions, and save the resulting project.
- [ ] Remove only the redundant controls; leave AI panel generation and necessary mode/unit navigation intact.
- [ ] Run focused UI tests and confirm they pass.
- [ ] Commit the UI behavior.

### Task 4: Normalize screenplay terminology and regression coverage

**Files:**
- Modify: `/Volumes/Kiikis2026/storyflow-ai/components/creation/CreationWorkbench.tsx`
- Modify: `/Volumes/Kiikis2026/storyflow-ai/tests/creation-workbench-ui.test.mjs`

- [ ] Add assertions that screenplay labels use “集/第 N 集” and novel-only volume labels remain mode-gated.
- [ ] Replace any screenplay-path “卷” wording with episode wording while leaving novel arc labels unchanged.
- [ ] Run the full creation test set: `node --import tsx --test tests/creation-*.test.mjs`.
- [ ] Run `npm run build` from `/Volumes/Kiikis2026/storyflow-ai`.
- [ ] Commit terminology and final regression coverage.

## Self-review checklist

- Recovery metadata, fallback, and save path are covered by Tasks 1–2.
- Document/plan/unit unfinalize semantics and downstream gating are covered by Tasks 1 and 3.
- UI removals are covered by Task 3.
- Screenplay terminology and full verification are covered by Task 4.
- No new database schema or speculative refactor is included.
