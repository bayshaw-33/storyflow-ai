# AI Chat Focus Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every existing Kiikis AI chat surface a reversible, full-viewport focus mode that keeps the active conversation and draft intact.

**Architecture:** Add a small client-side `ChatFocusFrame` component that owns focus state, Escape handling, body-scroll locking, and accessible mode controls. Existing workbenches keep their message and composer state; each one places its existing chat content in the frame so it is visually elevated without remounting. A shared CSS module supplies the overlay and responsive layout.

**Tech Stack:** Next.js App Router, React 19, TypeScript, CSS Modules, Node test runner.

## Global Constraints

- Preserve current chat messages, draft text, file selections, and in-flight request state when focus changes.
- `Escape` exits only active focus mode; the visible control must expose `aria-pressed` and a localized accessible label.
- No new dependencies, routes, API calls, or persistence schema changes.
- Focus mode must work at desktop and narrow mobile widths, respect reduced motion, and restore document scroll on exit/unmount.

---

### Task 1: Establish the reusable focus-frame contract

**Files:**
- Create: `components/creation/ChatFocusFrame.tsx`
- Create: `components/creation/ChatFocusFrame.module.css`
- Create: `tests/chat-focus-frame.test.mjs`

**Interfaces:**
- Produces: `ChatFocusFrame({ children, label, title, toggleLabel, exitLabel }: ChatFocusFrameProps)`.
- Consumes: existing workbench chat body as `children`; no workbench state is moved into the component.

- [ ] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("../components/creation/ChatFocusFrame.tsx", import.meta.url);
const stylesPath = new URL("../components/creation/ChatFocusFrame.module.css", import.meta.url);

