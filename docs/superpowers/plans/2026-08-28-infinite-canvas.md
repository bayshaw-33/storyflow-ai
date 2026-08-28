# Infinite Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Upgrade the existing storyboard canvas into an infinite director board while preserving the current workbench layout, draft persistence, routes, and database schema.

**Architecture:** Keep `StoryboardCanvas` as the fifth subview of `UnifiedStoryboardStage`. Extend the existing `StoryboardCanvasState` with optional layout-only fields, normalize old states at the component boundary, and keep all source content in `scenes`/`frames`. Use a DOM-based world layer with a viewport transform, requestAnimationFrame throttling for pointer movement, and no new runtime dependency.

**Tech Stack:** Next.js App Router, React 19, TypeScript, inline React styles, Node `node:test`, Playwright Chromium.

## Global Constraints

- Preserve the existing Production Workbench layout, routes, draft save chain, and database schema.
- Keep `StoryboardCanvas` as the fifth `UnifiedStoryboardStage` subview labeled `画布`.
- Reuse existing `ProductionProjectState.storyboardCanvas`; add only optional JSON fields and no Supabase migration.
- Existing `viewport`, `shots`, and `notes` data must remain readable and must not be silently deleted.
- “移出画布” may remove only a canvas reference; it must never delete a source shot or project.
- Do not introduce React Flow, tldraw, Konva, or another runtime canvas dependency.
- AI assistance, if shown, must be suggestion-only and cannot mutate script or storyboard text automatically.

## File Map

- Modify `lib/production/types.ts`: add optional canvas schema fields and layout object types.
- Create `lib/production/storyboard-canvas.ts`: pure compatibility, geometry, layout, and export helpers.
- Modify `components/production/StoryboardCanvas.tsx`: infinite viewport, selection, groups, edges, auto layout, and compact controls.
- Modify `components/production/ProductionWorkbench.tsx`: pass the existing shot-opening callback without changing persistence or routing.
- Create `tests/storyboard-canvas-helpers.test.mjs`: source-level contract checks for helper exports and backward-compatible state shape.
- Modify `tests/contracts-v22/storyboard-canvas.test.mjs`: preserve old contract assertions and add infinite-canvas controls/actions.
- Modify `e2e/v22-unified-production-workbench.spec.ts`: browser coverage for opening canvas, pan/zoom, add note, fit view, and export controls using the repository's existing auth-gated fixture.

### Task 1: Add backward-compatible canvas model helpers

**Files:**

- Modify: `lib/production/types.ts:114-126`
- Create: `lib/production/storyboard-canvas.ts`
- Test: `tests/storyboard-canvas-helpers.test.mjs`

**Interfaces:**

- `normalizeStoryboardCanvas(value: StoryboardCanvasState | null | undefined): StoryboardCanvasState`
- `getCanvasBounds(state: StoryboardCanvasState, sizes?: CanvasObjectSizes): CanvasBounds | null`
- `layoutShotsByScene(shots: StoryboardCanvasShotRef[], shotMeta: CanvasShotMeta[]): StoryboardCanvasShotRef[]`
- `fitViewport(bounds: CanvasBounds | null, viewportWidth: number, viewportHeight: number): StoryboardCanvasViewport`

- [ ] **Step 1: Write the failing source contract test**

Add assertions that `storyboard-canvas.ts` exports the four named helpers, `StoryboardCanvasState` retains `viewport/shots/notes`, and the new fields are optional.

```js
test("canvas helper module exposes compatibility and geometry functions", () => {
  const source = read("../lib/production/storyboard-canvas.ts");
  for (const name of ["normalizeStoryboardCanvas", "getCanvasBounds", "layoutShotsByScene", "fitViewport"]) {
    assert.match(source, new RegExp(`export function ${name}`));
  }
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test tests/storyboard-canvas-helpers.test.mjs`  
Expected: FAIL because `lib/production/storyboard-canvas.ts` does not exist.

- [ ] **Step 3: Add the minimal types and helpers**

Add `schemaVersion?: 2`, `groups?: StoryboardCanvasGroup[]`, and `edges?: StoryboardCanvasEdge[]` while preserving old fields. The normalizer must default missing collections, clamp invalid zoom to `0.1..4`, coerce non-finite coordinates to `0`, deduplicate shot references, and leave note text unchanged. Geometry helpers must calculate bounds from shots, notes, and groups without touching source scene data.

- [ ] **Step 4: Run the helper contract test and TypeScript check**

Run: `node --test tests/storyboard-canvas-helpers.test.mjs`  
Run: `npx tsc --noEmit`  
Expected: the new contract passes and TypeScript reports 0 errors.

