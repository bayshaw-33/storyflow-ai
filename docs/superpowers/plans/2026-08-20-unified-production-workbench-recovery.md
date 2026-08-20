# Unified Production Workbench Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore one production workbench where a real KIIKIS Project moves between Script, Art, Storyboard, and Video without page-level fragmentation, data loss, duplicate identity, or a separate Dynamic Storyboard stage.

**Architecture:** Keep `/production` as the canonical page and evolve the existing `ProductionWorkbench` rather than building a parallel editor. Add one server-owned project/stage context contract, route every audiovisual WorkType through the shared resolver, embed the existing AI-first `ScreenplayStudio` as the Script stage, and merge `DynamicGridEditor` into the Storyboard stage. Existing Project, Work, Version, Asset, Universe, conversation, storyboard, and video records remain authoritative.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.8, Supabase/PostgREST, Node test runner, Playwright, CSS Modules.

## Global Constraints

- Contract version is exactly `2.2.0-alpha.1`.
- Canonical checkout is `/Users/kiikis000/Documents/Kiikis/storyflow-ai`; NAS paths are backup/recovery only.
- Production Supabase Project Ref must be verified before any database write.
- Do not create a new Supabase project named `kiikis-staging`.
- Do not delete or truncate Project, Work, screenplay, Asset, storyboard, video, Universe, conversation, or version data.
- Top-level production stages are exactly `script`, `art`, `storyboard`, `video`.
- Do not expose a top-level Dynamic Storyboard tab or route target.
- Do not restore novel UI, configuration, routes, or project visibility.
- Script desktop layout is exactly two permanent columns: workflow rail and AI-dominant main area.
- “Current document” and “Version diff” replace the main area; they do not create a third permanent column.
- Translation stays removed; similarity review is nested under Outline; localization remains available.
- AI discussion never mutates screenplay content; only explicit candidate application creates a version.
- Formal media results point to persistent storage, never a Provider temporary URL.
- Preserve unrelated tracked and untracked workspace changes.
- Use `apply_patch` for source edits and stage only files belonging to the current task.

---

## File Structure

### New focused files

- `lib/contracts/v2/unified-workbench.ts` — shared stage, URL, and context types.
- `lib/server/v2/unified-workbench/index.ts` — owner-scoped context query and stage Work creation service.
- `lib/server/v2/unified-workbench/http.ts` — stable API error mapping.
- `lib/client/v2/unified-workbench/api.ts` — authenticated browser client for context and stage ensure calls.
- `app/api/v2/projects/[projectId]/workbench-context/route.ts` — read-only project/stage context endpoint.
- `app/api/v2/projects/[projectId]/workbench-stages/[stage]/ensure/route.ts` — idempotent stage Work endpoint.
- `components/production/UnifiedProductionHeader.tsx` — project identity, Universe, save, version, evidence, and four stage tabs.
- `components/production/UnifiedStoryboardStage.tsx` — one Storyboard stage with table, grids, motion, and prompt subviews.
- `tests/server-v2/unified-workbench/context.test.mjs` — service/API contract tests.
- `tests/ui-v2/unified-workbench/navigation.test.mjs` — canonical route and legacy route tests.
- `tests/ui-v2/unified-workbench/layout.test.mjs` — four-stage and two-column layout contracts.
- `e2e/v22-unified-production-workbench.spec.ts` — authenticated stage switching path.
- `e2e/v22-screenplay-production-recovery.spec.ts` — legacy project and persisted conversation recovery path.
- `supabase/migrations/20260830000000_K22_unified_workbench_stage_identity.sql` — idempotent stage Work RPC only; no destructive data statements.

### Existing files changed in place

- `lib/client/v2/navigation/resolver.ts` — route audiovisual WorkTypes to `/production`.
- `app/production/page.tsx` — canonical Suspense entry.
- `app/script-workbench/page.tsx` — compatibility resolver/redirect only.
- `app/production-workbench/page.tsx` — compatibility resolver/redirect only.
- `app/storyboard-workbench/page.tsx` — compatibility redirect for Project-bound use.
- `components/production/ProductionWorkbench.tsx` — controlled four-stage shell and existing production state owner.
- `components/production/ProductionWorkbench.module.css` — approved Mockup layout.
- `components/v2/screenplay-studio/ScreenplayStudio.tsx` — embedded mode and main-view switching.
- `components/v2/screenplay-studio/ScreenplayStudio.module.css` — exact two-column embedded layout.
- `components/art/ArtWorkbench.tsx` — embedded Work identity and no internal project switch.
- `lib/art-workbench.ts` — owner/project/work scoped draft key.
- `components/production/StoryboardPanels.tsx` — existing leaf panels consumed by the unified Storyboard stage.
- `components/production/DynamicGridEditor.tsx` — internal Storyboard subview only.
- `tests/screenplay-entry-routing.test.mjs` — unified route expectations.
- `tests/ui-v2/navigation/resolver.test.mjs` — shared resolver expectations.
- `tests/ui-v2/screenplay-studio/layout.test.mjs` — embedded layout expectations.
- `tests/art-workbench-production-regressions.test.mjs` — scoped embedded draft regression.
- `tests/storyboard-e2e-scenarios.test.mjs` — no duplicate Dynamic Storyboard stage.

---

### Task 1: Freeze the Unified Workbench Contract and Canonical URL

**Files:**
- Create: `lib/contracts/v2/unified-workbench.ts`
- Modify: `lib/client/v2/navigation/resolver.ts`
- Modify: `lib/client/v2/screenplay-studio/types.ts`
- Test: `tests/ui-v2/unified-workbench/navigation.test.mjs`
- Test: `tests/ui-v2/navigation/resolver.test.mjs`

