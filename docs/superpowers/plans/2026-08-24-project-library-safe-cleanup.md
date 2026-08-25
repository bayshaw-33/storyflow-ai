# Project Library Safe Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let creators archive or safely remove their own empty test projects without risking meaningful creative work.

**Architecture:** Add an owner-scoped lifecycle service for preflight, archive/restore, and verified deletion. The existing project-library route delegates to that service; the dashboard asks for preflight before it exposes permanent deletion. Primary projects use `deleted_at`; child-source records remain permanent-delete-only after a source-specific preflight.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase REST, CSS Modules, node:test.

## Global Constraints

- Never mutate production data automatically.
- Every read and mutation is authenticated-owner scoped.
- Primary list queries include `deleted_at=is.null`.
- Deletion requests a returned representation and accepts exactly one returned row.
- Any creative content, screenplay unit, generation task, asset, or Universe link makes a primary project archive-only; an empty primary Work identity alone remains removable with its project.
- Do not stage or modify `docs/KIIKIS_CODEX_ONBOARDING_V2.2.md`.

---

### Task 1: Add lifecycle preflight service

**Files:**
- Create: `lib/server/v2/project-library/lifecycle.ts`
- Modify: `lib/server/v2/project-library/index.ts`
- Modify: `tests/server-v2/project-library/project-library.test.mjs`

**Interfaces:**
- `getProjectDeletePreflight(fetcher, ownerId, input)` returns `safe_to_delete`, `archive_only`, or `not_found`, plus title, reason, and related counts.

- [x] **Step 1: Write failing tests**

Test that the primary query contains `deleted_at=is.null`; an owned empty primary project returns `safe_to_delete`; a screenplay-content project returns `archive_only`; a foreign or absent project returns `not_found`.

- [x] **Step 2: Verify the red state**

Run `node --test tests/server-v2/project-library/project-library.test.mjs`. The new lifecycle import and archived-row assertions must fail before implementation.

- [x] **Step 3: Write minimal implementation**

Read one owner-scoped row per source. For a primary project, detect populated `idea`, `brief`, `characters`, `outline`, `episodes`, and `finalScript`; count `storyflow_works`, `storyflow_screenplay_units`, `storyflow_generation_tasks`, `storyflow_assets`, and `storyflow_universe_project_links`. An empty primary Work identity is allowed; creative content or any other relation returns `archive_only`.

- [x] **Step 4: Verify the green state**

Run `node --test tests/server-v2/project-library/project-library.test.mjs`. All focused server tests must pass.

- [x] **Step 5: Commit**

Commit the service, active-list filter, and server tests with `feat(project-library): add safe deletion preflight`.

### Task 2: Add lifecycle routes

**Files:**
- Modify: `app/api/v2/project-library/route.ts`
- Create: `app/api/v2/project-library/preflight-delete/route.ts`
- Modify: `lib/server/v2/project-library/lifecycle.ts`
- Modify: `tests/server-v2/project-library/project-library.test.mjs`

**Interfaces:**
- `PATCH /api/v2/project-library` accepts `archive` or `restore` for a primary project.
- `POST /api/v2/project-library/preflight-delete` returns a read-only preflight.
- `DELETE /api/v2/project-library` rejects `archive_only`, `not_found`, and zero affected rows.

- [x] **Step 1: Write failing route-contract tests**

Require the preflight route, PATCH handler, returned-row preference, and an exact-one-row guard.

- [x] **Step 2: Verify the red state**

Run `node --test tests/server-v2/project-library/project-library.test.mjs`. The current direct-delete route must fail the new contract.

- [x] **Step 3: Write minimal implementation**

Archive/restore only patches `storyflow_projects.deleted_at` and `updated_at` under an owner filter. Permanent delete calls preflight first, rejects archive-only data, sends `Prefer: return=representation`, and treats any response except exactly one row as failure.

- [x] **Step 4: Verify the green state**

Run `node --test tests/server-v2/project-library/project-library.test.mjs`. All focused server tests must pass.

- [x] **Step 5: Commit**

Commit routes, lifecycle changes, and tests with `feat(project-library): add archive and verified deletion`.

### Task 3: Add typed client APIs and cleanup controls

**Files:**
- Modify: `lib/client/v2/project-library/types.ts`
- Modify: `lib/client/v2/project-library/api.ts`
- Create: `lib/client/v2/project-library/lifecycle.ts`
- Modify: `components/v2/dashboard/ProjectManagement.tsx`
- Modify: `components/v2/dashboard/dashboard.module.css`
- Create: `tests/ui-v2/project-library/project-library-lifecycle.test.mjs`
- Modify: `tests/ui-v2/dashboard/dashboard.test.mjs`

**Interfaces:**
- `fetchProjectDeletePreflight(accessToken, project)` is read-only.
- `archiveProjectFromLibrary(accessToken, project, action)` performs archive/restore.
- Project card actions live under `更多`; permanent deletion is visible only after a safe preflight.

- [x] **Step 1: Write failing client and UI tests**

Assert safe candidates label `可永久删除`, linked candidates label `建议归档`, the dashboard calls preflight and archive adapters, and the old direct `window.confirm` deletion no longer appears.

- [x] **Step 2: Verify the red state**

Run `node --test tests/ui-v2/project-library/project-library-lifecycle.test.mjs tests/ui-v2/dashboard/dashboard.test.mjs`. The lifecycle module and safe menu contracts must fail.

- [x] **Step 3: Write minimal implementation**

Replace the visible delete button with `更多`. Archive confirms and then removes only the locally displayed active card after a successful API response. Permanent delete first renders preflight summary. Archive-only projects never receive a permanent-delete action. Do not add automatic batch actions, sharing, or pinning in this release.

- [x] **Step 4: Verify the green state**

Run `node --test tests/ui-v2/project-library/project-library-lifecycle.test.mjs tests/ui-v2/dashboard/dashboard.test.mjs`. All focused UI tests must pass.

- [x] **Step 5: Commit**

Commit adapters, dashboard controls, styles, and tests with `feat(dashboard): add safe project cleanup controls`.

### Task 4: Verify and prepare the read-only candidate review

**Files:**
- Modify: `docs/superpowers/specs/2026-08-24-project-library-safe-cleanup-design.md` only if implementation changes its approved contract.

- [x] **Step 1: Run the full focused suite**

Run the project-library server tests, project-library UI tests, lifecycle UI tests, and dashboard tests together. Expected: zero failures.

- [x] **Step 2: Run static and build validation**

Run `npx tsc --noEmit`, `pnpm build`, and `git diff --check`. Expected: each exits successfully.

- [ ] **Step 3: Inspect scope and commit**

Confirm only project-library routes/services/client code, dashboard code, tests, and this feature’s docs are staged. Keep the unrelated onboarding-file deletion unstaged. Commit with `feat(project-library): make test project cleanup safe`.

- [ ] **Step 4: Produce candidate list without mutation**

Before a production connection, run both required Supabase target guard commands. Fetch only owner-scoped candidate metadata and show exact IDs, titles, timestamps, content flags, and relation counts. Wait for the user’s explicit selection; this step never archives or deletes a production record.