- [ ] **Step 5: Commit the model layer**

```bash
git add lib/production/types.ts lib/production/storyboard-canvas.ts tests/storyboard-canvas-helpers.test.mjs
git commit -m "feat(canvas): add backward-compatible canvas model"
```

### Task 2: Replace finite viewport behavior with infinite viewport behavior

**Files:**

- Modify: `components/production/StoryboardCanvas.tsx`
- Modify: `tests/contracts-v22/storyboard-canvas.test.mjs`

**Interfaces:**

- Keep `onPointerDown={handleBackgroundPointerDown}` and `onWheel={handleWheel}` so existing contracts remain valid.
- Add `handleFitView`, `handleKeyDown`, and pointer-centered `zoomAtPoint(event, nextZoom)` behavior.
- Continue calling the existing `onChange(nextState)` so `ProductionWorkbench` persistence is unchanged.

- [ ] **Step 1: Add failing contract assertions**

Assert that the component contains `适配视图`, `zoomAtPoint`, `handleFitView`, `requestAnimationFrame`, `space`, and a `0.1`/`4` zoom range.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test tests/contracts-v22/storyboard-canvas.test.mjs`  
Expected: FAIL on the new assertions.

- [ ] **Step 3: Implement minimal viewport changes**

Normalize `canvas` before rendering. Keep the world layer at `width: 1px; height: 1px` and transform it with the viewport. Implement pointer-centered zoom using the world point under the cursor:

```ts
const worldX = (event.nativeEvent.offsetX - viewport.x) / viewport.zoom;
const worldY = (event.nativeEvent.offsetY - viewport.y) / viewport.zoom;
const zoom = clampZoom(viewport.zoom * factor);
update({ viewport: { x: event.nativeEvent.offsetX - worldX * zoom, y: event.nativeEvent.offsetY - worldY * zoom, zoom } });
```

Use `requestAnimationFrame` to merge drag updates and release the frame on pointer end. Add `适配视图` using `getCanvasBounds` and `fitViewport`. Add keyboard handling that ignores `input`, `textarea`, and `[contenteditable="true"]`.

- [ ] **Step 4: Run focused tests and TypeScript**

Run: `node --test tests/contracts-v22/storyboard-canvas.test.mjs`  
Run: `npx tsc --noEmit`  
Expected: all focused assertions pass and TypeScript reports 0 errors.

- [ ] **Step 5: Commit viewport behavior**

```bash
git add components/production/StoryboardCanvas.tsx tests/contracts-v22/storyboard-canvas.test.mjs
git commit -m "feat(canvas): add infinite viewport navigation"
```

### Task 3: Add director-board organization tools

**Files:**

- Modify: `lib/production/types.ts`
- Modify: `components/production/StoryboardCanvas.tsx`
- Modify: `tests/contracts-v22/storyboard-canvas.test.mjs`

**Interfaces:**

- `StoryboardCanvasGroup` stores `id`, `title`, `x`, `y`, `width`, `height`, and optional `color`.
- `StoryboardCanvasEdge` stores `id`, `from`, `to`, and optional `label`/`color`.
- Existing shot cards and notes remain the rendered entities; group and edge references are layout-only.

- [ ] **Step 1: Add failing contract assertions**

Assert the source contains `selectedIds`, `Shift`, `框选`, `分组`, `连线`, `移出画布`, and that object deletion calls only state-array filters.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test tests/contracts-v22/storyboard-canvas.test.mjs`  
Expected: FAIL on the new organization assertions.

- [ ] **Step 3: Implement selection and organization**

Add transient `selectedIds: Set<string>` and marquee state. Use IDs `shot:<shotId>` and `note:<noteId>`. Support click, Shift-click, marquee, Delete/Backspace, Escape, and multi-drag. Add compact controls to create a group around selected objects, connect two selected objects, and move selected objects together. Remove edges/groups that reference an explicitly removed canvas object, but never alter `scenes`, `frames`, or the source project.

- [ ] **Step 4: Run focused tests and TypeScript**

Run: `node --test tests/contracts-v22/storyboard-canvas.test.mjs`  
Run: `npx tsc --noEmit`  
Expected: focused tests pass and TypeScript reports 0 errors.

- [ ] **Step 5: Commit organization tools**

```bash
git add lib/production/types.ts components/production/StoryboardCanvas.tsx tests/contracts-v22/storyboard-canvas.test.mjs
git commit -m "feat(canvas): add director board organization"
```

### Task 4: Add deterministic layout, navigation, and export actions

**Files:**

