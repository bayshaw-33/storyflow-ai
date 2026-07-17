# Production Workbench Rolling Review

> Governing PRD: KIIKIS 制作工作台 PRD —— Codex（安全与验证）
> Reviewed baseline: `719c9a0..b6adf17` on `main`
> Policy: only security items are BLOCKER. Functional and reliability gaps remain in this list for unified acceptance; they do not stop TRAE feature development.

## BLOCKER

### Closed — CAS bypass no longer writes current state

Resolved by `bdc971e` and independently reviewed on 2026-07-18. `SaveRequest.expectedRevision` is now `number`; `/api/storyboard/state` accepts only a non-negative integer at runtime. The 409 “另存快照” exit calls the separate snapshot API, whose only data operation is `POST storyflow_versions`; it neither queries nor writes the current storyboard state and never calls `save_storyboard_state`.

**Decision: CLOSED for the current-state CAS path.** The one remaining `expectedRevision ?? null` occurrence belongs to video-job metadata only; it does not invoke the storyboard state RPC or modify Scene/Shot current state.

### Migration execution must not use the current Supabase link

The checked-in Supabase CLI link is the production project. Before any migration execution, it must be switched to the designated staging project and the command output recorded without credentials. Production database writes remain prohibited.

## MUST FIX

- Before the paid-video path is enabled, execute `20260718100000_video_idempotency_and_storage.sql` in the designated staging project and perform its documented rollback rehearsal. The current CLI link is production, so no migration execution is authorized yet.
- Independently verify in staging that the database unique constraint returns the original video job under concurrent submission, and that a completed provider URL is downloaded, hashed, persisted privately, and rebound as the Storage artifact.
- Independently verify server-side confirmed-first-frame resolution, refresh restoration, and batch totals in a real browser/staging flow. The existing tests use injected fetches and do not prove these external effects.
- Add a route-level regression test that posts `expectedRevision: null` to `/api/storyboard/state` and receives `400`; current M4 coverage reads the validator source rather than executing the Next route.

## NIT

- Provider-specific route names and response fields should be consolidated behind the future Atlas adapter once the functional migration begins; this is not a current development blocker.
- Update the introductory comments in `tests/storyboard-video-e2e.test.mjs`, which still describe the removed `expectedRevision=null` snapshot behavior.

## Latest verification

- Targeted save/CAS suite (`storyboard-state-api`, `storyboard-e2e-scenarios`, `storyboard-video-e2e`): 35/35 passing.
- `node --test tests/*.test.mjs`: 214/214 passing.
- `npx tsc --noEmit`: passing.
- `pnpm build`: passing.
- `git diff --check bdc971e^..bdc971e`: passing.
- Tracked-source scan found no raw `apikey-<hex>` credential and no `NEXT_PUBLIC_` Atlas/MiniMax environment variable. The two provider keys are referenced server-side only through `process.env.ATLASCLOUD_API_KEY` and `process.env.MINIMAX_API_KEY`.

The CAS remediation has code-level and injected-fetch coverage. The remaining MUST FIX items require staging/browser evidence and do not reopen the closed CAS blocker.
