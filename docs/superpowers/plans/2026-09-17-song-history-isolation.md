# 音乐工作台生成历史隔离与删除 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate music generation history by project and add safe deletion of the current project's audio jobs and stored artifacts.

**Architecture:** Keep the existing audio job and signed-download pipeline. Add an optional project filter to the list route, require the song workbench to use that filter, and add an owner/project-scoped DELETE on the existing job route that removes storage, asset metadata, and the job row.

**Tech Stack:** Next.js App Router, React, Supabase service-role REST/Storage, Node built-in tests, Playwright.

## Global Constraints

- A new or unsaved project must never load another project's history.
- History deletion must be limited to the authenticated owner and requested project.
- The UI must confirm deletion and preserve the card on failure.
- Existing global song library/toolkit reads remain compatible.
- No secrets or provider URLs are exposed to the client.

---

### Task 1: Add failing regression coverage

**Files:**
- Create: `tests/song-audio-history-isolation.test.mjs`
- Modify: `tests/song-audio-contract.test.mjs`

- [ ] Assert the workbench sends `projectId` when loading audio jobs and clears history when the project is absent.
- [ ] Assert the list route supports a project filter and the job route exposes a scoped DELETE.
- [ ] Assert `AudioCandidates` exposes a delete callback and per-row delete action.
- [ ] Run the focused tests and verify they fail against the current implementation.

### Task 2: Scope list and delete server routes

**Files:**
- Modify: `app/api/audio/jobs/route.ts`
- Modify: `app/api/audio/jobs/[jobId]/route.ts`
- Test: `tests/song-audio-history-isolation.test.mjs`

- [ ] Add `project_id` to the job row shape and apply `projectId` to the list query when supplied.
- [ ] Return `projectId` in each list item.
- [ ] Add DELETE that authenticates, requires a project ID, verifies owner and project match, removes the Storage object, removes the owned audio asset row, then removes the job row.
- [ ] Return safe 404/502 errors without exposing provider or storage internals.
- [ ] Run the focused route tests and verify they pass.

### Task 3: Isolate the workbench and add delete UX

**Files:**
- Modify: `app/song-workbench/page.tsx`
- Modify: `components/song-workbench/AudioCandidates.tsx`
- Test: `tests/song-audio-history-isolation.test.mjs`

- [ ] Request `/api/audio/jobs?projectId=<songProjectId>` only when a project ID and session exist.
- [ ] Clear candidates whenever the project changes or no project ID exists.
- [ ] Add a confirmed delete handler that calls the scoped DELETE and removes the deleted candidate from local state.
- [ ] Add an accessible trash action to each history row and keep retry/download behavior intact.
- [ ] Run focused tests and a local Playwright smoke test for project isolation and delete control.

### Task 4: Verify and publish

**Files:**
- Modify: the design/plan docs only if verification changes an accepted detail.

- [ ] Run `node --test`, `pnpm exec tsc --noEmit --pretty false`, `pnpm build`, and `git diff --check`.
- [ ] Push `HEAD` to GitHub `main`.
- [ ] Deploy Vercel Production with the explicit project scope.
- [ ] Verify `/song-workbench` returns 200 and unauthenticated audio APIs remain 401.
