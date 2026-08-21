# Screenplay Conversation Height Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the screenplay conversation and diff views fill the AI panel so the transcript owns spare height and the composer remains at the bottom without trailing blank space.

**Architecture:** Add one explicit `mainView` layout class to each direct AI-panel view wrapper. That class completes the existing Flex height chain from `aiPanel` to `kkConversation`; no component state, API, or data model changes are required.

**Tech Stack:** Next.js 15, React, TypeScript, CSS Modules, Node.js test runner.

## Global Constraints

- Preserve the existing two-column screenplay studio and current visual style.
- Do not modify APIs, database migrations, conversation content, workflow stages, or other workbenches.
- The transcript must own remaining height and scroll independently.
- The error row must remain directly above the composer.

---

### Task 1: Complete the AI-panel height chain

**Files:**
- Modify: `tests/ui-v2/screenplay-studio/layout.test.mjs`
- Modify: `components/v2/screenplay-studio/ScreenplayStudio.tsx:708-727`
- Modify: `components/v2/screenplay-studio/ScreenplayStudio.module.css:155-180`

**Interfaces:**
- Consumes: the existing `aiPanel`, `kkConversation`, and `kkTranscript` Flex layout contract.
- Produces: a `mainView` CSS Module class used by conversation, diff, and document wrappers.

- [ ] **Step 1: Write the failing layout contract test**

Add a test asserting that all three direct view wrappers use `styles.mainView` and that the class establishes a vertical, shrinkable Flex container:

```js
test("screenplay main views complete the AI panel height chain", () => {
  const studio = readFileSync(new URL("../../../components/v2/screenplay-studio/ScreenplayStudio.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../../components/v2/screenplay-studio/ScreenplayStudio.module.css", import.meta.url), "utf8");

  assert.match(studio, /className=\{styles\.mainView\} data-testid="main-view-document"/);
  assert.match(studio, /className=\{styles\.mainView\} data-testid="main-view-diff"/);
  assert.match(studio, /className=\{styles\.mainView\} data-testid="main-view-conversation"/);
  assert.match(css, /\.mainView\s*\{[\s\S]*display:\s*flex[\s\S]*min-height:\s*0[\s\S]*flex:\s*1[\s\S]*flex-direction:\s*column/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test tests/ui-v2/screenplay-studio/layout.test.mjs
```

Expected: FAIL because `styles.mainView` and `.mainView` do not yet exist.

- [ ] **Step 3: Add the minimal height-chain implementation**

Apply `className={styles.mainView}` to each direct child of `aiPanel`, then add:

```css
.mainView {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}
```

This makes `kkConversation` receive the panel's computed height. Its existing `kkTranscript { flex: 1; overflow-y: auto; }` then absorbs spare height while `kkComposer` stays at the bottom.

- [ ] **Step 4: Run focused and regression verification**

Run:

```bash
node --test tests/ui-v2/screenplay-studio/layout.test.mjs tests/ui-v2/screenplay-studio/*.test.mjs tests/ui-v2/unified-workbench/*.test.mjs
npx tsc --noEmit
git diff --check
pnpm build
```

Expected: all tests pass, TypeScript reports zero errors, diff check is clean, and the production build succeeds.

- [ ] **Step 5: Commit the implementation**

```bash
git add tests/ui-v2/screenplay-studio/layout.test.mjs components/v2/screenplay-studio/ScreenplayStudio.tsx components/v2/screenplay-studio/ScreenplayStudio.module.css
git commit -m "fix(ui): fill screenplay conversation workspace"
```

- [ ] **Step 6: Publish and verify production**

```bash
git push origin codex/v22-unified-workbench-recovery
git push origin HEAD:main
pnpm exec vercel --prod --yes
```

Expected: GitHub branch and `main` point to the implementation commit; Vercel reports `READY` and aliases `www.kiikis.com` to the new production deployment.
