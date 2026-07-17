# Evidence Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-only, append-only evidence ledger and private, hash-verifiable evidence packages scoped to a project episode.

**Architecture:** PostgreSQL owns the append transaction, sequence and hash chain. Next.js server routes authenticate callers and materialize allowlisted evidence ZIPs in private Storage.

**Tech Stack:** Next.js App Router, TypeScript, Supabase PostgREST/RPC/Storage, PostgreSQL `pgcrypto`, JSZip, Node test runner.

## Global Constraints

- Every record is scoped by `owner_id + project_id + source_unit_id`.
- Payloads and ZIPs never contain raw biometric media, unselected candidates, internal paths, email addresses, provider responses or secrets.
- Events are append-only; evidence status is not a legal ownership conclusion.
- Do not modify `components/production/ProductionWorkbench*`.

---

### Task 1: Database ledger

**Files:**

- Create: `supabase/migrations/20260719000000_evidence_ledger.sql`
- Create: `tests/evidence-ledger.test.mjs`

**Produces:** `storyflow_evidence_cases`, `storyflow_evidence_events`, `storyflow_evidence_documents`, `storyflow_evidence_packages`, a private `evidence-artifacts` bucket, and service-role-only `append_evidence_event` RPC.

- [ ] Write a failing migration assertion test requiring unique `(case_id, sequence_number)` and `(case_id, idempotency_key)`, owner-only reads, no authenticated mutation grants, immutable-event trigger, and service-role RPC grant.
- [ ] Run `node --test tests/evidence-ledger.test.mjs`; expect failure because the migration is absent.
- [ ] Add the migration. The RPC must lock the case with `FOR UPDATE`, allocate a sequence, compute the hash from the prior hash plus immutable event fields and canonical `jsonb::text`, insert by idempotency key, then update the case tip in one transaction.
- [ ] Run `node --test tests/evidence-ledger.test.mjs`; expect migration checks to pass.
- [ ] Commit with `git commit -m "feat(evidence): add append-only ledger schema"`.

### Task 2: Server ledger contract

**Files:**

- Create: `lib/evidence/types.ts`
- Create: `lib/evidence/ledger.ts`
- Modify: `tests/evidence-ledger.test.mjs`

**Consumes:** Task 1 RPC and `serviceFetch`.

**Produces:** `recordEvidenceEvent`, `listEvidenceEvents`, `verifyEvidenceChain`.

- [ ] Write failing tests for allowed event types, rejection of other event types and sensitive payload keys, correct scope/idempotency propagation, and tamper detection for payload or prior hash.
- [ ] Run `node --test tests/evidence-ledger.test.mjs`; expect missing-module failure.
- [ ] Implement literal event types `storyboard_snapshot_saved`, `generation_completed`, `reference_selected`, `export_released`, `package_generated`. The service sends only allowlisted fields to the RPC and independently verifies every returned event hash before packaging.
- [ ] Run `node --test tests/evidence-ledger.test.mjs`; expect contract tests to pass.
- [ ] Commit with `git commit -m "feat(evidence): add server ledger contract"`.

### Task 3: Private evidence package API

**Files:**

- Create: `lib/evidence/package.ts`
- Create: `app/api/evidence/packages/route.ts`
- Create: `app/api/evidence/packages/[packageId]/download/route.ts`
- Modify: `tests/evidence-ledger.test.mjs`

**Consumes:** Task 2 ledger functions, injected storage clients, JSZip and authenticated requests.

**Produces:** `POST /api/evidence/packages` and `GET /api/evidence/packages/:packageId/download`.

- [ ] Write failing tests using an in-memory Storage/PostgREST backend. Assert the ZIP has only `manifest.json` and `timeline.json` plus explicitly selected evidence-document files, stores a server hash, rejects cross-owner/cross-episode access, and signs for no more than 300 seconds.
- [ ] Run `node --test tests/evidence-ledger.test.mjs`; expect package-module failure.
- [ ] Implement deterministic ZIP materialization at a fixed event high-water mark. The manifest uses an explicit field allowlist; unavailable optional files are omitted, never replaced with provider URLs. Upload to `evidence-artifacts/<owner>/<sha256>.zip` with no overwrite, store the package row, append `package_generated`, then permit a short signed URL only after owner and scope validation.
- [ ] Reject client-provided event payloads, files, hashes and registration status. Require non-empty `projectId` and `sourceUnitId`; return one 404-shaped response for nonexistent and unauthorized package IDs.
- [ ] Run `node --test tests/evidence-ledger.test.mjs`; expect ZIP, isolation, hash and TTL checks to pass.
- [ ] Commit with `git commit -m "feat(evidence): add private evidence packages"`.

### Task 4: Automatic authoritative hooks

**Files:**

- Modify: `app/api/storyboard/snapshots/route.ts`
- Modify: `app/api/storyboard/assets/select-version/route.ts`
- Modify: `app/api/storyboard/jobs/[jobId]/route.ts`
- Modify: `app/api/exports/request/route.ts`
- Modify: `tests/evidence-ledger.test.mjs`
- Modify: `docs/DEV_HANDOFF_LOG.md`

**Consumes:** `recordEvidenceEvent`.

**Produces:** automatic entries after authoritative snapshot save, selected reference, completed generation and released export paths.

- [ ] Write failing tests asserting success paths use server-derived IDs and immutable source IDs as idempotency keys; blocked, failed, preview and draft paths must not call the ledger.
- [ ] Run `node --test tests/evidence-ledger.test.mjs`; expect hook assertions to fail.
- [ ] Add the minimal post-success hooks. Do not record raw prompts, provider responses, storage URLs or client claims. If recording fails after the source action commits, return a stable error so retry uses the same idempotency key and cannot create a second source object.
- [ ] Run `node --test tests/evidence-ledger.test.mjs`, `node --test tests/*.test.mjs`, `pnpm exec tsc --noEmit`, and `pnpm run build`; expect all commands to pass.
- [ ] Update the handoff with migration, scope, test results and any staging-only verification remaining, then commit with `git commit -m "feat(evidence): record production provenance"`.
