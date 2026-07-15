# Art Workbench Assistant Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the desktop KK Art Assistant collapse into a 48px rail while retaining a 38:62 assistant/repository ratio whenever it is expanded.

**Architecture:** Keep the collapse preference as local component state in `ArtWorkbench`; no persistence or data-flow changes are needed. The component applies a modifier class to the existing workspace and conditionally hides the assistant content, while the CSS module owns the expanded, collapsed, and mobile grid rules.

**Tech Stack:** Next.js 15, React 19, TypeScript, CSS Modules, Node built-in test runner.

## Global Constraints

- Above 760px, expanded workspace columns must be exactly `38fr 62fr`.
- Above 760px, collapsed workspace columns must be `48px minmax(0, 1fr)`.
- At 760px or below, retain the existing vertically stacked layout.
- Do not alter asset-card density, global navigation, chat behavior, or persistence.
- Do not stage or commit unrelated working-tree changes.

---

### Task 1: Specify the collapse contract with a focused regression test

**Files:**
- Create: `tests/art-workbench-layout.test.mjs`
- Read: `components/art/ArtWorkbench.tsx`
- Read: `components/art/ArtWorkbench.module.css`

**Interfaces:**
- Consumes: static source of the art workbench and its scoped stylesheet.
- Produces: a regression test that protects the exact desktop ratios, 48px rail, toggle accessibility, and unchanged mobile breakpoint.

- [ ] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("../components/art/ArtWorkbench.tsx", import.meta.url);
const stylesheetPath = new URL("../components/art/ArtWorkbench.module.css", import.meta.url);

test("art workbench provides an accessible 48px assistant rail without changing the expanded 38:62 ratio", async () => {
  const [component, stylesheet] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(stylesheetPath, "utf8"),
  ]);

  assert.match(component, /const \[isAssistantCollapsed, setIsAssistantCollapsed\] = useState\(false\)/);
  assert.match(component, /aria-expanded=\{!isAssistantCollapsed\}/);
  assert.match(component, /className=\{`${styles\.workspace} \$\{isAssistantCollapsed \? styles\.assistantCollapsed : ""\}`\}/);
  assert.match(stylesheet, /grid-template-columns:minmax\(340px,38fr\) minmax\(520px,62fr\)/);
  assert.match(stylesheet, /\.assistantCollapsed\{grid-template-columns:48px minmax\(0,1fr\)\}/);
  assert.match(stylesheet, /@media\(max-width:760px\)/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/art-workbench-layout.test.mjs`

Expected: FAIL because neither `isAssistantCollapsed` nor `.assistantCollapsed` exists.

- [ ] **Step 3: Implement the minimal component toggle**

In `components/art/ArtWorkbench.tsx`, extend the Lucide import with `PanelLeftClose` and `PanelLeftOpen`, then add local state beside the other `useState` calls:

```tsx
const [isAssistantCollapsed, setIsAssistantCollapsed] = useState(false);
```

Replace the workspace opening element and the assistant header with:

```tsx
<div className={`${styles.workspace} ${isAssistantCollapsed ? styles.assistantCollapsed : ""}`}>
  <section className={styles.chatPanel}>
    <div className={styles.chatHead}>
      <div>
        <MessageSquareText size={18} />
        <strong>KK 美术助理</strong>
      </div>
      <div className={styles.chatHeadActions}>
        <button type="button" className={styles.collapseButton} aria-expanded={!isAssistantCollapsed} aria-label={isAssistantCollapsed ? "展开 KK 美术助理" : "折叠 KK 美术助理"} title={isAssistantCollapsed ? "展开 KK 美术助理" : "折叠 KK 美术助理"} onClick={() => setIsAssistantCollapsed((collapsed) => !collapsed)}>
          {isAssistantCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
        <button type="button" className={styles.manageSourcesButton} onClick={() => sourceInput.current?.click()}><FilePlus2 size={15} />管理资料</button>
      </div>
    </div>
    {!isAssistantCollapsed ? <>
      <div className={styles.sourceChips}>{state.sourceFiles.slice(0, 5).map((file) => <span key={file.id}>{file.name}</span>)}{state.projectTitle ? <span>Universe · {state.projectTitle}</span> : null}{!state.sourceFiles.length && !state.projectTitle ? <small>还没有资料，上传剧本或关联项目即可开始</small> : null}</div>
      <div className={styles.messages}>{messages.map((item) => <article key={item.id} className={item.role === "user" ? styles.userMessage : styles.assistantMessage}><p>{item.content}</p>{item.note ? <small>{item.note}</small> : null}</article>)}{busy === "chat" ? <div className={styles.thinking}><LoaderCircle className={styles.spin} size={16} />KK 正在整理美术仓库...</div> : null}</div>
      <div className={styles.composer}>
        {pendingImage ? <div className={styles.pendingImage}><img src={pendingImage.url} alt="待发送参考" /><span>{pendingImage.name}</span><button type="button" onClick={() => setPendingImage(null)}>×</button></div> : null}
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void sendMessage(); }} placeholder="告诉 KK 要增加、编辑或修改什么，也可以上传剧本、图片和角色参考……" />
        <div className={styles.composerActions}><div><button type="button" onClick={() => sourceInput.current?.click()} title="上传资料"><Upload size={16} />文件</button><button type="button" onClick={() => imageInput.current?.click()} title="上传图片"><ImagePlus size={16} />图片</button><button type="button" onClick={extractAssets} disabled={busy === "extract"}><Sparkles size={16} />自动拆解</button></div><button className={styles.sendButton} type="button" onClick={sendMessage} disabled={busy === "chat"}><Send size={17} /></button></div>
        <input ref={sourceInput} hidden multiple type="file" accept=".txt,.md,.json,.csv,.doc,.docx,.pdf,.html,.htm,.xlsx" onChange={uploadSource} />
        <input ref={imageInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadImage} />
      </div>
    </> : null}
