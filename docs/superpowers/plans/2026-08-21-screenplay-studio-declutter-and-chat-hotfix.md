# Screenplay Studio Declutter and Chat Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore production KK chat by enforcing UUID conversation identifiers and turn the screenplay stage into the approved quiet, AI-first two-column workspace.

**Architecture:** The client uses the Work UUID as its stable default conversation ID. A small server helper validates UUIDs and normalizes the legacy `kk-<work UUID>` shape before any Supabase request; both discuss and propose-change routes use the same helper. The existing two-column studio remains intact while the KK room removes its promotional hero and redundant labels, moving stage context and recoverable errors into compact rows around the transcript and composer.

**Tech Stack:** Next.js 15, React 19, TypeScript, CSS Modules, Node test runner, Supabase REST, Vercel.

## Global Constraints

- Do not execute a database migration or delete, rewrite, or backfill existing project, screenplay, or Universe data.
- Keep the fixed global left navigation, compact four-stage production navigation, Universe controls, versions, evidence, localization, and provenance features available.
- Preserve the screenplay workflow order: world, character bible, plot and outline, episode plan, screenplay scenes.
- Similarity review remains nested under outline and must not become the default active step.
- Failed generation must preserve user input, message history, pending candidates, and the retry snapshot.
- All production errors shown to users must be readable and may include a request ID, but must not expose raw Supabase payloads.

---

### Task 1: Enforce UUID conversation identity

**Files:**
- Create: `lib/server/v2/screenplays/conversation-id.ts`
- Modify: `components/v2/screenplay-studio/ScreenplayStudio.tsx`
- Modify: `app/api/v2/works/[workId]/screenplay/discuss/route.ts`
- Modify: `app/api/v2/works/[workId]/screenplay/propose-change/route.ts`
- Create: `tests/contracts-v22/screenplay-conversation-id.test.mjs`
- Modify: `tests/ui-v2/screenplay-studio/layout.test.mjs`

**Interfaces:**
- Produces: `normalizeScreenplayConversationId(workId: string, requested?: string | null): string | null`.
- Consumes: the route `workId` and optional body/query `conversationId`.

- [ ] **Step 1: Write failing regression tests**

```ts
assert.equal(normalizeScreenplayConversationId(WORK, WORK), WORK);
assert.equal(normalizeScreenplayConversationId(WORK, `kk-${WORK}`), WORK);
assert.equal(normalizeScreenplayConversationId(WORK, "not-a-uuid"), null);
assert.equal(normalizeScreenplayConversationId(WORK, ""), WORK);
```

Add a layout contract assertion that `ScreenplayStudio.tsx` derives the default conversation ID from `workId` and no longer contains `` `kk-${workId``.

- [ ] **Step 2: Run tests and verify the production incident is reproduced**

Run:

```bash
node --test tests/contracts-v22/screenplay-conversation-id.test.mjs tests/ui-v2/screenplay-studio/layout.test.mjs
```

Expected: FAIL because the helper does not exist and the client still adds `kk-`.

- [ ] **Step 3: Implement the UUID normalizer**

```ts
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeScreenplayConversationId(workId: string, requested?: string | null): string | null {
  const work = workId.trim();
  if (!UUID_PATTERN.test(work)) return null;
  const value = requested?.trim() ?? "";
  if (!value) return work;
  if (UUID_PATTERN.test(value)) return value;
  if (value === `kk-${work}`) return work;
  return null;
}
```

- [ ] **Step 4: Apply one identity rule to client and routes**

In `ScreenplayStudio.tsx`, use `workId ?? ""` as the conversation ID. In GET and POST discuss routes and the POST propose-change route, normalize before constructing service parameters. Return status 422 with code `validation_failed` when normalization returns null. Use the normalized value for similarity-review evidence.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test tests/contracts-v22/screenplay-conversation-id.test.mjs tests/contracts-v22/screenplay-hotfix.test.mjs tests/ui-v2/screenplay-studio/layout.test.mjs
```

Expected: all tests PASS and no source path creates `kk-<work UUID>`.

- [ ] **Step 6: Commit the chat hotfix**

```bash
git add lib/server/v2/screenplays/conversation-id.ts components/v2/screenplay-studio/ScreenplayStudio.tsx app/api/v2/works/[workId]/screenplay/discuss/route.ts app/api/v2/works/[workId]/screenplay/propose-change/route.ts tests/contracts-v22/screenplay-conversation-id.test.mjs tests/ui-v2/screenplay-studio/layout.test.mjs
git commit -m "fix(api): normalize screenplay conversation UUIDs"
```

