# Task 3 Live Identity Fix Report

## Status

The remaining Task 3 re-review finding is fixed on top of `16b649ce` without resetting prior work. The change is limited to the live `/api/v2/jobs` identity DTO, Task Center result normalization, KK job-message runtime wiring, and focused tests.

Requested commit message: `fix(v2.2): wire server-owned task destinations`

## Root cause

The shared navigation resolver already preferred explicit `projectId`, `workId`, and `workbenchType`, but those values were lost at two earlier boundaries:

1. `mapLegacyJob` did not project server-owned `workId`, `workbenchType`, or `resultUrl` into the `/api/v2/jobs` `GenerationJob` DTO.
2. The browser jobs adapter omitted those response fields, inferred `workbenchType` from `jobType`, and derived `resultUrl` only from `resultReferences`.
3. `TaskCard` did not pass `workId` to `resolveJobResultUrl`.
4. The existing KK job projection had tests but no production caller in `KkRuntimeProvider` or its message-loading path.

This allowed stale legacy query identity and coarse job-type inference to override the server-owned Work and canonical production tab.

## Changes

### Server jobs DTO

- `lib/server/v2/jobs/index.ts`
  - Reads `input_params` and `result_url` from media-job rows.
  - Preserves explicit `workId` and `workbenchType` from server metadata, with explicit input parameters as the backward-compatible secondary source.
  - Preserves the server `result_url`, with existing metadata/result references used only as compatibility fallbacks.
  - Returns all three fields on the existing `GenerationJob` contract.

### Task Center

- `lib/client/v2/jobs/api.ts`
  - Adds `workId`, `workbenchType`, and `resultUrl` to the live response DTO mirror.
  - Maps server values into `UnifiedJob` before applying legacy inference fallbacks.
- `lib/client/v2/jobs/types.ts`
  - Adds optional server-owned `workId` to `UnifiedJob`; the existing `workbenchType` remains the authoritative field when supplied by the API.
- `components/v2/task-center/TaskCard.tsx`
  - Passes `job.workId` with `projectId`, `workbenchType`, and `resultUrl` to `resolveJobResultUrl`.

### KK runtime

- `lib/client/v2/kk/task-projection.ts`
  - Adapts live `UnifiedJob` values into the existing `projectJobsToKkMessages` path, preserving server identity and the existing route normalizer.
- `lib/client/v2/kk/api.ts`
  - Adds `fetchKkJobMessages`, which loads the real Task Center job feed and applies the existing KK job projection.
- `components/v2/kk/KkRuntimeProvider.tsx`
  - Loads job messages during startup and polling.
  - Merges projected job messages into the actual `messages` exposed by the runtime.
  - Keeps transient job-feed failures additive and non-fatal to the separate KK runtime state.
  - Preserves standalone asset/tool result routes and professional workbench routes through the shared resolver.

## Tests added

- `tests/server-v2/jobs/jobs.test.mjs`
  - Verifies the server DTO preserves `workId`, `workbenchType`, and direct `resultUrl`.
- `tests/ui-v2/live-job-destinations.test.mjs`
  - Starts from the real `/api/v2/jobs` response shape.
  - Verifies the final Task Center destination uses `work-server` and `tab=storyboard`, not stale URL identity or inferred `art`.
  - Verifies the production KK message loader reaches the same authoritative destination.
  - Verifies standalone Art query identity and the professional song route remain unchanged.
  - Verifies `TaskCard` and `KkRuntimeProvider` are wired to the authoritative identity/message paths.

## TDD evidence

Initial RED run:

```text
node --test tests/server-v2/jobs/jobs.test.mjs tests/ui-v2/live-job-destinations.test.mjs
21 passed, 3 failed as expected:
- server DTO workId was undefined
- Task Center UnifiedJob workId was undefined
- KK production job-message loader was absent
```

After the minimal implementation, the same run passed 24/24.

## Final verification

Focused Task Center, KK, jobs, and navigation command:

```text
node --test tests/server-v2/jobs/jobs.test.mjs \
  tests/ui-v2/task-center/api-adapter.test.mjs \
  tests/ui-v2/task-center/jobs-transition.test.mjs \
  tests/ui-v2/kk/kk-task-projection.test.mjs \
  tests/ui-v2/kk/kk.test.mjs \
  tests/ui-v2/navigation/resolver.test.mjs \
  tests/ui-v2/live-job-destinations.test.mjs

158 passed, 0 failed
```

TypeScript:

```text
npx tsc --noEmit
0 errors
```

Patch hygiene:

```text
git diff --check
clean
```

## Existing unrelated test drift

A broader wildcard run also executed `tests/ui-v2/task-center/task-center.test.mjs`. Its 19 behavior/source assertions passed, while two pre-existing fixture-stat assertions failed because the committed fixture stats declare 18 total jobs and 3 text jobs but the loaded fixture contains 17 total and 2 text jobs. No fixture or unrelated production UI was changed for this Task 3 fix.

## Self-review

- Confirmed authoritative fields take precedence over stale result URL query values and job-type inference.
- Confirmed old responses still fall back to existing `resultReferences` and inferred workbench behavior.
- Confirmed standalone Art asset/tool destinations are not rewritten.
- Confirmed song/professional destinations are not rewritten.
- Confirmed KK uses the actual runtime message collection, not an isolated helper-only path.
- Confirmed no unrelated production UI, configuration, migration, or fixture changes were made.
- Confirmed all changed production lines trace directly to the remaining re-review finding.
