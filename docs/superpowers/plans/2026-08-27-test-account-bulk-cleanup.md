# Test Account Bulk Project Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-confirmation, multi-select project cleanup tool available only to `bayshaw33@gmail.com`, including removal of exclusive empty Universes.

**Architecture:** Keep the ordinary project lifecycle unchanged. Add one server-only cleanup service and one hidden API route that enforce the exact test email and owner scope, then add selection mode to the existing project-management grid. Primary and child-source deletions reuse their existing table identities; empty-Universe cleanup is evaluated only after successful primary-project deletion.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase REST/service role, CSS Modules, `node:test`, Playwright.

## Global Constraints

- The cleanup entry is visible only to `bayshaw33@gmail.com`.
- The server is authoritative and returns `404` to every other account.
- The user selects exact project identities; no project is selected or deleted automatically.
- One batch has one confirmation and no per-project preflight.
- Every read and delete remains scoped to the authenticated owner ID.
- Delete an associated Universe only when it is owned by the test account, has no surviving project links or content, and is neither shared nor published.
- Never disable immutable-history triggers. A selected project blocked by immutable history remains in the failed result.
- Do not modify the ordinary archive and safe-delete flows.

---

### Task 1: Add the test-account cleanup service

**Files:**
- Create: `lib/server/v2/project-library/test-cleanup.ts`
- Create: `tests/server-v2/project-library/test-account-cleanup.test.mjs`

**Interfaces:**
- Produces: `TEST_CLEANUP_EMAIL`, `isTestCleanupEmail(email)`, `normalizeTestCleanupSelections(value)`, and `deleteTestAccountProjects(fetcher, ownerId, selections)`.
- `deleteTestAccountProjects` returns `{ deleted, failed, deletedUniverseIds, storageWarnings }`.

- [ ] **Step 1: Write failing validation and authorization tests**

```js
import {
  isTestCleanupEmail,
  normalizeTestCleanupSelections,
} from "../../../lib/server/v2/project-library/test-cleanup.ts";

test("only the configured test email can use bulk cleanup", () => {
  assert.equal(isTestCleanupEmail("BAYSHAW33@gmail.com"), true);
  assert.equal(isTestCleanupEmail("other@example.com"), false);
});

test("cleanup selections are unique, typed and bounded", () => {
  assert.deepEqual(normalizeTestCleanupSelections([
    { source: "project", sourceId: "p-1" },
    { source: "project", sourceId: "p-1" },
    { source: "art", sourceId: "a-1" },
  ]), [
    { source: "project", sourceId: "p-1" },
    { source: "art", sourceId: "a-1" },
  ]);
  assert.throws(() => normalizeTestCleanupSelections([]), /INVALID_TEST_CLEANUP_SELECTIONS/);
  assert.throws(() => normalizeTestCleanupSelections([{ source: "unknown", sourceId: "x" }]), /INVALID_TEST_CLEANUP_SELECTIONS/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/server-v2/project-library/test-account-cleanup.test.mjs`

Expected: FAIL because `test-cleanup.ts` does not exist.

- [ ] **Step 3: Implement selection validation**

```ts
import type { ProjectLibraryFetcher } from "./index.ts";
import { projectLibraryTable } from "./lifecycle.ts";
import type { ProjectLibrarySource } from "../../../client/v2/project-library/types.ts";

export const TEST_CLEANUP_EMAIL = "bayshaw33@gmail.com";
const SOURCES = new Set<ProjectLibrarySource>(["project", "production", "art", "viral"]);

export type TestCleanupSelection = { source: ProjectLibrarySource; sourceId: string };
export type TestCleanupFailure = TestCleanupSelection & { error: string };
export type TestCleanupResult = {
  deleted: TestCleanupSelection[];
  failed: TestCleanupFailure[];
  deletedUniverseIds: string[];
  storageWarnings: string[];
};

export function isTestCleanupEmail(email: string) {
  return email.trim().toLowerCase() === TEST_CLEANUP_EMAIL;
}

export function normalizeTestCleanupSelections(value: unknown): TestCleanupSelection[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 200) throw new Error("INVALID_TEST_CLEANUP_SELECTIONS");
  const unique = new Map<string, TestCleanupSelection>();
  for (const item of value) {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const source = row.source as ProjectLibrarySource;
    const sourceId = typeof row.sourceId === "string" ? row.sourceId.trim() : "";
    if (!SOURCES.has(source) || !sourceId || sourceId.length > 200) throw new Error("INVALID_TEST_CLEANUP_SELECTIONS");
    unique.set(`${source}:${sourceId}`, { source, sourceId });
  }
  return [...unique.values()];
}
```

