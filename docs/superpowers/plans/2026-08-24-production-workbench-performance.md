# Production Workbench Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce authenticated workbench first-open time without changing Kiikis project data or the current four-stage layout.

**Architecture:** Keep `/production` as the stable route. Split inactive stage modules at the client boundary, prevent duplicate project-context reads, restrict the downstream production gate to storyboard/video, and page conversation history newest-first through the existing screenplay API.

**Tech Stack:** Next.js 15, React 19, TypeScript, Supabase REST, node:test.

## Global Constraints

- Do not run migrations or change production data.
- Do not public-cache private project, Universe, screenplay, or conversation content.
- Preserve the four stages: script, art, storyboard, video.
- Preserve all existing KK messages; only change retrieval size and order.

---

### Task 1: Make inactive production stages lazy

**Files:**
- Modify: `components/production/ProductionWorkbench.tsx`
- Test: `tests/ui-v2/unified-workbench/performance.test.mjs`

- [ ] Write a failing source-contract test for `next/dynamic` stage imports.
- [ ] Run the focused test and verify it fails.
- [ ] Replace static screenplay/art/storyboard imports with typed dynamic imports and a small loading state.
- [ ] Run the focused test and verify it passes.

### Task 2: Remove redundant first-open requests

**Files:**
- Modify: `components/production/ProductionWorkbench.tsx`
- Test: `tests/ui-v2/unified-workbench/performance.test.mjs`

- [ ] Write failing tests for project-only context reload and storyboard/video-only gate checks.
- [ ] Run the focused test and verify it fails.
- [ ] Make the minimal effect-dependency and gate-scope changes.
- [ ] Run the focused test and verify it passes.

### Task 3: Page KK history

**Files:**
- Modify: `lib/server/v2/screenplays/generation.ts`
- Modify: `app/api/v2/works/[workId]/screenplay/discuss/route.ts`
- Modify: `lib/client/v2/screenplay-studio/api.ts`
- Modify: `components/v2/screenplay-studio/ScreenplayStudio.tsx`
- Modify: `components/v2/screenplay-studio/KkScreenplayRoom.tsx`
- Test: `tests/server-v2/screenplays/generation.test.mjs`
- Test: `tests/ui-v2/screenplay-studio/performance.test.mjs`

- [ ] Write failing tests for latest-first pagination and no-thread-write reads.
- [ ] Run the focused test and verify it fails.
- [ ] Add bounded recent-message pagination with an opaque created-at cursor.
- [ ] Update the studio to request 30 recent messages and prepend older pages only on explicit action.
- [ ] Run focused server and UI tests and verify they pass.

### Task 4: Verify and deliver

- [ ] Run relevant UI and server tests.
- [ ] Run TypeScript and production build.
- [ ] Compare the `/production` page chunk with the pre-change build output.
- [ ] Commit only performance files; leave unrelated onboarding deletion untouched.