**Interfaces:**
- Consumes: `WorkType` and `WORK_CONTRACT_VERSION` from `lib/contracts/v2/work.ts`.
- Produces: `UnifiedProductionStage`, `UnifiedWorkbenchContextV1`, `buildUnifiedWorkbenchUrl`, `parseUnifiedWorkbenchQuery`, and updated `resolveWorkbenchRoute`.

- [ ] **Step 1: Write the failing route and parsing tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUnifiedWorkbenchUrl,
  parseUnifiedWorkbenchQuery,
} from "../../../lib/contracts/v2/unified-workbench.ts";
import { resolveWorkbenchRoute } from "../../../lib/client/v2/navigation/resolver.ts";

test("audiovisual work types share the production route and preserve stage", () => {
  const expected = {
    script: "script",
    art: "art",
    storyboard: "storyboard",
    video: "video",
  };
  for (const [workType, tab] of Object.entries(expected)) {
    assert.equal(
      resolveWorkbenchRoute(workType, { projectId: "p1", workId: "w1" }),
      `/production?projectId=p1&workId=w1&tab=${tab}`,
    );
  }
});

test("unified workbench URL round-trips an optional unit", () => {
  const url = buildUnifiedWorkbenchUrl({
    projectId: "p1",
    workId: "w1",
    tab: "script",
    unitId: "u1",
  });
  assert.equal(url, "/production?projectId=p1&workId=w1&tab=script&unitId=u1");
  assert.deepEqual(parseUnifiedWorkbenchQuery(url.split("?")[1]), {
    projectId: "p1",
    workId: "w1",
    tab: "script",
    unitId: "u1",
  });
});