- [ ] **Step 4: Add failing owner-scope, batch and Universe tests**

Use a recording fake fetcher that returns one owned primary row, its linked Universe, and returned representations for deletes. Assert:

```js
const result = await deleteTestAccountProjects(fetcher, "owner-1", [
  { source: "project", sourceId: "p-1" },
  { source: "art", sourceId: "a-1" },
  { source: "viral", sourceId: "foreign" },
]);
assert.deepEqual(result.deleted, [
  { source: "project", sourceId: "p-1" },
  { source: "art", sourceId: "a-1" },
]);
assert.equal(result.failed[0].sourceId, "foreign");
assert.deepEqual(result.deletedUniverseIds, ["u-empty"]);
assert.ok(calls.every((path) => !path.includes("owner-2")));
assert.ok(calls.some((path) => path.includes("storyflow_generation_jobs")));
assert.ok(calls.some((path) => path.includes("storyflow_assets")));
```

Add separate fixtures showing that a Universe with a surviving link, entity, `share_status=shared`, or foreign owner is preserved.

- [ ] **Step 5: Implement owner-scoped deletion and empty-Universe checks**

Implement these private helpers in `test-cleanup.ts`:

```ts
async function readOwnedRow(fetcher, ownerId, selection): Promise<Record<string, unknown> | null>;
async function deletePrimaryProject(fetcher, ownerId, sourceId): Promise<{ deleted: boolean; universeIds: string[]; storagePaths: string[] }>;
async function deleteChildProject(fetcher, ownerId, selection): Promise<boolean>;
async function deleteUniverseIfEmpty(fetcher, ownerId, universeId): Promise<boolean>;
```

`deletePrimaryProject` must read the owned row first, collect Universe links and storage paths, delete non-FK project records in this order, then delete the parent with `Prefer: return=representation`:

```ts
const PROJECT_SCOPED_TABLES = [
  { table: "storyflow_generation_jobs", owner: "owner_id" },
  { table: "storyflow_generations", owner: "user_id" },
  { table: "storyflow_versions", owner: "user_id" },
  { table: "storyflow_assets", owner: "user_id" },
] as const;
```

Delete `storyflow_generation_tasks` separately with the same `user_id` owner scope and an OR filter covering both legacy project identity columns (`project_id` and `project_ref`).

`deleteUniverseIfEmpty` must query the owned Universe and require `share_status !== "shared"`, then require zero rows in:

```ts
const UNIVERSE_CONTENT_TABLES = [
  "storyflow_universe_project_links",
  "storyflow_universe_entities",
  "storyflow_universe_inbox_items",
  "storyflow_universe_relationships",
  "storyflow_universe_timeline_events",
  "storyflow_canon_facts",
  "storyflow_canon_check_reports",
  "storyflow_canon_state_snapshots",
  "storyflow_character_appearance_variants",
  "storyflow_art_projects",
  "storyflow_art_publications",
] as const;
```

Delete the Universe with both `id` and `user_id` filters and accept success only when exactly one row is returned.

- [ ] **Step 6: Run service tests and verify GREEN**

