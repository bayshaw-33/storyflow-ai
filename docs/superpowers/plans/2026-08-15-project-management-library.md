# Project Management Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixture-driven dashboard project area with a real project-management library whose primary view is a responsive project-card grid and whose secondary work information is shown in compact tables, while preserving the existing new-project entry behavior and adding the confirmed eighth adaptation entry.

**Architecture:** Keep `/dashboard` as the left-navigation project-management route. Load visible legacy projects from the existing Supabase project adapter, normalize filtering/sorting/navigation in a browser-safe helper, and render a focused project library component. Load jobs and KK confirmations through their existing real APIs; an unavailable secondary service produces an explicit empty/error state and never fake rows.

**Tech Stack:** Next.js App Router, React client components, TypeScript, CSS Modules, Supabase REST adapter, `node:test`.

## Global Constraints

- Keep the homepage Hero and the existing `新建项目` → `/projects/new-v2` behavior unchanged.
- Keep the entry page free of a free-text input, file input, and novel module.
- The entry page must expose exactly 8 modules: 剧本、歌曲、美术、分镜、视频、配音、剪辑、改编.
- The project-management page must read real user-scoped projects; production must not show fixture projects as a silent fallback.
- Retired novel rows remain excluded from active UI by structured markers only; this task performs no database deletion.
- Preserve legacy project IDs and route each visible project to its existing workbench.
- Do not modify package.json, pnpm-lock.yaml, middleware.ts, app/layout.tsx, or production database data.
- Keep `contract_version` values unchanged.

---

### Task 1: Add the confirmed eighth adaptation entry

**Files:**
- Modify: `lib/contracts/v2/work.ts`
- Modify: `lib/client/v2/project-start/helpers.ts`
- Modify: `components/v2/project-start/ProjectStartFlow.tsx`
- Modify: `lib/client/v2/project-start/types.ts`
- Test: `tests/ui-v2/project-start/project-start.test.mjs`

**Interfaces:**
- Existing seven `WorkType` values continue to use `POST /api/v2/project-start`.
- Adaptation is a legacy route entry and must navigate to `/viral-workbench?setup=1`; it does not expand the server WorkType RPC in this task.

- [ ] **Step 1: Write the failing test**

Add assertions that the card metadata contains exactly eight visible cards, includes `viral`/改编, and keeps novel absent. Add a source assertion that the adaptation card routes to `/viral-workbench?setup=1`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/ui-v2/project-start/project-start.test.mjs`

Expected: FAIL because the current metadata contains seven cards and no adaptation route.

- [ ] **Step 3: Implement the minimal entry change**

Add a card-only route discriminator to the browser-safe metadata, render a Flame icon for the eighth card, and make `ProjectStartFlow` navigate directly for that card while retaining the existing atomic project-start call for the seven V2 WorkTypes.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `node --test tests/ui-v2/project-start/project-start.test.mjs tests/screenplay-entry-routing.test.mjs`

Expected: all focused entry and routing tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/contracts/v2/work.ts lib/client/v2/project-start/helpers.ts lib/client/v2/project-start/types.ts components/v2/project-start/ProjectStartFlow.tsx tests/ui-v2/project-start/project-start.test.mjs
git commit -m "feat(v2.2): restore eighth adaptation entry"
```

### Task 2: Create tested project-library query and navigation helpers

**Files:**
- Create: `lib/client/v2/project-library/helpers.ts`
- Create: `tests/ui-v2/project-library/project-library.test.mjs`

**Interfaces:**
- `ProjectLibraryFilters = { query: string; workflow: string; status: string; universe: "all" | "bound" | "unbound"; sort: "updated" | "created" | "title" }`.
- `filterAndSortProjects(projects, filters): DramaProject[]` excludes structured retired-novel records and never excludes a non-novel project because its progress is empty.
- `getProjectWorkbenchHref(project): string` returns a same-origin workbench URL while preserving the project ID.
- `getProjectProgress(project): number | null` returns null when no meaningful workflow total exists.

- [ ] **Step 1: Write failing tests**

Cover title search, workflow/status/Universe filters, updated/title sorting, retired novel exclusion, preservation of a draft screenplay with no completed steps, progress null for unknown totals, and route mapping for screenplay/song/storyboard/video/viral projects.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/ui-v2/project-library/project-library.test.mjs`

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement minimal pure helpers**

Reuse `isRetiredNovelProject`, `getCompletedStepCount`, and `getWorkflowSteps` from existing project code. Keep all filtering deterministic and case-insensitive; use the existing project workbench URL conventions.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/ui-v2/project-library/project-library.test.mjs`

