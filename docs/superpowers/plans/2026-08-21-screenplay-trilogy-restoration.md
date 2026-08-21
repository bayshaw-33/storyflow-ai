# Screenplay Trilogy Conversation Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the screenplay flow so a multi-turn KK conversation generates the world, character bible, and plot outline in sequence without manual left-navigation creation.

**Architecture:** Add a small server-side trilogy orchestrator on top of the existing conversation, AI prompt, unit, and immutable-version services. The UI exposes only the next valid generation action and refreshes the existing two-column workbench after generation or confirmation. The browser request helper refreshes an expired Supabase session and retries one unauthenticated request once.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase, Node test runner.

## Global Constraints

- Do not change the current workbench layout.
- Do not add or alter database tables, columns, RPCs, or migrations.
- Preserve all existing conversation messages, units, versions, and project data.
- Trilogy order is fixed: world -> character bible -> plot and outline.
- Each next stage becomes generatable only after the previous stage is user-confirmed as usable.
- Left navigation is display/navigation; manual creation is not required for the trilogy.

---

### Task 1: Trilogy workflow state and server orchestration

**Files:**
- Create: `lib/server/v2/screenplays/trilogy.ts`
- Create: `app/api/v2/works/[workId]/screenplay/trilogy/route.ts`
- Modify: `lib/server/v2/screenplays/generation.ts`
- Test: `tests/server-v2/screenplays/trilogy.test.mjs`

**Interfaces:**
- Consumes: existing `ScreenplayUnitsService`, `ScreenplayGenerationService`, `generateAIContent`, and immutable unit versions.
- Produces: `resolveTrilogyState(units)` and `generateNextTrilogyStage(params)`; POST returns `{ stage, unit, version, nextState }`.

- [ ] **Step 1: Write failing state-machine tests**

Cover world first, waiting for confirmation, character second, outline third, and complete state. Assert that a draft upstream unit never unlocks the next stage.

- [ ] **Step 2: Run the state-machine test and verify RED**

Run: `node --test tests/server-v2/screenplays/trilogy.test.mjs`

Expected: FAIL because `lib/server/v2/screenplays/trilogy.ts` does not exist.

- [ ] **Step 3: Implement the minimal state resolver and generation service**

Use these public shapes:

```ts
export type TrilogyStage = "world" | "character" | "outline";
export type TrilogyState =
  | { status: "ready"; stage: TrilogyStage; label: string }
  | { status: "waiting_confirmation"; stage: TrilogyStage; unitId: string }
  | { status: "complete"; stage: null };

export function resolveTrilogyState(units: ScreenplayUnitClientLike[]): TrilogyState;
```

The generator must load the saved conversation, include confirmed upstream documents, invoke the matching existing `creation_*` prompt, create only the missing target unit, save an immutable draft version with source message IDs, and append a persisted assistant acknowledgement. Repeated idempotency keys must not create duplicate units or versions.

- [ ] **Step 4: Add the authenticated route**

POST body:

```ts
{ conversationId: string; idempotencyKey: string }
```

Reject generation when the current stage awaits confirmation. Return the generated unit/version and next state using the existing safe error classifier.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test tests/server-v2/screenplays/trilogy.test.mjs tests/server-v2/screenplays/units.test.mjs tests/server-v2/screenplays/generation.test.mjs`

Expected: all tests pass.

### Task 2: Conversation-first trilogy controls

**Files:**
- Modify: `lib/client/v2/screenplay-studio/api.ts`
- Modify: `components/v2/screenplay-studio/KkScreenplayRoom.tsx`
- Modify: `components/v2/screenplay-studio/ScreenplayStudio.tsx`
- Test: `tests/ui-v2/screenplay-studio/trilogy-flow.test.mjs`

**Interfaces:**
- Consumes: POST trilogy endpoint and existing `refreshUnits`, `openUnit`, `confirmUsable` behavior.
- Produces: one contextual primary action: generate world, generate character bible, generate plot and outline, or review/confirm current draft.

- [ ] **Step 1: Write the failing UI contract test**

Assert that KK receives trilogy state, calls `screenplayStudioApi.generateNextTrilogyStage`, and that the parent refreshes/open the generated unit. Assert there is no requirement to call the left-navigation `createUnit` handler.

- [ ] **Step 2: Run the UI test and verify RED**

Run: `node --test tests/ui-v2/screenplay-studio/trilogy-flow.test.mjs`

Expected: FAIL because the new API and props do not exist.

- [ ] **Step 3: Add the minimal API method and contextual action**

Add:

```ts
generateNextTrilogyStage(workId, { conversationId, idempotencyKey })
```

The existing composer remains unchanged. Place a compact action near the conversation controls; do not add panels or columns. On success, retain chat history, refresh units, open the generated document for review, and return to conversation after “确认可用” so the next generation action appears.

- [ ] **Step 4: Run focused UI tests and verify GREEN**

Run: `node --test tests/ui-v2/screenplay-studio/trilogy-flow.test.mjs tests/ui-v2/screenplay-studio/layout.test.mjs tests/ui-v2/screenplay-studio/navigation.test.mjs`

Expected: all tests pass and layout contract remains two-column.

### Task 3: Expired-session recovery

**Files:**
- Modify: `lib/client/v2/screenplay-studio/auth.ts`
- Modify: `tests/ui-v2/screenplay-studio/auth.test.mjs`

**Interfaces:**
- Consumes: Supabase browser `getSession()` and `refreshSession()`.
- Produces: one refresh-and-retry on HTTP 401; no retry for other errors.

- [ ] **Step 1: Write failing auth retry tests**

Test that a 401 refreshes the session and replays once with the refreshed Bearer token. Test that 403/500 are returned without replay and that a second 401 stops after one retry.

- [ ] **Step 2: Run auth tests and verify RED**

Run: `node --test tests/ui-v2/screenplay-studio/auth.test.mjs`

Expected: FAIL because retry support is absent.

- [ ] **Step 3: Implement one safe retry**

Keep the existing public `fetchScreenplayStudio()` API. Factor a dependency-injected helper for testing, refresh only after the first 401, rebuild Authorization from the refreshed session, and replay the same request once.

- [ ] **Step 4: Run auth tests and verify GREEN**

Run: `node --test tests/ui-v2/screenplay-studio/auth.test.mjs`

Expected: all tests pass.

### Task 4: Full verification and release evidence

**Files:**
- Modify only if verification exposes a task-scoped defect.

- [ ] **Step 1: Run the complete screenplay test set**

Run: `node --test tests/server-v2/screenplays/ tests/ui-v2/screenplay-studio/ tests/contracts-v22/screenplay-studio.test.mjs`

- [ ] **Step 2: Run type checking**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Run production build**

Run: `pnpm build`

- [ ] **Step 4: Inspect the final diff**

Confirm no migration, schema, layout, shared navigation, or unrelated files changed.