```

Close the fragment immediately after the existing `.composer` block. This hides the assistant body only after collapse and keeps its existing behavior intact when expanded.

- [ ] **Step 4: Implement the scoped layout rules**

In `components/art/ArtWorkbench.module.css`, add the following rules next to `.workspace` and the chat-header rules:

```css
.assistantCollapsed{grid-template-columns:48px minmax(0,1fr)}
.chatHeadActions{display:flex;align-items:center;gap:6px}
.collapseButton{width:30px;height:30px;border:1px solid #303638;background:#171b1d;color:#aeb7b8;border-radius:5px;display:grid;place-items:center}
.assistantCollapsed .chatHead{height:100%;padding:0;justify-content:center}
.assistantCollapsed .chatHead>div:first-child{display:none}
.assistantCollapsed .manageSourcesButton{display:none}
```

Remove the `.workspace{grid-template-columns:minmax(320px,40fr) minmax(440px,60fr)}` override from the `@media(max-width:1050px)` block, leaving its two-column asset grid rule in place. Do not change the existing `@media(max-width:760px)` vertical-stack declarations.

- [ ] **Step 5: Run the focused test to verify it passes**

Run: `node --test tests/art-workbench-layout.test.mjs`

Expected: PASS with one passing subtest.

- [ ] **Step 6: Run the existing art-domain regression test**

Run: `node --test tests/art-domain.test.mjs`

Expected: PASS with four passing subtests.

- [ ] **Step 7: Build the application**

Run: `npm run build`

Expected: Next.js completes successfully with no TypeScript or CSS-module errors.

- [ ] **Step 8: Commit only the layout work after approval**

```bash
git add components/art/ArtWorkbench.tsx components/art/ArtWorkbench.module.css tests/art-workbench-layout.test.mjs docs/superpowers/plans/2026-07-13-art-workbench-assistant-collapse.md
git commit -m "feat: collapse art workbench assistant"
```

Do not run this step unless the user explicitly authorizes creating a commit on the current branch.

## Self-Review

- Spec coverage: Task 1 covers the 38:62 expanded desktop grid, 48px collapsed rail, accessible toggle, and preserved 760px mobile stack. The out-of-scope areas are not touched.
- Placeholder scan: no deferred implementation or vague test steps remain.
- Type consistency: the only new state is local boolean `isAssistantCollapsed`; no cross-file types or data APIs are introduced.