test("dynamic storyboard is never accepted as a production stage", () => {
  assert.equal(parseUnifiedWorkbenchQuery("projectId=p1&workId=w1&tab=grid").tab, "storyboard");
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
node --test tests/ui-v2/unified-workbench/navigation.test.mjs tests/ui-v2/navigation/resolver.test.mjs
```

Expected: FAIL because `lib/contracts/v2/unified-workbench.ts` does not exist and audiovisual routes still point to separate workbenches.

- [ ] **Step 3: Implement the shared contract**

```ts
import { WORK_CONTRACT_VERSION, type WorkStatus } from "./work";

export const UNIFIED_PRODUCTION_STAGES = ["script", "art", "storyboard", "video"] as const;
export type UnifiedProductionStage = (typeof UNIFIED_PRODUCTION_STAGES)[number];

export interface UnifiedWorkbenchStageContext {
  workId: string;
  status: WorkStatus;
  currentVersionId: string | null;
  updatedAt: string;
}

export interface UnifiedWorkbenchContextV1 {
  contractVersion: typeof WORK_CONTRACT_VERSION;
  project: { id: string; title: string; ownerId: string };
  universe: { id: string; name: string; versionId: string | null; hasUpdate: boolean } | null;
  stages: Record<UnifiedProductionStage, UnifiedWorkbenchStageContext | null>;
  legacy: { sourceUnitId: string | null; resolvedFromProjectOnly: boolean };
}

export function isUnifiedProductionStage(value: unknown): value is UnifiedProductionStage {
  return typeof value === "string" && (UNIFIED_PRODUCTION_STAGES as readonly string[]).includes(value);
}

export function buildUnifiedWorkbenchUrl(input: {
  projectId: string;
  workId?: string | null;
  tab: UnifiedProductionStage;
  unitId?: string | null;
}): string {
  const query = new URLSearchParams({ projectId: input.projectId });
  if (input.workId) query.set("workId", input.workId);
  query.set("tab", input.tab);
  if (input.unitId) query.set("unitId", input.unitId);
  return `/production?${query.toString()}`;
}

export function parseUnifiedWorkbenchQuery(search: string | URLSearchParams): {
  projectId: string | null;
  workId: string | null;
  tab: UnifiedProductionStage;
  unitId: string | null;
} {
  const query = typeof search === "string" ? new URLSearchParams(search) : search;
  const rawTab = query.get("tab");
  return {
    projectId: query.get("projectId"),
    workId: query.get("workId"),
    tab: rawTab === "grid" || rawTab === "dynamic" ? "storyboard" : isUnifiedProductionStage(rawTab) ? rawTab : "script",
    unitId: query.get("unitId") ?? query.get("sourceUnitId"),
  };
}
```

- [ ] **Step 4: Route only audiovisual WorkTypes to `/production`**

Use `buildUnifiedWorkbenchUrl` for `script`, `art`, `storyboard`, and `video`. Keep `song`, `voice`, and `editing` on their professional routes. Remove `/script-workbench` from `buildStudioUrl`; it must call `buildUnifiedWorkbenchUrl` when project identity is present.

- [ ] **Step 5: Run GREEN and type-check the contract**

Run:

```bash
node --test tests/ui-v2/unified-workbench/navigation.test.mjs tests/ui-v2/navigation/resolver.test.mjs tests/ui-v2/screenplay-studio/layout.test.mjs
npx tsc --noEmit
```

Expected: all selected tests pass and TypeScript exits 0.

- [ ] **Step 6: Commit Task 1**

```bash
git add lib/contracts/v2/unified-workbench.ts lib/client/v2/navigation/resolver.ts lib/client/v2/screenplay-studio/types.ts tests/ui-v2/unified-workbench/navigation.test.mjs tests/ui-v2/navigation/resolver.test.mjs tests/ui-v2/screenplay-studio/layout.test.mjs
git commit -m "feat(v2.2): define unified production workbench routing"
```

---

### Task 2: Add Owner-Scoped Project/Stage Context and Idempotent Stage Work Creation

**Files:**
- Create: `supabase/migrations/20260830000000_K22_unified_workbench_stage_identity.sql`
- Create: `lib/server/v2/unified-workbench/index.ts`
- Create: `lib/server/v2/unified-workbench/http.ts`
- Create: `app/api/v2/projects/[projectId]/workbench-context/route.ts`
- Create: `app/api/v2/projects/[projectId]/workbench-stages/[stage]/ensure/route.ts`
- Create: `tests/server-v2/unified-workbench/context.test.mjs`
- Modify: `scripts/audit-kiikis-22-migrations.mjs`

**Interfaces:**
- Consumes: `authenticateRequest`, `serviceFetch`, `storyflow_projects`, `storyflow_works`, `storyflow_work_versions`, and `storyflow_universes`.
- Produces:

```ts
export async function getUnifiedWorkbenchContext(input: {
  projectId: string;
  ownerId: string;
  fetcher: UnifiedWorkbenchFetcher;
}): Promise<UnifiedWorkbenchContextV1>;

export async function ensureStageWork(input: {
  projectId: string;
  ownerId: string;
  stage: UnifiedProductionStage;
  idempotencyKey: string;
  fetcher: UnifiedWorkbenchFetcher;
}): Promise<{ workId: string; created: boolean }>;
```

- [ ] **Step 1: Write service RED tests**

Cover these exact cases:

```js
test("context rejects a project owned by another user", async () => {
  await assert.rejects(
    () => getUnifiedWorkbenchContext({ projectId: "p1", ownerId: "u2", fetcher }),
    (error) => error.code === "forbidden",
  );
});

test("context returns one slot for each production stage", async () => {
  const result = await getUnifiedWorkbenchContext({ projectId: "p1", ownerId: "u1", fetcher });
  assert.deepEqual(Object.keys(result.stages), ["script", "art", "storyboard", "video"]);
});

test("ensure returns the existing active stage work", async () => {
  assert.deepEqual(
    await ensureStageWork({ projectId: "p1", ownerId: "u1", stage: "art", idempotencyKey: "k1", fetcher }),
    { workId: "art-existing", created: false },
  );
});
```

Also test missing Project → `not_found`, unsupported stage → `validation_failed`, and incomplete RPC response → `service_unavailable`.

- [ ] **Step 2: Run service tests and verify RED**

Run:

```bash
node --test tests/server-v2/unified-workbench/context.test.mjs
```

Expected: FAIL because the service and endpoints do not exist.

- [ ] **Step 3: Add the additive stage identity RPC**

The migration must use an advisory transaction lock and must not add a destructive unique index over legacy data:

```sql
CREATE OR REPLACE FUNCTION public.ensure_project_stage_work(
  p_owner_id uuid,
  p_project_id text,
  p_work_type text,
  p_title text,
  p_idempotency_key text
) RETURNS TABLE(work_id uuid, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_work_id uuid;
  new_work_id uuid;
BEGIN
  IF p_work_type NOT IN ('script','art','storyboard','video') THEN
    RAISE EXCEPTION 'INVALID_PRODUCTION_STAGE' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.storyflow_projects p
    WHERE p.id = p_project_id
      AND COALESCE(p.owner_id, p.user_id) = p_owner_id
  ) THEN
    RAISE EXCEPTION 'PROJECT_NOT_OWNED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_project_id || ':' || p_work_type, 0));

  SELECT w.id INTO existing_work_id
  FROM public.storyflow_works w
  WHERE w.project_id = p_project_id
    AND w.owner_id = p_owner_id
    AND w.work_type = p_work_type
    AND w.status <> 'archived'
  ORDER BY w.is_primary DESC, w.updated_at DESC, w.created_at DESC
  LIMIT 1;

  IF existing_work_id IS NOT NULL THEN
    RETURN QUERY SELECT existing_work_id, false;
    RETURN;
  END IF;

  new_work_id := gen_random_uuid();
  INSERT INTO public.storyflow_works(
    id, owner_id, project_id, work_type, title, status,
    is_primary, universe_id, idempotency_key
  )
  SELECT
    new_work_id, p_owner_id, p_project_id, p_work_type, p_title, 'editing_draft',
    false, p.universe_id, p_idempotency_key
  FROM public.storyflow_projects p
  WHERE p.id = p_project_id;

  RETURN QUERY SELECT new_work_id, true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_project_stage_work(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
```

Update the migration auditor so it includes every migration at or after the K22 floor, not only filenames beginning with `20260828`:

```js
const K22_MIN_STAMP = 20260828000000;
const files = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith(".sql"))
  .filter((file) => Number(file.slice(0, 14)) >= K22_MIN_STAMP)
  .sort();
```

- [ ] **Step 4: Implement service and HTTP mapping**

`getUnifiedWorkbenchContext` must query Project first, fail closed on owner mismatch, query non-archived Works ordered by `is_primary.desc,updated_at.desc`, and reduce them into four stage slots. The HTTP mapper must return:

```ts
const STATUS_BY_CODE = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation_failed: 422,
  schema_missing: 503,
  service_unavailable: 503,
} as const;
```

Map PostgREST `PGRST202`, `PGRST205`, and PostgreSQL `42P01` to `schema_missing`; preserve `correlationId` in every non-2xx response.

- [ ] **Step 5: Implement routes with server-owned identity**

Both routes must call `authenticateRequest(request)` before `serviceFetch`. The ensure route reads `idempotency-key` or generates `crypto.randomUUID()`. Neither route accepts `ownerId` in query or JSON.

- [ ] **Step 6: Run service, migration audit, and security tests**

Run:

```bash
node --test tests/server-v2/unified-workbench/context.test.mjs tests/security/kiikis-22-rls.test.mjs
node scripts/audit-kiikis-22-migrations.mjs
npx tsc --noEmit
```

Expected: all commands exit 0; the migration audit reports no `DROP TABLE` and all K22 tables retain RLS.

- [ ] **Step 7: Commit Task 2**

```bash
git add supabase/migrations/20260830000000_K22_unified_workbench_stage_identity.sql lib/server/v2/unified-workbench app/api/v2/projects tests/server-v2/unified-workbench scripts/audit-kiikis-22-migrations.mjs
git commit -m "feat(v2.2): add unified workbench stage context"
```

---

### Task 3: Normalize All Project-Bound Entries into `/production`

**Files:**
- Create: `lib/client/v2/unified-workbench/api.ts`
- Modify: `app/script-workbench/page.tsx`
- Modify: `app/production-workbench/page.tsx`
- Modify: `app/storyboard-workbench/page.tsx`
- Modify: `app/art-workbench/page.tsx`
- Modify: `app/video-workbench/page.tsx`
- Modify: `components/home/ProjectList.tsx`
- Modify: `components/universe/UniverseWorks.tsx`
- Modify: `app/universes/[universeId]/page.tsx`
- Modify: `lib/universe/graph.ts`
- Modify: `lib/client/v2/project-library/helpers.ts`
- Modify: `tests/screenplay-entry-routing.test.mjs`
- Test: `tests/ui-v2/unified-workbench/navigation.test.mjs`

**Interfaces:**
- Consumes: Task 1 URL helpers and Task 2 context endpoints.
- Produces:

```ts
export async function fetchUnifiedWorkbenchContext(projectId: string): Promise<UnifiedWorkbenchContextV1>;
export async function ensureUnifiedStage(projectId: string, stage: UnifiedProductionStage): Promise<{ workId: string; created: boolean }>;
```

- [ ] **Step 1: Expand route RED tests**

Replace expectations for `/script-workbench?projectId=` with `/production?projectId=` and `tab=script`. Add source assertions that ProjectList, UniverseWorks, universe graph, and project library helpers consume `buildUnifiedWorkbenchUrl` or `resolveWorkbenchRoute` rather than hard-coded workbench paths.

Add compatibility assertions:

```js
for (const legacyPage of [
  "../app/script-workbench/page.tsx",
  "../app/production-workbench/page.tsx",
]) {
  const source = read(legacyPage);
  assert.match(source, /router\.replace|redirect/);
  assert.doesNotMatch(source, /<ScreenplayStudio|<ProductionWorkbench/);
}
```

- [ ] **Step 2: Run route tests and verify RED**

Run:

```bash
node --test tests/screenplay-entry-routing.test.mjs tests/ui-v2/unified-workbench/navigation.test.mjs
```

Expected: FAIL on old hard-coded `/script-workbench` and directly rendered legacy workbench pages.

- [ ] **Step 3: Implement the authenticated browser client**

```ts
import { fetchScreenplayStudio } from "@/lib/client/v2/screenplay-studio/auth";
import type { UnifiedProductionStage, UnifiedWorkbenchContextV1 } from "@/lib/contracts/v2/unified-workbench";

async function parse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "统一工作台服务暂时不可用。");
  return body as T;
}