### Task 2: Implement the quiet AI conversation workspace

**Files:**
- Modify: `components/v2/screenplay-studio/KkScreenplayRoom.tsx`
- Modify: `components/v2/screenplay-studio/ScreenplayStudio.module.css`
- Modify: `tests/ui-v2/screenplay-studio/layout.test.mjs`
- Modify: `tests/ui-v2/screenplay-studio/candidate-diff.test.mjs`

**Interfaces:**
- Consumes: existing `contextSummary`, `messages`, `pendingCandidate`, `presetInput`, and retry callbacks.
- Produces: the same `KkScreenplayRoom` props and action semantics; no API contract changes.

- [ ] **Step 1: Write failing source-contract tests for the approved layout**

Assert that the room contains a compact context bar, transcript, compact error, tabs, composer, and send/retry actions. Assert that it no longer contains the promotional strings `KK · AI 剧本伙伴`, `从你的意图开始`, `对话优先`, or the explanatory header subtitle.

- [ ] **Step 2: Run UI tests and verify they fail**

Run:

```bash
node --test tests/ui-v2/screenplay-studio/layout.test.mjs tests/ui-v2/screenplay-studio/candidate-diff.test.mjs
```

Expected: FAIL while the old hero and redundant copy remain.

- [ ] **Step 3: Remove redundant presentation without removing capabilities**

Keep the mode tabs and composer. Replace the large empty-state hero with a normal assistant message in the transcript. Render `contextSummary.label` and its short state in a single compact context row. Keep candidate-diff rendering unchanged.

- [ ] **Step 4: Compact recoverable errors**

Move the error block immediately above the composer. Display the readable message, optional request ID, and one retry button. Do not clear `input`, `messages`, or `pendingCandidate` on failure.

- [ ] **Step 5: Update CSS for a transcript-first vertical layout**

Remove hero-only sizing and typography. Give the transcript flexible remaining height, use a 32-40px context row, and keep the composer visible at the bottom. Preserve current desktop and narrow behavior.

- [ ] **Step 6: Run focused UI tests**

Run:

```bash
node --test tests/ui-v2/screenplay-studio/layout.test.mjs tests/ui-v2/screenplay-studio/candidate-diff.test.mjs tests/ui-v2/unified-workbench/layout.test.mjs
```

Expected: all tests PASS; the two-column and global-navigation contracts remain intact.

- [ ] **Step 7: Commit the interface reduction**

```bash
git add components/v2/screenplay-studio/KkScreenplayRoom.tsx components/v2/screenplay-studio/ScreenplayStudio.module.css tests/ui-v2/screenplay-studio/layout.test.mjs tests/ui-v2/screenplay-studio/candidate-diff.test.mjs
git commit -m "fix(ui): simplify the screenplay conversation workspace"
```

### Task 3: Verify, publish, and inspect production

**Files:**
- Modify only if verification exposes a regression in files already listed above.

**Interfaces:**
- Consumes: Tasks 1 and 2 commits.
- Produces: synchronized feature branch, GitHub `main`, and Vercel production deployment.

- [ ] **Step 1: Run the complete targeted verification set**

```bash
node --test tests/contracts-v22/screenplay-conversation-id.test.mjs tests/contracts-v22/screenplay-hotfix.test.mjs tests/server-v2/screenplays/*.test.mjs tests/ui-v2/screenplay-studio/*.test.mjs tests/ui-v2/unified-workbench/*.test.mjs
npx tsc --noEmit
git diff --check
pnpm build
```

Expected: targeted tests pass, TypeScript reports zero errors, diff check is clean, and production build succeeds.

- [ ] **Step 2: Push feature and main**

```bash
git fetch origin
git push origin codex/v22-unified-workbench-recovery
git push origin HEAD:main
```

Expected: feature and `main` resolve to the same final commit.

- [ ] **Step 3: Deploy Vercel production**

```bash
pnpm exec vercel --prod --yes
```

Expected: deployment reaches READY and aliases `https://www.kiikis.com`.

- [ ] **Step 4: Verify live artifacts and logs**

Confirm `/production` returns HTTP 200, the production JS contains the compact conversation UI, and no new `22P02 invalid input syntax for type uuid` appears for screenplay discuss. If a signed-in smoke request is available, send one chat message and verify the response persists after refresh.

- [ ] **Step 5: Record the durable project update**

Record the root cause, final commit, deployment ID, verification results, and the permanent rule that screenplay conversation IDs must be UUIDs in `01 项目/kiikis.com/当前状态.md` through the Obsidian memory tool.