test("chat focus frame provides a reversible accessible full-screen mode", async () => {
  const [component, styles] = await Promise.all([readFile(componentPath, "utf8"), readFile(stylesPath, "utf8")]);
  assert.match(component, /useState\(false\)/);
  assert.match(component, /event\.key === "Escape"/);
  assert.match(component, /document\.body\.style\.overflow/);
  assert.match(component, /aria-pressed=\{focused\}/);
  assert.match(component, /children/);
  assert.match(styles, /position:\s*fixed/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/chat-focus-frame.test.mjs`

Expected: FAIL because `ChatFocusFrame.tsx` and its CSS module do not exist.

- [ ] **Step 3: Write the minimal implementation**

```tsx
export type ChatFocusFrameProps = {
  children: ReactNode;
  label: string;
  title: string;
  toggleLabel: string;
  exitLabel: string;
};

export function ChatFocusFrame({ children, label, title, toggleLabel, exitLabel }: ChatFocusFrameProps) {
  const [focused, setFocused] = useState(false);
  // When focused, lock page scrolling and exit on Escape; restore the previous
  // overflow value in the effect cleanup.
  return <section className={focused ? styles.focused : styles.frame}>{children}</section>;
}
```

Implement the complete effect cleanup and a header button using the exact props above. Keep `children` mounted in both states.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/chat-focus-frame.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/creation/ChatFocusFrame.tsx components/creation/ChatFocusFrame.module.css tests/chat-focus-frame.test.mjs
git commit -m "feat: add reusable AI chat focus frame"
```

### Task 2: Integrate focus mode into the creation workbench

**Files:**
- Modify: `components/creation/CreationWorkbench.tsx`
- Modify: `tests/creation-workbench-ui.test.mjs`

**Interfaces:**
- Consumes: `ChatFocusFrame` from Task 1.
- Produces: focus toggle for the existing “和 KK 一起创作 / Create with KK” AI panel without changing its `messages`, `chatInput`, uploads, scope controls, or send/generate callbacks.

- [ ] **Step 1: Write the failing test**

```js
test("wraps the creation AI chat in the shared focus frame", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /import \{ ChatFocusFrame \} from "@\/components\/creation\/ChatFocusFrame"/);
  assert.match(source, /<ChatFocusFrame[\s\S]*label=\{isZh \? "创作对话" : "Creation chat"\}/);
  assert.match(source, /chatInputRef/);
  assert.match(source, /sourceFiles\.map/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/creation-workbench-ui.test.mjs`

Expected: FAIL because the creation AI panel does not use `ChatFocusFrame`.

- [ ] **Step 3: Write the minimal implementation**

Import `ChatFocusFrame` and wrap the existing `creation-ai-panel` contents—header, project settings, thread, source bar, scope controls, and composer—in it. Use Chinese labels `专注创作` and `退出专注`; use English labels `Focus writing` and `Exit focus`. Keep the existing collapse button and every callback unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/creation-workbench-ui.test.mjs tests/chat-focus-frame.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/creation/CreationWorkbench.tsx tests/creation-workbench-ui.test.mjs
git commit -m "feat: add focus mode to creation chat"
```

### Task 3: Extend the shared interaction to standalone AI workbenches

**Files:**
- Modify: `app/song-workbench/page.tsx`
- Modify: `app/storyboard-workbench/page.tsx`
- Modify: `app/video-workbench/page.tsx`
- Modify: `app/viral-workbench/page.tsx`
- Modify: `components/art/ArtWorkbench.tsx`
- Create: `tests/ai-chat-focus-coverage.test.mjs`

**Interfaces:**
- Consumes: `ChatFocusFrame` from Task 1.
- Produces: an identical focus-mode affordance around each workbench's existing AI message thread and composer.

- [ ] **Step 1: Write the failing test**

```js
const files = [
  "app/song-workbench/page.tsx",
  "app/storyboard-workbench/page.tsx",
  "app/video-workbench/page.tsx",
  "app/viral-workbench/page.tsx",
  "components/art/ArtWorkbench.tsx",
];

test("all standalone AI chat workbenches use the focus frame", async () => {
  for (const file of files) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /ChatFocusFrame/, `${file} should provide focus mode`);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/ai-chat-focus-coverage.test.mjs`

Expected: FAIL for every workbench that has not yet imported the shared frame.

- [ ] **Step 3: Write the minimal implementation**

For every listed file, import the shared component and place the pre-existing chat thread plus composer inside it. Pass the workbench-appropriate heading as `title`, and localize the same focus/exit labels as Task 2. Do not alter message creation, request submission, uploads, tools, or other workbench layout.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/ai-chat-focus-coverage.test.mjs tests/chat-focus-frame.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/song-workbench/page.tsx app/storyboard-workbench/page.tsx app/video-workbench/page.tsx app/viral-workbench/page.tsx components/art/ArtWorkbench.tsx tests/ai-chat-focus-coverage.test.mjs
git commit -m "feat: add AI chat focus mode across workbenches"
```

### Task 4: Validate and publish

**Files:**
- Modify: none beyond Tasks 1–3.

**Interfaces:**
- Consumes: all focus-mode components and tests from Tasks 1–3.
- Produces: a production main-branch deployment containing the focused chat experience.

- [ ] **Step 1: Run the complete unit suite**

Run: `pnpm run test:unit`

Expected: PASS with no new failures.

- [ ] **Step 2: Run the production build**

Run: `pnpm run build`

Expected: Next.js production build completes successfully.

- [ ] **Step 3: Manually verify the primary creation flow**

Run: `pnpm dev`

Open `/novel-workbench`, open the KIiKIS AI panel, type a draft without sending, enter focus mode, exit with Escape, and confirm the draft text, thread, source files, and stage controls remain unchanged. Repeat at a narrow viewport and confirm the composer remains reachable.

- [ ] **Step 4: Push and confirm the production deployment**

Run: `git push origin main`

Expected: the Vercel deployment for the pushed commit reaches `READY`; confirm the production JavaScript bundle contains `Focus writing` and `Exit focus`.
