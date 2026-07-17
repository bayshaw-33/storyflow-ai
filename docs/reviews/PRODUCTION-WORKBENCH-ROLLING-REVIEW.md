# Production Workbench Rolling Review

> Governing PRD: KIIKIS 制作工作台 PRD —— Codex（安全与验证）
> Reviewed baseline: `719c9a0..b6adf17` on `main`
> Policy: only security items are BLOCKER. Functional and reliability gaps remain in this list for unified acceptance; they do not stop TRAE feature development.
> Latest rolling review: `bdc971e..aca4116`, plus the current staging schema verification on 2026-07-18.

## BLOCKER

### Closed — CAS bypass no longer writes current state

Resolved by `bdc971e` and independently reviewed on 2026-07-18. `SaveRequest.expectedRevision` is now `number`; `/api/storyboard/state` accepts only a non-negative integer at runtime. The 409 “另存快照” exit calls the separate snapshot API, whose only data operation is `POST storyflow_versions`; it neither queries nor writes the current storyboard state and never calls `save_storyboard_state`.

**Decision: CLOSED for the current-state CAS path.** The one remaining `expectedRevision ?? null` occurrence belongs to video-job metadata only; it does not invoke the storyboard state RPC or modify Scene/Shot current state.

### Closed — staging migration execution and cloud-sync column

The CLI link was verified as `cwpyolxitkcpitqizgtq` (`kiikis-staging`) before migration execution. The original 15 migrations and the two Evidence migrations were present. A schema gap was then found: production-state code reads/writes `storyflow_projects.delivery_package`, but no prior migration created that column. The idempotent `20260719100000_add_storyflow_projects_delivery_package.sql` migration was applied and verified as `text`; staging now matches 18/18 local migrations. The video migration was rolled back, history-repaired, and replayed, restoring both columns, all three indexes, and both Storage policies.

## MUST FIX

- Transfer failure is unsafe: when provider download, Storage upload, or Storage signing fails, `jobs/[jobId]` writes `status=completed` and the provider temporary URL into `result_url`. The job cannot subsequently be retried by normal polling and violates the no-provider-URL binding requirement. Mark it retriable/transfer-failed without a playable `result_url` instead.
- Successful transfers store a seven-day signed URL, but no completed-job re-sign path uses `storage_path`; an expired URL remains `completed` and cannot be refreshed. Add server-side re-signing before UI/export access.
- Independently verify in staging the database unique-conflict return path, confirmed-first-frame resolution, refresh restoration, batch totals, and the full download → private Storage → re-sign lifecycle. Injected-fetch tests do not prove these external effects.
- Pending uncommitted navigation transition: the working tree changes the art handoff to `/production?mode=art&projectId=...`, but `tests/creation-workbench-ui.test.mjs` still requires `/art-workbench`. When that route change is submitted, update the assertion and preserve a context assertion for the project ID. This is not a failure in committed `aca4116`.

## Resolved MUST FIX

- [x] `expectedRevision: null` runtime regression: `7a617f8` extracts the validator used by `PUT /api/storyboard/state`; M4 executes it and rejects `null`, `undefined`, negative, string, and `NaN` revisions. The route returns 400 on that false result.
- [x] Staging migration prerequisite: `cwpyolxitkcpitqizgtq` (`kiikis-staging`) received all 15 migrations. `20260718100000_video_idempotency_and_storage.sql` was rolled back, history-repaired to `reverted`, and replayed successfully.
- [x] Database schema evidence: staging contains the partial unique index `uq_generation_jobs_idempotency_hash` on `(owner_id, idempotency_hash)`, `idempotency_hash` and `storage_path`, private `storyboard-videos`, and both owner Storage policies.
- [x] `expectedRevision: null` route guard: M4 executes the runtime validator used by `PUT /api/storyboard/state`, and the route's invalid-request branch returns HTTP 400 before calling the state RPC. `null`, `undefined`, negative, string, and `NaN` values are rejected.

## NIT

- Provider-specific route names and response fields should be consolidated behind the future Atlas adapter once the functional migration begins; this is not a current development blocker.
- Update the introductory comments in `tests/storyboard-video-e2e.test.mjs`, which still describe the removed `expectedRevision=null` snapshot behavior.

## Latest verification

- Targeted save/CAS suite (`storyboard-state-api`, `storyboard-e2e-scenarios`, `storyboard-video-e2e`): 35/35 passing, including M4.
- `pnpm exec tsc --noEmit`: passing.
- Clean committed `aca4116` (isolated worktree): `node --test tests/*.test.mjs` 219/219, typecheck and build all pass.
- Current shared working tree: 218/219 tests pass; the sole failure is the pending uncommitted art-route/test mismatch recorded above. Its typecheck and build pass.
- The existing `LOGO_PRIMARY` orphan-token warning remains non-fatal.
- `git diff --check bdc971e^..bdc971e`: passing.
- `git diff --check bdc971e..2644c9a`: passing.
- Tracked-source scan found no raw `apikey-<hex>` credential and no `NEXT_PUBLIC_` Atlas/MiniMax environment variable. Atlas uses `process.env.ATLASCLOUD_API_KEY` server-side; the provider response is not written to the job or logged.

The CAS remediation and M4 regression are closed. The remaining MUST FIX items require staging/browser evidence and do not reopen the closed CAS blocker.