export async function fetchUnifiedWorkbenchContext(projectId: string) {
  return parse<UnifiedWorkbenchContextV1>(
    await fetchScreenplayStudio(`/api/v2/projects/${encodeURIComponent(projectId)}/workbench-context`),
  );
}

export async function ensureUnifiedStage(projectId: string, stage: UnifiedProductionStage) {
  return parse<{ workId: string; created: boolean }>(
    await fetchScreenplayStudio(`/api/v2/projects/${encodeURIComponent(projectId)}/workbench-stages/${stage}/ensure`, {
      method: "POST",
      headers: { "idempotency-key": `stage:${projectId}:${stage}` },
    }),
  );
}
```

- [ ] **Step 4: Convert legacy pages into compatibility resolvers**

Each legacy page parses its original parameters, resolves missing Work identity through the existing `/api/v2/project-start/resolve-work`, and performs `router.replace(buildUnifiedWorkbenchUrl(...))`. A route with no Project identity returns to `/projects/new-v2`. Project-bound Art/Video routes redirect; standalone asset/tool modes remain on their existing pages.

- [ ] **Step 5: Update every project-bound link**

Use the shared resolver in ProjectList, UniverseWorks, Universe graph, the Universe detail page, the project library, Dashboard result links, and KK result links. Do not update song, voice, or editing links to `/production`.

- [ ] **Step 6: Run GREEN**

Run:

```bash
node --test tests/screenplay-entry-routing.test.mjs tests/ui-v2/unified-workbench/navigation.test.mjs tests/ui-v2/navigation/resolver.test.mjs tests/universe-works.test.mjs tests/ui-v2/project-library/project-library.test.mjs
npx tsc --noEmit
```

Expected: selected tests pass and all generated audiovisual routes are same-origin `/production` URLs.

- [ ] **Step 7: Commit Task 3**

```bash
git add app/script-workbench app/production-workbench app/storyboard-workbench app/art-workbench app/video-workbench components/home/ProjectList.tsx components/universe/UniverseWorks.tsx app/universes/[universeId]/page.tsx lib/universe/graph.ts lib/client/v2/project-library/helpers.ts lib/client/v2/unified-workbench tests/screenplay-entry-routing.test.mjs tests/ui-v2/unified-workbench tests/ui-v2/navigation/resolver.test.mjs
git commit -m "fix(v2.2): normalize audiovisual entries into production"
```

---

### Task 4: Restore the Approved Four-Stage Production Shell

**Files:**
- Create: `components/production/UnifiedProductionHeader.tsx`
- Modify: `components/production/ProductionWorkbench.tsx`
- Modify: `components/production/ProductionWorkbench.module.css`
- Modify: `app/production/page.tsx`
- Modify: `app/globals.css`
- Create: `tests/ui-v2/unified-workbench/layout.test.mjs`
- Modify: `tests/production-scope.test.mjs`
- Modify: `tests/production-draft-recovery.test.mjs`

**Interfaces:**
- Consumes: `UnifiedWorkbenchContextV1`, `fetchUnifiedWorkbenchContext`, `ensureUnifiedStage`, and existing Universe/Version/Evidence leaf controls.
- Produces:

```ts
export interface UnifiedProductionHeaderProps {
  context: UnifiedWorkbenchContextV1;
  activeStage: UnifiedProductionStage;
  saveStatus: "saved" | "saving" | "unsaved";
  onStageChange: (stage: UnifiedProductionStage) => void;
}
```

- [ ] **Step 1: Write four-stage and two-column RED tests**

```js
test("production exposes exactly four top-level stages", () => {
  const source = read("../../../components/production/ProductionWorkbench.tsx");
  assert.match(source, /script/);
  assert.match(source, /art/);
  assert.match(source, /storyboard/);
  assert.match(source, /video/);
  assert.doesNotMatch(source, /label:\s*["']动态分镜["']/);
});

test("production shell owns one approved header and no global third column", () => {
  const page = read("../../../app/production/page.tsx");
  const css = read("../../../components/production/ProductionWorkbench.module.css");
  assert.match(page, /ProductionWorkbench/);
  assert.match(css, /grid-template-columns:\s*(?:260px|280px|minmax\()/);
  assert.doesNotMatch(css, /grid-template-columns:\s*[^;]+\s+[^;]+\s+[^;]+/);
});
```

- [ ] **Step 2: Run layout tests and verify RED**

Run:

```bash
node --test tests/ui-v2/unified-workbench/layout.test.mjs tests/production-scope.test.mjs tests/production-draft-recovery.test.mjs
```

Expected: FAIL because the existing shell still declares `grid` as a top-level tab and requires `sourceUnitId` to open the whole page.

- [ ] **Step 3: Replace the top-level tab model**

In `ProductionWorkbench.tsx` replace the local Tab union with `UnifiedProductionStage`. Remove the top-level `grid` branch. Parse the URL with `parseUnifiedWorkbenchQuery`; require `projectId`, allow `unitId` to be null, and fetch Task 2 context before rendering a stage.

Use this controlled change path:

```ts
const handleStageChange = async (stage: UnifiedProductionStage) => {
  if (hasUnsavedInput) {
    setPendingStage(stage);
    setUnsavedDialogOpen(true);
    return;
  }
  const existingStage = context.stages[stage];
  router.replace(buildUnifiedWorkbenchUrl({
    projectId: context.project.id,
    workId: existingStage?.workId ?? null,
    tab: stage,
    unitId,
  }), { scroll: false });
  setActiveStage(stage);
};
```

When `context.stages[stage]` is null, render a real empty state with one primary action. That action must call:

```ts
const startStage = async (stage: UnifiedProductionStage) => {
  const ensured = await ensureUnifiedStage(context.project.id, stage);
  router.replace(buildUnifiedWorkbenchUrl({
    projectId: context.project.id,
    workId: ensured.workId,
    tab: stage,
  }), { scroll: false });
  await reloadContext();
};
```

- [ ] **Step 4: Build the approved header**

Render project title, Universe status/version, save status, Version, Evidence, More, and exactly four `role="tab"` buttons. Set `aria-selected` and connect each button to a `role="tabpanel"`.

- [ ] **Step 5: Apply the approved focus layout**

On mount set `document.documentElement.dataset.productionFocus = "on"`; clear it on unmount. In `app/globals.css`, collapse the global large sidebar only while this dataset is active. Keep desktop stage content at two permanent columns where the stage requires a rail; collapse to one column below 600px.

- [ ] **Step 6: Preserve production hydration and draft scope**

Keep the existing `resolving_scope → loading_local → loading_cloud_if_archived → ready` order. Change draft scope from the former required `sourceUnitId` to `{ userId, projectId, workId, unitId }`. Do not write local or cloud state before `ready`.

- [ ] **Step 7: Run GREEN and responsive component tests**

Run:

```bash
node --test tests/ui-v2/unified-workbench/layout.test.mjs tests/production-scope.test.mjs tests/production-draft-recovery.test.mjs tests/ui-v2/workbench-shell/workbench-shell.test.mjs
npx tsc --noEmit
```

Expected: tests pass; no test or source file contains a top-level Dynamic Storyboard label.

- [ ] **Step 8: Commit Task 4**

```bash
git add components/production/UnifiedProductionHeader.tsx components/production/ProductionWorkbench.tsx components/production/ProductionWorkbench.module.css app/production/page.tsx app/globals.css tests/ui-v2/unified-workbench/layout.test.mjs tests/production-scope.test.mjs tests/production-draft-recovery.test.mjs
git commit -m "feat(v2.2): restore four-stage production shell"
```

---

### Task 5: Embed the AI-First Screenplay Studio in the Script Stage

**Files:**
- Modify: `components/v2/screenplay-studio/ScreenplayStudio.tsx`
- Modify: `components/v2/screenplay-studio/ScreenplayStudio.module.css`
- Modify: `components/v2/screenplay-studio/KkScreenplayRoom.tsx`
- Modify: `components/v2/screenplay-studio/UnitNavigator.tsx`
- Modify: `components/v2/screenplay-studio/ScreenplayEditor.tsx`
- Modify: `components/production/ProductionWorkbench.tsx`
- Modify: `lib/client/v2/screenplay-studio/types.ts`
- Modify: `tests/ui-v2/screenplay-studio/layout.test.mjs`
- Modify: `tests/ui-v2/screenplay-studio/navigation.test.mjs`
- Modify: `tests/ui-v2/screenplay-studio/auth.test.mjs`
- Modify: `tests/server-v2/screenplays/generation.test.mjs`

**Interfaces:**
- Consumes: canonical Project/Work/Unit identity and existing screenplay API client.
- Produces:

```ts
export interface ScreenplayStudioProps {
  embedded?: boolean;
  projectId?: string;
  workId?: string;
  unitId?: string | null;
  onUnitChange?: (unitId: string) => void;
  onUnsavedChange?: (unsaved: boolean) => void;
}
```

- [ ] **Step 1: Write embedded layout and URL RED tests**

Add assertions that:

```js
const source = read("../../../components/v2/screenplay-studio/ScreenplayStudio.tsx");
assert.match(source, /embedded\?: boolean/);
assert.match(source, /对话/);
assert.match(source, /当前稿/);
assert.match(source, /版本对比/);
assert.doesNotMatch(source, /router\.replace\(`\?workId=/);
```

Keep the existing trilogy order, similarity parent `outline`, no translation, and localization checks.

- [ ] **Step 2: Add RED behavior tests for current input and candidate safety**

The generation service test must prove this order:

```js
assert.deepEqual(calls.map((call) => call.kind), [
  "append_user_message",
  "create_context_snapshot",
  "invoke_model",
  "create_candidate",
]);
assert.equal(calls.some((call) => call.kind === "update_unit_content"), false);
```

The apply-candidate test must be the only path that creates a child Work Version.

- [ ] **Step 3: Run screenplay tests and verify RED**

Run:

```bash
node --test tests/ui-v2/screenplay-studio/*.test.mjs tests/server-v2/screenplays/generation.test.mjs
```

Expected: FAIL because the current component owns its own standalone route/layout and current document opens in a bottom dock.

- [ ] **Step 4: Add embedded identity without duplicating authentication**

Resolve identity from props first and URL second:

```ts
const query = parseUnifiedWorkbenchQuery(searchParams);
const resolvedProjectId = projectIdProp ?? query.projectId;
const resolvedWorkId = workIdProp ?? query.workId;
const resolvedUnitId = unitIdProp ?? query.unitId;
```

All browser API calls continue through `fetchScreenplayStudio`; no component may add a raw authenticated `fetch` path.

- [ ] **Step 5: Replace the bottom dock with one main-area view switch**

Use:

```ts
type ScreenplayMainView = "conversation" | "document" | "diff";
const [mainView, setMainView] = useState<ScreenplayMainView>("conversation");
```

`conversation` renders `KkScreenplayRoom`, `document` renders `ScreenplayEditor`, and `diff` renders the active Candidate/Version comparison. Only one view is mounted visibly at a time. Continuity, references, localization, similarity, delivery, and versions open as modal sheets or replace the same main area; none creates a permanent third column.

- [ ] **Step 6: Preserve the trilogy and free return behavior**

Keep new-node creation order but allow navigation to every existing node. Rename user-facing “finish” copy to “确认当前可用版本”. When an upstream version changes, show stale dependents and the four existing choices; do not delete dependent units.

- [ ] **Step 7: Keep similarity and localization in their confirmed positions**

Similarity remains nested under Outline and disabled until an Outline has a confirmed usable version. Translation stays absent. Localization accepts current node, episode, scene, or selected text context.

- [ ] **Step 8: Run GREEN and the 10×20 long screenplay tests**

Run:

```bash
node --test tests/ui-v2/screenplay-studio/*.test.mjs tests/server-v2/screenplays/*.test.mjs tests/performance/v22-screenplay-budget.test.mjs
npx tsc --noEmit
```

Expected: all tests pass; the long screenplay test reports 10 episodes × 20 scenes without an all-document rewrite.

- [ ] **Step 9: Commit Task 5**

```bash
git add components/v2/screenplay-studio components/production/ProductionWorkbench.tsx lib/client/v2/screenplay-studio tests/ui-v2/screenplay-studio tests/server-v2/screenplays tests/performance/v22-screenplay-budget.test.mjs
git commit -m "feat(v2.2): embed ai screenplay studio in production"
```

---

### Task 6: Merge Art, Dynamic Storyboard, and Video into the Same Project Shell

**Files:**
- Create: `components/production/UnifiedStoryboardStage.tsx`
- Modify: `components/production/ProductionWorkbench.tsx`
- Modify: `components/production/StoryboardPanels.tsx`
- Modify: `components/production/DynamicGridEditor.tsx`
- Modify: `components/art/ArtWorkbench.tsx`
- Modify: `lib/art-workbench.ts`
- Modify: `tests/art-workbench-production-regressions.test.mjs`
- Modify: `tests/storyboard-e2e-scenarios.test.mjs`
- Modify: `tests/production-e2e-flow.test.mjs`
- Modify: `tests/storyboard-video-transfer.test.mjs`

**Interfaces:**
- Consumes: stage Work identities from Task 2 and existing Storyboard/Video APIs.
- Produces:

```ts
type StoryboardSubview = "shot_table" | "grids" | "motion" | "prompts";

export interface UnifiedStoryboardStageProps {
  projectId: string;
  workId: string;
  unitId: string | null;
  subview: StoryboardSubview;
  onSubviewChange: (subview: StoryboardSubview) => void;
}
```

- [ ] **Step 1: Write RED tests for one Storyboard stage and scoped Art drafts**

Assert that the production source contains no top-level `grid` stage, while `UnifiedStoryboardStage` imports `DynamicGridEditor`. Extend the Art regression to prove two Work IDs under the same Project receive different keys:

```js
assert.notEqual(
  resolveArtDraftKey({ userId: "u1", projectId: "p1", workId: "art-1" }),
  resolveArtDraftKey({ userId: "u1", projectId: "p1", workId: "art-2" }),
);
```

- [ ] **Step 2: Run selected tests and verify RED**

Run:

```bash
node --test tests/art-workbench-production-regressions.test.mjs tests/storyboard-e2e-scenarios.test.mjs tests/production-e2e-flow.test.mjs tests/storyboard-video-transfer.test.mjs
```

Expected: FAIL because Dynamic Grid remains a top-level tab and Art draft identity lacks Work scope.

- [ ] **Step 3: Scope embedded Art by real Work identity**

Add `contextWorkId` to `ArtWorkbench` and derive draft/archive keys from `{ userId, projectId, workId }`. Embedded mode hides project creation, project switching, and standalone navigation. It may still expose Asset create/edit actions.

- [ ] **Step 4: Build one Storyboard stage with internal subviews**

Render the existing Storyboard table as `shot_table`, the 4/6/9/12 grids as `grids`, `DynamicGridEditor` as `motion`, and generated model prompts as `prompts`. Keep sceneId/shotId in the URL without changing the top-level `tab=storyboard`.

- [ ] **Step 5: Bind downstream source versions**

When Art, Storyboard, or Video creates a formal version, pass the selected upstream Work Version and create an append-only `WorkUsageLink` with `source_script`, `storyboard_source`, or `video_source`. If the upstream changes, retain existing outputs and mark the relationship stale.

- [ ] **Step 6: Enforce persistent video results**

Keep Provider temporary URLs only while the job is `running` or `ingesting`. A `completed`/`ready` response must contain a KIIKIS storage path or Asset Version ID. Tests must reject a ready result whose only URL host is the Provider.

- [ ] **Step 7: Run GREEN**

Run:

```bash
node --test tests/art-workbench-production-regressions.test.mjs tests/storyboard-e2e-scenarios.test.mjs tests/production-e2e-flow.test.mjs tests/storyboard-video-transfer.test.mjs tests/server-v2/work-usage/work-usage.test.mjs
npx tsc --noEmit
```

Expected: all selected tests pass; Art, Storyboard, and Video use one Project and explicit stage Work IDs.

- [ ] **Step 8: Commit Task 6**

```bash
git add components/production/UnifiedStoryboardStage.tsx components/production/ProductionWorkbench.tsx components/production/StoryboardPanels.tsx components/production/DynamicGridEditor.tsx components/art/ArtWorkbench.tsx lib/art-workbench.ts tests/art-workbench-production-regressions.test.mjs tests/storyboard-e2e-scenarios.test.mjs tests/production-e2e-flow.test.mjs tests/storyboard-video-transfer.test.mjs
git commit -m "feat(v2.2): unify art storyboard and video stages"
```

---

### Task 7: Production Safety Gate, Real-Project E2E, Build, and Release Evidence

**Files:**
- Create: `e2e/v22-unified-production-workbench.spec.ts`
- Create: `e2e/v22-screenplay-production-recovery.spec.ts`
- Modify: `scripts/smoke-kiikis-22.mjs`
- Create: `reports/2026-08-20-unified-workbench-release.md`

**Interfaces:**
- Consumes: all previous tasks and the production target gate.
- Produces: reproducible automated evidence, redacted production inventory, deployment ID, online route checks, and rollback commit.

- [ ] **Step 1: Write the end-to-end tests before final implementation cleanup**

The authenticated happy-path test must assert:

```ts
await page.goto(`/production?projectId=${projectId}&workId=${scriptWorkId}&tab=script`);
await expect(page.getByRole("tab", { name: "剧本" })).toHaveAttribute("aria-selected", "true");
await page.getByRole("tab", { name: "美术" }).click();
await expect(page).toHaveURL(/tab=art/);
await page.getByRole("tab", { name: "分镜" }).click();
await expect(page).toHaveURL(/tab=storyboard/);
await expect(page.getByRole("tab", { name: "动态分镜" })).toHaveCount(0);
await page.getByRole("tab", { name: "视频" }).click();
await expect(page).toHaveURL(/tab=video/);
```

The recovery test must open an old `projectId` URL, verify redirect to `/production`, verify the same project title, restore at least one saved KK message, and confirm that refreshing retains `workId`, `tab`, and `unitId`.

- [ ] **Step 2: Run E2E and verify any remaining failures**

Run:

```bash
npx playwright test e2e/v22-unified-production-workbench.spec.ts e2e/v22-screenplay-production-recovery.spec.ts --project=chromium
```

Expected before final cleanup: failures identify only incomplete wiring from Tasks 3–6, not missing test fixtures or invalid authentication setup.

- [ ] **Step 3: Run the production target gate in read-only mode**

Run:

```bash
node scripts/verify-supabase-target.mjs --status
```

Record the linked Project Ref and `.env.local` host in the release report without recording passwords or keys. Compare them to Vercel Production environment metadata. If they differ, stop before any migration command.

- [ ] **Step 4: Produce the redacted production inventory and backup evidence**

Record counts only for Projects, Works by type, screenplay Units, Work Versions, conversation Messages, Generation Candidates, Universes, and orphan relations. Record the backup/snapshot identifier. Do not include user content.

- [ ] **Step 5: Apply only missing canonical migrations after the gate passes**

Run:

```bash
node scripts/verify-supabase-target.mjs production
supabase migration list --linked
supabase db push --linked --include-all
node scripts/audit-kiikis-22-migrations.mjs
```

Expected: target gate prints StoryFlow production, migration list contains the canonical K22 chain through `20260830000000`, db push exits 0, and migration audit exits 0. If the target gate does not print the production Project Ref, do not run `supabase db push`.

- [ ] **Step 6: Run the full repository verification**

Run:

```bash
node --test \
  tests/screenplay-entry-routing.test.mjs \
  tests/ui-v2/navigation/resolver.test.mjs \
  tests/ui-v2/unified-workbench/*.test.mjs \
  tests/ui-v2/screenplay-studio/*.test.mjs \
  tests/ui-v2/workbench-shell/*.test.mjs \
  tests/server-v2/unified-workbench/*.test.mjs \
  tests/server-v2/project-start/*.test.mjs \
  tests/server-v2/project-library/*.test.mjs \
  tests/server-v2/screenplays/*.test.mjs \
  tests/server-v2/work-usage/*.test.mjs \
  tests/production-scope.test.mjs \
  tests/production-draft-recovery.test.mjs \
  tests/production-e2e-flow.test.mjs \
  tests/art-workbench-production-regressions.test.mjs \
  tests/storyboard-e2e-scenarios.test.mjs \
  tests/storyboard-video-transfer.test.mjs \
  tests/performance/v22-screenplay-budget.test.mjs

npx playwright test e2e/v22-unified-production-workbench.spec.ts e2e/v22-screenplay-production-recovery.spec.ts --project=chromium
npx tsc --noEmit
pnpm build
```

Expected: zero test failures, Playwright 2/2 specs pass, TypeScript exits 0, and Next production build exits 0.

- [ ] **Step 7: Verify one real long screenplay manually**

With an existing authorized production account:

1. Open a real existing screenplay Project.
2. Confirm project title, Universe, conversation history, current unit, and latest version.
3. Add a message in “聊一聊” and confirm no document version changes.
4. Generate a change candidate and reject it; confirm the document is unchanged.
5. Generate another candidate and apply one block; confirm a child version is created.
6. Switch Script → Art → Storyboard → Video and back without a page-level loss of identity.
7. Refresh and confirm the same Project, Work, stage, and unit restore.
8. Download a result/evidence package and confirm it contains no secret or Provider temporary URL.

- [ ] **Step 8: Deploy and verify the production alias**

Push the approved commit range to the repository branch used by Vercel Production. Record the Vercel deployment ID, commit SHA, aliases, and deployment time in the release report. Open `https://kiikis.com` with the authorized account and repeat the route, four-stage, message persistence, and legacy-project checks.

- [ ] **Step 9: Record rollback**

The rollback target is the commit immediately before Task 1 plus forward-compatible database state. Roll back application code through a revert/deployment promotion; do not reverse the additive migration by deleting Works or user data.

- [ ] **Step 10: Commit release evidence**

```bash
git add e2e/v22-unified-production-workbench.spec.ts e2e/v22-screenplay-production-recovery.spec.ts scripts/smoke-kiikis-22.mjs reports/2026-08-20-unified-workbench-release.md
git commit -m "test(v2.2): verify unified production workbench release"
```

---

## Self-Review Checklist

### PRD coverage map

| PRD requirement | Implementation task |
|---|---|
| K22-UW-G01 one Project, one production entry | Tasks 1, 2, 3 |
| K22-UW-G02 exactly four stages | Tasks 1, 4, 6 |
| K22-UW-G03 two-column AI-first screenplay | Tasks 4, 5 |
| K22-UW-G04 protect and recover old projects | Tasks 2, 3, 7 |
| K22-UW-G05 unified auth and service errors | Tasks 2, 3, 5 |
| K22-UW-G06 merge Dynamic Storyboard | Tasks 1, 4, 6 |
| K22-UW-G07 Universe, versions, Evidence | Tasks 4, 6, 7 |
| K22-UW-G08 real long-screenplay verification | Tasks 5, 7 |
| K22-UW-S01–S08 conversation/candidate safety | Task 5 |
| production target, backup, migration safety | Tasks 2, 7 |
| persistent video results and source lineage | Task 6 |
| responsive and accessibility requirements | Tasks 4, 5, 7 |

- [ ] Every PRD requirement maps to at least one task.
- [ ] Script, Art, Storyboard, and Video share `/production` but retain separate Work identities.
- [ ] No task restores novel or top-level Dynamic Storyboard UI.
- [ ] No task creates a second Project/Work/Universe truth.
- [ ] No database task contains `DROP TABLE`, `TRUNCATE`, or unconditional user-data `DELETE`.
- [ ] Production target and backup gates precede migration writes.
- [ ] Authentication derives ownerId on the server.
- [ ] Script remains two columns and AI-first.
- [ ] Current document and diff replace the main area rather than adding a third column.
- [ ] Similarity remains inside Outline; translation remains removed; localization remains available.
- [ ] Conversation persistence and candidate application tests precede UI completion.
- [ ] Long screenplay, legacy project, responsive layout, TypeScript, build, and online verification are included.
