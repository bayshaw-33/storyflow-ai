# Production Workbench Rolling Review

> Governing PRD: KIIKIS 制作工作台 PRD —— Codex（安全与验证）
> Reviewed baseline: `719c9a0..b6adf17` on `main`
> Policy: only security items are BLOCKER. Functional and reliability gaps remain in this list for unified acceptance; they do not stop TRAE feature development.
> Latest rolling review: `bdc971e..2644c9a`, plus the subsequent M4 regression commit `7a617f8`.

## BLOCKER

### Closed — CAS bypass no longer writes current state

Resolved by `bdc971e` and independently reviewed on 2026-07-18. `SaveRequest.expectedRevision` is now `number`; `/api/storyboard/state` accepts only a non-negative integer at runtime. The 409 “另存快照” exit calls the separate snapshot API, whose only data operation is `POST storyflow_versions`; it neither queries nor writes the current storyboard state and never calls `save_storyboard_state`.

**Decision: CLOSED for the current-state CAS path.** The one remaining `expectedRevision ?? null` occurrence belongs to video-job metadata only; it does not invoke the storyboard state RPC or modify Scene/Shot current state.

### Migration execution must not use the current Supabase link

The checked-in Supabase CLI link is the production project. Before any migration execution, it must be switched to the designated staging project and the command output recorded without credentials. Production database writes remain prohibited.

## MUST FIX

- Before the paid-video path is enabled, execute `20260718100000_video_idempotency_and_storage.sql` in the designated staging project and perform its documented rollback rehearsal. The migration defines a real PostgreSQL partial unique index on `(owner_id, idempotency_hash)`, but it is not an active database invariant until staging execution is evidenced. The current CLI link is production, so no migration execution is authorized yet.
- Transfer failure is unsafe: when provider download, Storage upload, or Storage signing fails, `jobs/[jobId]` writes `status=completed` and the provider temporary URL into `result_url`. The job cannot subsequently be retried by normal polling and violates the no-provider-URL binding requirement. Mark it retriable/transfer-failed without a playable `result_url` instead.
- Successful transfers store a seven-day signed URL, but no completed-job re-sign path uses `storage_path`; an expired URL remains `completed` and cannot be refreshed. Add server-side re-signing before UI/export access.
- Independently verify in staging the database unique-conflict return path, confirmed-first-frame resolution, refresh restoration, batch totals, and the full download → private Storage → re-sign lifecycle. Injected-fetch tests do not prove these external effects.

## Resolved MUST FIX

- [x] `expectedRevision: null` runtime regression: `7a617f8` extracts the validator used by `PUT /api/storyboard/state`; M4 executes it and rejects `null`, `undefined`, negative, string, and `NaN` revisions. The route returns 400 on that false result.

## NIT

- Provider-specific route names and response fields should be consolidated behind the future Atlas adapter once the functional migration begins; this is not a current development blocker.
- Update the introductory comments in `tests/storyboard-video-e2e.test.mjs`, which still describe the removed `expectedRevision=null` snapshot behavior.

## Latest verification

- Targeted save/CAS suite (`storyboard-state-api`, `storyboard-e2e-scenarios`, `storyboard-video-e2e`): 35/35 passing.
- `node --test tests/*.test.mjs`: 214/214 passing.
- `npx tsc --noEmit`: passing.
- `pnpm build`: passing.
- `git diff --check bdc971e^..bdc971e`: passing.
- `git diff --check bdc971e..2644c9a`: passing.
- Tracked-source scan found no raw `apikey-<hex>` credential and no `NEXT_PUBLIC_` Atlas/MiniMax environment variable. Atlas uses `process.env.ATLASCLOUD_API_KEY` server-side; the provider response is not written to the job or logged.

The CAS remediation and M4 regression are closed. The remaining MUST FIX items require staging/browser evidence and do not reopen the closed CAS blocker.