- Modify: `components/production/StoryboardCanvas.tsx`
- Modify: `components/production/ProductionWorkbench.tsx`
- Modify: `tests/contracts-v22/storyboard-canvas.test.mjs`

**Interfaces:**

- `StoryboardCanvas` accepts optional `onOpenShot?: (shotId: string) => void`; existing callers remain valid.
- `layoutShotsByScene` is the only source of deterministic shot ordering.
- Export actions serialize normalized layout and label it as canvas layout/director notes.

- [ ] **Step 1: Add failing contract assertions**

Assert the component contains `按场次排版`, `导出画布`, `导出布局 JSON`, and `onOpenShot`, and the workbench passes a callback without changing the `storyboardCanvas: canvas` payload.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/contracts-v22/storyboard-canvas.test.mjs`  
Expected: FAIL on the new action assertions.

- [ ] **Step 3: Implement actions**

Add deterministic scene layout that only changes shot coordinates and optional groups. Add “打开镜头” on each valid card and wire it to the current workbench shot selection/shot table behavior. Add browser download helpers for PNG snapshot and JSON layout; JSON must contain only normalized canvas state, not provider credentials or unrelated project fields. Keep labels short and avoid additional page-level navigation.

- [ ] **Step 4: Run focused tests and TypeScript**

Run: `node --test tests/contracts-v22/storyboard-canvas.test.mjs`  
Run: `npx tsc --noEmit`  
Expected: focused tests pass and TypeScript reports 0 errors.

- [ ] **Step 5: Commit actions**

```bash
git add components/production/StoryboardCanvas.tsx components/production/ProductionWorkbench.tsx tests/contracts-v22/storyboard-canvas.test.mjs
git commit -m "feat(canvas): add layout navigation and export actions"
```

### Task 5: Add browser acceptance coverage and performance safeguards

**Files:**

- Modify: `e2e/v22-unified-production-workbench.spec.ts`
- Modify: `components/production/StoryboardCanvas.tsx`

- [ ] **Step 1: Write the failing E2E scenarios**

Cover opening the existing storyboard canvas subview, adding a note, changing zoom, panning the world, fitting the view, running scene layout, and verifying the canvas state remains in the existing draft payload. Use the existing local app fixture and route aliases; do not require real AI/provider calls.

- [ ] **Step 2: Run the E2E file and verify the expected failure**

Run: `pnpm exec playwright test e2e/v22-unified-production-workbench.spec.ts --project=chromium`
Expected: FAIL only where the new controls or behavior are not yet implemented.

- [ ] **Step 3: Add final safeguards**

Use a single animation frame for pointer-driven updates, cancel it on unmount, and preserve stable `data-testid` hooks for the canvas, world layer, and primary actions used by browser checks.

- [ ] **Step 4: Run the E2E scenarios and full relevant checks**

Run: `pnpm exec playwright test e2e/v22-unified-production-workbench.spec.ts --project=chromium`
Run: `node --test tests/contracts-v22/storyboard-canvas.test.mjs tests/storyboard-canvas-helpers.test.mjs`  
Run: `npx tsc --noEmit`  
Expected: 0 failures in the new focused tests and 0 TypeScript errors.

- [ ] **Step 5: Commit acceptance and safeguards**

```bash
git add components/production/StoryboardCanvas.tsx e2e/v22-unified-production-workbench.spec.ts
git commit -m "test(canvas): verify infinite director board"
```

### Task 6: Full verification and delivery preparation

**Files:**

- Modify only files already listed above if a test exposes a regression.

- [ ] **Step 1: Run the existing canvas and storyboard contracts**

```bash
node --test tests/contracts-v22/storyboard-canvas.test.mjs tests/storyboard-e2e-scenarios.test.mjs tests/v2-previs-ui.test.mjs
```

- [ ] **Step 2: Run the complete unit suite**

```bash
pnpm test:unit
```

Record any known unrelated baseline failure separately; new canvas tests must not add failures.

- [ ] **Step 3: Run build verification**

```bash
npx tsc --noEmit
pnpm build
```

- [ ] **Step 4: Inspect diff and integration invariants**

```bash
git diff origin/main...HEAD --stat
git diff origin/main...HEAD -- lib/production/types.ts lib/production/storyboard-canvas.ts components/production/StoryboardCanvas.tsx components/production/ProductionWorkbench.tsx
```

Confirm there is no migration, no package lock change, no top-level workbench layout change, and no deletion of project/source data.

- [ ] **Step 5: Commit only after fresh verification**

If verification is green, use `git status --short`, `git log -5 --oneline`, and the exact test/build outputs as the evidence for the final delivery step. Merge to `main`, push GitHub, and deploy Vercel production only after these checks are complete.