Run: `node --test tests/server-v2/project-library/test-account-cleanup.test.mjs tests/server-v2/project-library/project-library.test.mjs`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add lib/server/v2/project-library/test-cleanup.ts tests/server-v2/project-library/test-account-cleanup.test.mjs
git commit -m "feat(project-library): add test cleanup service"
```

### Task 2: Add the hidden API and typed client adapter

**Files:**
- Create: `app/api/v2/project-library/test-cleanup/route.ts`
- Modify: `lib/client/v2/project-library/types.ts`
- Modify: `lib/client/v2/project-library/api.ts`
- Modify: `tests/server-v2/project-library/test-account-cleanup.test.mjs`

**Interfaces:**
- Consumes: Task 1 `isTestCleanupEmail`, `normalizeTestCleanupSelections`, `deleteTestAccountProjects`.
- Produces: `deleteTestProjectsFromLibrary(accessToken, projects): Promise<TestCleanupResult>`.

- [ ] **Step 1: Write failing route-contract tests**

```js
const route = readFileSync("app/api/v2/project-library/test-cleanup/route.ts", "utf8");
assert.match(route, /authenticateRequest/);
assert.match(route, /isTestCleanupEmail\(user\.email\)/);
assert.match(route, /status:\s*404/);
assert.match(route, /deleteTestAccountProjects/);
assert.doesNotMatch(route, /getProjectDeletePreflight/);
```

- [ ] **Step 2: Run route tests and verify RED**

Run: `node --test tests/server-v2/project-library/test-account-cleanup.test.mjs`

Expected: FAIL because the route is missing.

- [ ] **Step 3: Implement the route**

```ts
export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!isTestCleanupEmail(user.email)) return NextResponse.json({ success: false }, { status: 404 });
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");
    const body = await request.json().catch(() => ({})) as { projects?: unknown };
    const projects = normalizeTestCleanupSelections(body.projects);
    const result = await deleteTestAccountProjects(serviceFetch, user.id, projects);
    return NextResponse.json({ success: result.deleted.length > 0, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_TEST_CLEANUP_SELECTIONS") {
      return NextResponse.json({ success: false, error: "请选择有效的测试项目。", code: "invalid_selection" }, { status: 422 });
    }
    return NextResponse.json({ success: false, error: "测试项目清理失败。", code: "cleanup_failed" }, { status: 503 });
  }
}
```

- [ ] **Step 4: Add client result types and adapter**

Add to `types.ts`:

```ts
export type TestCleanupSelection = { source: ProjectLibrarySource; sourceId: string };
export type TestCleanupResult = {
  deleted: TestCleanupSelection[];
  failed: Array<TestCleanupSelection & { error: string }>;
  deletedUniverseIds: string[];
  storageWarnings: string[];
};
```

Add to `api.ts`:

```ts
export async function deleteTestProjectsFromLibrary(accessToken: string, projects: TestCleanupSelection[]): Promise<TestCleanupResult> {
  const response = await fetch("/api/v2/project-library/test-cleanup", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ projects }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(body.deleted) || !Array.isArray(body.failed)) {
    throw new ProjectLibraryClientError(body?.error || "测试项目清理失败。", response.status);
  }
  return body as TestCleanupResult;
}
```

- [ ] **Step 5: Run server tests and TypeScript**

Run: `node --test tests/server-v2/project-library/test-account-cleanup.test.mjs && pnpm exec tsc --noEmit`

Expected: tests pass and TypeScript exits 0.

- [ ] **Step 6: Commit**

```bash
git add app/api/v2/project-library/test-cleanup/route.ts lib/client/v2/project-library/types.ts lib/client/v2/project-library/api.ts tests/server-v2/project-library/test-account-cleanup.test.mjs
git commit -m "feat(project-library): expose test cleanup endpoint"
```

### Task 3: Add one-confirmation multi-select cleanup UI

**Files:**
- Modify: `components/v2/dashboard/DashboardClient.tsx`
- Modify: `components/v2/dashboard/ProjectManagement.tsx`
- Modify: `components/v2/dashboard/dashboard.module.css`
- Modify: `tests/ui-v2/dashboard/dashboard.test.mjs`

**Interfaces:**
- Consumes: Task 2 `deleteTestProjectsFromLibrary` and `TestCleanupSelection`.
- `ProjectManagement` receives `userEmail: string` in addition to `accessToken`.

- [ ] **Step 1: Write failing UI source-contract tests**

```js
assert.match(clientSrc, /userEmail=\{session\?\.user\?\.email\s*\|\|\s*["']["']\}/);
assert.match(managementSrc, /bayshaw33@gmail\.com/);
assert.match(managementSrc, /清理测试项目/);
assert.match(managementSrc, /全选当前结果/);
assert.match(managementSrc, /删除所选项目/);
assert.match(managementSrc, /deleteTestProjectsFromLibrary/);
assert.match(managementSrc, /window\.confirm/);
```

- [ ] **Step 2: Run UI tests and verify RED**

Run: `node --test tests/ui-v2/dashboard/dashboard.test.mjs`

Expected: FAIL on the missing cleanup controls.

- [ ] **Step 3: Pass the account email and add selection state**

Change the render call:

```tsx
return <ProjectManagement accessToken={session?.access_token || ""} userEmail={session?.user?.email || ""} />;
```

In `ProjectManagement.tsx` add:

```ts
const testCleanupEnabled = userEmail.trim().toLowerCase() === "bayshaw33@gmail.com";
const [testCleanupMode, setTestCleanupMode] = useState(false);
const [selectedProjectKeys, setSelectedProjectKeys] = useState<Set<string>>(new Set());
const [testCleanupBusy, setTestCleanupBusy] = useState(false);
const [testCleanupNotice, setTestCleanupNotice] = useState("");
```

Add `toggleTestCleanupSelection(project)`, `selectAllVisibleTestProjects()`, `exitTestCleanupMode()`, and `handleTestCleanupDelete()` helpers. The delete handler must call `window.confirm` exactly once per batch, send selected source identities, remove only returned successes, call `deleteProject(id)` only for successful primary projects, and keep failures selected.

- [ ] **Step 4: Add toolbar, card checkboxes and sticky action bar**

Render the account-gated toolbar button:

```tsx
{testCleanupEnabled ? (
  <button type="button" className={styles.archiveToggle} onClick={() => testCleanupMode ? exitTestCleanupMode() : setTestCleanupMode(true)}>
    {testCleanupMode ? "退出清理" : "清理测试项目"}
  </button>
) : null}
```

When cleanup mode is active, prevent the card link's default navigation and toggle selection. Add a controlled checkbox with `aria-label`. Render:

```tsx
<div className={styles.testCleanupBar}>
  <strong>已选择 {selectedProjectKeys.size} 个项目</strong>
  <button type="button" onClick={selectAllVisibleTestProjects}>全选当前结果</button>
  <button type="button" onClick={() => setSelectedProjectKeys(new Set())}>取消全选</button>
  <button type="button" className={styles.testCleanupDelete} onClick={() => void handleTestCleanupDelete()} disabled={!selectedProjectKeys.size || testCleanupBusy}>
    {testCleanupBusy ? "正在删除…" : "删除所选项目"}
  </button>
</div>
```

- [ ] **Step 5: Add scoped CSS**

Add styles for `.testCleanupCheckbox`, `.testCleanupSelected`, `.testCleanupBar`, and `.testCleanupDelete`. The bar is sticky at the viewport bottom, remains inside the project-management container, and stacks safely below 720px.

- [ ] **Step 6: Run UI and project-library tests**

Run:

```bash
node --test \
  tests/ui-v2/dashboard/dashboard.test.mjs \
  tests/ui-v2/project-library/project-library-lifecycle.test.mjs \
  tests/server-v2/project-library/project-library.test.mjs \
  tests/server-v2/project-library/test-account-cleanup.test.mjs
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add components/v2/dashboard/DashboardClient.tsx components/v2/dashboard/ProjectManagement.tsx components/v2/dashboard/dashboard.module.css tests/ui-v2/dashboard/dashboard.test.mjs
git commit -m "feat(dashboard): add test project cleanup mode"
```

### Task 4: Verify, integrate and release

**Files:**
- Modify: only files required to fix failures directly caused by Tasks 1-3.

**Interfaces:**
- Produces a production-ready `main` commit and Vercel deployment.

- [ ] **Step 1: Run focused and regression tests**

```bash
node --test \
  tests/server-v2/project-library/test-account-cleanup.test.mjs \
  tests/server-v2/project-library/project-library.test.mjs \
  tests/ui-v2/project-library/project-library-lifecycle.test.mjs \
  tests/ui-v2/dashboard/dashboard.test.mjs
```

Expected: zero failures.

- [ ] **Step 2: Run production validation**

```bash
pnpm exec tsc --noEmit
pnpm build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Run browser acceptance**

Verify in an authenticated test-account browser:

1. `bayshaw33@gmail.com` sees `清理测试项目`.
2. Another account does not see it and receives `404` from the endpoint.
3. Select two disposable projects, confirm once, and verify both cards disappear.
4. Verify an exclusive empty Universe disappears and a non-empty/shared Universe remains.

- [ ] **Step 4: Rebase onto current `origin/main` without touching the dirty canonical checkout**

```bash
git fetch origin main
git rebase origin/main
```

Expected: the feature branch contains current production main plus the cleanup commits.

- [ ] **Step 5: Push and deploy**

```bash
git push origin HEAD:main
vercel --prod --yes
```

Expected: GitHub `main` points to the verified commit; Vercel reports `READY` and aliases `https://www.kiikis.com`.
