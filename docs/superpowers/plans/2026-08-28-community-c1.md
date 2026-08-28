# Kiikis Community C1 Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with test checkpoints.

**Goal:** Make Universe the organizing center of the community by adding a real public Universe view, source-aware search, version/update context, and an idempotent path from a Universe to a Project + primary Work.

**Architecture:** Keep C0's publication feed and legacy `/api/v2/community/discover` contract intact. Add a server-only community Universe projection that gates access through an active public Universe publication or authenticated owner/team access, then reads only public or owner-scoped summaries from existing Universe tables. Add keyset cursor search over the publication projection and reuse the existing project-start and Universe-bind APIs for creation.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase PostgREST service fetch, Node test runner, Playwright.

## Global Constraints

- C1 must not write Universe Canon while browsing or creating a community publication.
- Public viewers receive only active public Universe data and canon-level objects.
- Owner/team viewers may see draft candidates and local overlay summaries, never raw private patch payloads.
- Feed/search failures expose `degraded` and `correlationId`; an empty result is never a fixture fallback.
- Existing C0 and legacy community endpoints remain backward-compatible.

### Task 1: Contracts and server projection

**Files:**
- Create: `lib/contracts/v2/community-universe.ts`
- Create: `lib/server/v2/community/universe.ts`
- Test: `tests/community-v21-universe.test.mjs`

- [ ] Write tests for public access gating, owner-only draft/overlay visibility, status grouping, and degraded optional sources.
- [ ] Run the test and confirm it fails because the projection module is absent.
- [ ] Implement the typed Universe community projection with explicit public/owner visibility and no raw patch payloads.
- [ ] Query Universe, active Universe publication, linked projects, entities, versions, voice profiles, actor profiles, assets, local-state summaries, and inbox candidates through existing PostgREST tables.
- [ ] Convert optional table failures into `degraded: true` and `degradedSources`, while preserving a hard error for missing Universe or access denial.
- [ ] Run the focused test and confirm it passes.

### Task 2: Cursor search and feed contract

**Files:**
- Create: `lib/server/v2/community/search.ts`
- Create: `app/api/v2/community/search/route.ts`
- Modify: `app/api/v2/community/feed/route.ts`
- Test: `tests/community-v21-search.test.mjs`
- Test: `tests/community-v21-route.test.mjs`

- [ ] Write tests for base64url cursor parsing, keyset ordering by `created_at,id`, section filters, query filters, and `degraded/correlationId` response fields.
- [ ] Run the tests and confirm they fail because the search service and route are absent.
- [ ] Implement bounded query search over real publication fields (`title`, `summary`, `source_type`, `source_version`, `publisher_id`) with active/public filtering and cursor pagination.
- [ ] Make `/api/v2/community/feed` accept `cursor` and return `nextCursor` while preserving `nextOffset` for C0 clients.
- [ ] Add `/api/v2/community/search` with the same projection contract and explicit validation errors.
- [ ] Run focused and legacy community tests.

### Task 3: Universe community UI and creation path

**Files:**
- Create: `components/v2/community/UniverseCommunityPage.tsx`
- Create: `components/v2/community/UniverseWorksSection.tsx`
- Create: `components/v2/community/UniverseEntitiesSection.tsx`
- Create: `components/v2/community/UniverseTimeline.tsx`
- Create: `app/universe/[universeId]/community/page.tsx`
- Modify: `app/community/community.module.css`
- Test: `tests/community-v21-ui-contract.test.mjs`

- [ ] Write source-level UI tests for real Universe links, Canon/Local Overlay/Draft labels, the creation entry, and non-fake unavailable/error states.
- [ ] Run the test and confirm it fails before the page exists.
- [ ] Implement the three-column-to-single-column responsive Universe community view with summary, tags, versions, works, entities, timeline, and degraded notices.
- [ ] Implement follow using the existing idempotent community follows endpoint.
- [ ] Implement Project + primary Work creation by calling `/api/v2/project-start` with `universeId`, then `/api/v2/projects/:projectId/universe/bind` with the same authenticated session and an idempotency key; navigate only after the real workbench route is returned.
- [ ] Keep creation errors explicit, including the case where a Project was created but Universe binding failed.
- [ ] Run focused UI contract tests.

### Task 4: Integration verification

- [ ] Run `node --test tests/kiikis-21-community-*.test.mjs tests/community-v20-*.test.mjs tests/community-v21-*.test.mjs`.
- [ ] Run `pnpm exec tsc --noEmit` and `pnpm build` sequentially.
- [ ] Run Playwright against `/community` and `/universe/<id>/community` without service configuration; verify honest unavailable states and no fixture data.
- [ ] Run `git diff --check` and record the isolated branch/worktree for Coze verification.
