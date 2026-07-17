# Production Workbench Rolling Review

> Governing PRD: KIIKIS 制作工作台 PRD —— Codex（安全与验证）
> Reviewed baseline: `719c9a0..b6adf17` on `main`
> Policy: only security items are BLOCKER. Functional and reliability gaps remain in this list for unified acceptance; they do not stop TRAE feature development.

## BLOCKER

### CAS bypass is a current-state data-loss vector

`expectedRevision: null` reaches `save_storyboard_state`. PostgreSQL's `<> NULL` evaluates to NULL, so the RPC's `IF` does not raise `REVISION_CONFLICT` and proceeds to rewrite the current Scene/Shot state. The UI labels this path "另存快照", but it does not write an immutable `storyflow_versions` snapshot.

**Decision: 必须移除。** The current-state save API must require a non-negative integer revision. "另存快照" must use the separate snapshot API with an integer expected revision and must never write the current storyboard state after a conflict.

### Migration execution must not use the current Supabase link

The checked-in Supabase CLI link is the production project. Before any migration execution, it must be switched to the designated staging project and the command output recorded without credentials. Production database writes remain prohibited.

## MUST FIX

- Video idempotency is a read-before-insert lookup only. Add a database unique constraint and conflict-return path before real paid video use.
- The video completion route stores the provider CDN URL directly. Download, hash, persist to private Supabase Storage, then bind the stable artifact/version to the Shot.
- The video API accepts a browser-supplied first-frame URL rather than resolving the confirmed image version server-side.
- `listVideoJobs` exists but `ProductionWorkbench` does not invoke it, so refresh does not restore video job UI state.
- Video "E2E" tests use injected fetches and copied UI logic; add staging integration coverage for RPC conflict behavior, concurrent idempotency, provider completion, Storage binding, and refresh restoration.
- Batch progress reads stale React state after `await submitVideo`, so reported successful/failed totals can be inaccurate.

## NIT

- Provider-specific route names and response fields should be consolidated behind the future Atlas adapter once the functional migration begins; this is not a current development blocker.

## Latest verification

- `node --test tests/*.test.mjs`: 199/199 passing.
- `npx tsc --noEmit`: passing.
- `pnpm build`: passing.
- `git diff --check 719c9a0..b6adf17`: passing.
- Tracked-source scan found no raw `apikey-<hex>` credential and no `NEXT_PUBLIC_` Atlas/MiniMax environment variable. The two provider keys are referenced server-side only through `process.env.ATLASCLOUD_API_KEY` and `process.env.MINIMAX_API_KEY`.

These tests do not exercise a real PostgreSQL `NULL` comparison, a database unique constraint, or Storage transfer, so they do not alter the classifications above.