Expected: all helper tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/client/v2/project-library/helpers.ts tests/ui-v2/project-library/project-library.test.mjs
git commit -m "feat(v2.2): add project library query helpers"
```

### Task 3: Replace the dashboard body with project cards and secondary tables

**Files:**
- Create: `components/v2/dashboard/ProjectManagement.tsx`
- Modify: `components/v2/dashboard/dashboard.module.css`
- Modify: `components/v2/dashboard/DashboardClient.tsx`
- Modify: `lib/client/v2/jobs/api.ts`
- Test: `tests/ui-v2/dashboard/dashboard.test.mjs`

**Interfaces:**
- `ProjectManagement` receives real `DramaProject[]`, `UnifiedJob[]`, and KK pending confirmations plus independent loading/error states.
- Project cards are the primary content and navigate through `getProjectWorkbenchHref`.
- Running jobs and confirmations render compact tables; unavailable secondary APIs render an explicit empty state, never fixture rows.

- [ ] **Step 1: Write failing source/UI contract tests**

Assert that the dashboard source renders `ProjectManagement`, the project management component contains a project-card grid and table elements for secondary content, and the project list is loaded through `readProjectsFromSupabase`. Assert that the production default for jobs is fail-closed rather than fixture-on.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/ui-v2/dashboard/dashboard.test.mjs`

Expected: FAIL because the current dashboard renders the fixture-oriented Command sections and has no project-card grid/table layout.

- [ ] **Step 3: Implement the project-management component**

Build a responsive dark UI with:

```text
项目管理                         [新建项目]
[搜索] [类型] [状态] [Universe] [排序]
我的项目
[project card] [project card] [project card]
运行中任务       <table>
待确认事项       <table>
```

Use real project titles, workflow labels, stage, status, Universe state, updated time, and only meaningful progress. Keep keyboard focus, responsive columns, and visible empty/error states.

- [ ] **Step 4: Wire real data and remove production fixture fallback**

Load projects with `readProjectsFromSupabase({ accessToken })`, jobs through the existing `/api/v2/jobs` adapter, and confirmations through `fetchKkRuntime`. Keep fixture data available only for explicit preview tests; normal authenticated `/dashboard` must not silently call `loadDashboardFixture`.

- [ ] **Step 5: Run dashboard and adapter tests**

Run: `node --test tests/ui-v2/dashboard/dashboard.test.mjs tests/ui-v2/task-center/api-adapter.test.mjs tests/ui-v2/project-library/project-library.test.mjs`

Expected: all tests pass with zero failures.

- [ ] **Step 6: Commit**

```bash
git add components/v2/dashboard/ProjectManagement.tsx components/v2/dashboard/dashboard.module.css components/v2/dashboard/DashboardClient.tsx lib/client/v2/jobs/api.ts tests/ui-v2/dashboard/dashboard.test.mjs
git commit -m "feat(v2.2): redesign dashboard project management"
```

### Task 4: Verify visual behavior, routing, and regression safety

**Files:**
- Modify: `tests/ui-v2/project-start/project-start.test.mjs` only if Task 1 exposes a missing contract assertion.
- Modify: `tests/ui-v2/dashboard/dashboard.test.mjs` only if Task 3 exposes a missing contract assertion.

- [ ] **Step 1: Run the focused unit suite**

Run: `node --test tests/ui-v2/dashboard/dashboard.test.mjs tests/ui-v2/project-library/project-library.test.mjs tests/ui-v2/project-start/project-start.test.mjs tests/screenplay-entry-routing.test.mjs tests/kiikis-21-runtime-mode.test.mjs`

- [ ] **Step 2: Run TypeScript validation**

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 3: Run the production build**

Run: `pnpm build`

Expected: successful build with no TypeScript or asset validation errors.

- [ ] **Step 4: Run the Chromium E2E suite when the local app is available**

Run: `pnpm test:e2e:chromium`

Expected: existing E2E tests pass; if the environment cannot start the app, record the exact blocker without claiming E2E success.

- [ ] **Step 5: Inspect the final diff and commit**

Run: `git diff --check && git status --short && git log --oneline -5`, then commit any test-only correction with a focused message.

