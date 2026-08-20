# Task 3 Review Fix Report

## Result

- Status: `DONE_WITH_CONCERNS`
- Implementation commit: `16b649cea05ebc2cefcf9a920c72f54b6eff5285`
- Commit message: `fix(v2.2): close unified entry routing gaps`
- Diff: 16 files changed, 312 insertions, 47 deletions.

## Review findings closed

1. Standalone `/art-workbench` requests now remain on the established Art surface. `assetId`, `setup`, `universeId`, tool parameters, variants, and URL fragments are not discarded. Only entries with project identity resolve into `/production`.
2. Creation-to-production and screenplay-handoff routes now emit explicit canonical tabs. Planning maps to `tab=storyboard`; Art maps to `tab=art`; editor/dub/edit legacy production modes map explicitly to `tab=video`.
3. Dashboard project cards now use a workflow-aware shared resolver. Script/creation/continuation and audiovisual stages enter `/production` with the correct tab; song, voice, editing, viral/adaptation, dub, and edit retain professional destinations.
4. KK and Task Center result navigation now normalizes project-bound legacy audiovisual paths with server-owned `projectId`, `workId`, and `workbenchType`, while retaining extra result query parameters and fragments. Standalone Art/tool results and professional routes remain unchanged.
5. Behavior-level tests now execute route decisions for standalone Art, workflow-aware Dashboard destinations, canonical production jumps, server-owned KK result normalization, preserved result metadata, and professional-route preservation. Source checks remain only as wiring guards.

No novel route or module was restored, and no stored project, asset, job, or handoff data is deleted or rewritten.

## Changed files

- `app/art-workbench/page.tsx` — render standalone Art in place; resolve only project-bound entries.
- `components/creation/CreationWorkbench.tsx` — delegate Art/storyboard transitions to `buildProductionJumpUrl`.
- `components/v2/dashboard/DashboardSections.tsx` — use workflow-aware project destinations and labels.
- `components/v2/kk/KkMessageItem.tsx` — pass KK actions through the shared result normalizer.
- `components/v2/task-center/JobDetail.tsx` — normalize results with server job identity.
- `components/v2/task-center/TaskCard.tsx` — normalize results with project/workbench identity.
- `lib/client/v2/dashboard/types.ts` — cover all current Work types without adding novel.
- `lib/client/v2/kk/task-projection.ts` — provide server-owned job identity to result resolution.
- `lib/client/v2/navigation/resolver.ts` — add project workflow routing, standalone Art decisions, and project-bound legacy result normalization.
- `lib/screenplay-handoff/from-creation.ts` — emit `tab=storyboard` and canonical `unitId`.
- `lib/workflow/can-jump.ts` — map every accepted legacy production mode to a canonical tab.
- `tests/creation-handoff-action.test.mjs` — verify canonical storyboard handoff URL behavior.
- `tests/screenplay-entry-routing.test.mjs` — verify standalone Art and Dashboard wiring guards.
- `tests/ui-v2/kk/kk-task-projection.test.mjs` — verify KK server-owned result normalization.
- `tests/ui-v2/navigation/resolver.test.mjs` — verify standalone identity, workflow decisions, result metadata, and professional-route preservation.
- `tests/ui-v2/unified-workbench/navigation.test.mjs` — verify canonical jump decisions and CreationWorkbench delegation.

## Commands and outputs

### TDD RED

```text
$ npx --no-install tsx --test tests/ui-v2/unified-workbench/navigation.test.mjs
tests 8; pass 6; fail 2; exit 1
Expected failures:
- planning emitted /production?projectId=p1&sourceUnitId=u1 instead of tab=storyboard
- CreationWorkbench did not use buildProductionJumpUrl
```

The remaining new route tests also failed before implementation because the route-decision exports did not exist, Dashboard still emitted `/projects/:id`, Art redirected to `/production?mode=art`, and KK retained `/storyboard-workbench`.

### Final focused routing/project-library/workflow/Dashboard/KK/Art/Task Center verification

```text
$ node --test tests/screenplay-entry-routing.test.mjs tests/ui-v2/unified-workbench/navigation.test.mjs tests/ui-v2/navigation/resolver.test.mjs tests/creation-handoff-action.test.mjs tests/ui-v2/project-library/project-library.test.mjs tests/server-v2/project-library/project-library.test.mjs tests/ui-v2/dashboard/dashboard.test.mjs tests/ui-v2/kk/kk-task-projection.test.mjs tests/ui-v2/task-center/jobs-transition.test.mjs tests/art-asset-scope.test.mjs tests/art-workbench-production-regressions.test.mjs tests/ui-v2/project-start/project-start.test.mjs
tests 150; pass 150; fail 0; cancelled 0; skipped 0; todo 0; exit 0
```

```text
$ npx --no-install tsx --test tests/universe-works.test.mjs
tests 4; pass 4; fail 0; cancelled 0; skipped 0; todo 0; exit 0
```

```text
$ npx tsc --noEmit
no output; exit 0
```

```text
$ git diff --check
no output; exit 0
```

### Known Node 26 loader limitation

```text
$ node --test tests/universe-works.test.mjs
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../node_modules/next/headers'
Did you mean to import "next/headers.js"?
Node.js v26.5.0
tests 1; pass 0; fail 1; exit 1
```

The same test passes 4/4 through the available `tsx` runner, so this is a raw Node 26 extensionless Next package import limitation rather than a route assertion failure.

### Known unrelated/stale checks

```text
$ node --test tests/server-v2/project-start/project-start.test.mjs
tests 28; pass 26; fail 2; exit 1
```

Both failures are stale assertions for `/script-workbench`; the actual route is the already-established `/production?projectId=p1&workId=w1&tab=script`. These assertions predate this fix wave and were identified in the supplied review as suite drift.

```text
$ node --test tests/ui-v2/task-center/task-center.test.mjs
tests 21; pass 19; fail 2; exit 1
```

Both failures are pre-existing fixture-stat mismatches (`17 !== 18` and `text: 2 !== 3`) and do not exercise the changed route resolver.

## Self-review

- Re-read every Critical/Important finding and mapped it to an executable route decision or a direct wiring guard.
- Confirmed project-bound canonicalization preserves unknown result parameters and URL fragments.
- Confirmed standalone Art/tool and professional routes return unchanged.
- Confirmed every project-bound production transition touched here carries an explicit canonical tab.
- Confirmed the diff contains no novel behavior, destructive data path, dependency change, migration, broad refactor, or unrelated formatting cleanup.

## Concerns

- Raw Node 26 cannot directly load `next/headers` for `tests/universe-works.test.mjs`; use the recorded `tsx` command until the test loader/import is updated.
- Two stale project-start route assertions and two unrelated Task Center fixture-stat assertions remain outside this bounded review-fix scope.
