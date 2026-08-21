# Compact Production Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the compact Kiikis production shell with persistent global navigation, one four-stage switcher, a true two-column screenplay studio, and visible Universe create/bind actions.

**Architecture:** Keep `ProductionWorkbench` as the single project shell and `ScreenplayStudio` as the script-stage two-column body. The production header owns project identity, Universe actions, four canonical stage buttons, version/evidence/more actions; no secondary stage rail is rendered. Existing V2.2 Universe inheritance APIs and dialog are reused rather than duplicated.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS Modules, lucide-react, Node test runner.

## Global Constraints

- Preserve the canonical stages exactly: script, art, storyboard, video.
- Preserve existing Project, Work, Asset, Universe, and production data; no migration or destructive operation.
- Keep AI conversation as the default and largest screenplay surface.
- Similarity review remains an outline substep and is inactive until explicitly opened.
- Creation and binding of Universe must be visible beside project identity.
- Use existing color/type tokens; do not introduce a competing visual system.

---

### Task 1: Lock the navigation contract with failing tests

**Files:**
- Modify: `tests/ui-v2/unified-workbench/layout.test.mjs`
- Modify: `tests/ui-v2/screenplay-studio/layout.test.mjs`

**Interfaces:**
- Consumes: source files for the production shell and embedded screenplay studio.
- Produces: regression contracts for compact stages, persistent global navigation, Universe actions, no duplicate stage rail, and inactive similarity styling.

- [ ] **Step 1: Write failing assertions**

Add source-contract assertions that require stage icons, `UniverseBindingDialog`, no `styles.stageRail`, no `data-production-focus`, an embedded studio class, an embedded-only workflow-strip guard, and an explicit similarity active flag.

- [ ] **Step 2: Run tests to verify RED**

Run: `node --test tests/ui-v2/unified-workbench/layout.test.mjs tests/ui-v2/screenplay-studio/layout.test.mjs`

Expected: FAIL because the current shell renders the large tab row and stage rail, hides global navigation, and gives similarity no explicit active state.

### Task 2: Restore the compact project header and Universe entry

**Files:**
- Modify: `components/production/UnifiedProductionHeader.tsx`
- Modify: `components/production/ProductionWorkbench.tsx`
- Modify: `components/production/ProductionWorkbench.module.css`
- Modify: `app/universes/page.tsx`

**Interfaces:**
- Consumes: `UnifiedWorkbenchContextV1`, `bindWorkToUniverse`, `UniverseBindingDialog`, `reloadContext()`.
- Produces: callbacks `onCreateUniverse`, `onBindUniverse`, and `onOpenUniverse`; compact canonical stage buttons.

- [ ] **Step 1: Replace the full-width stage row**

Render four small icon buttons in the header action row using accessible labels and `aria-selected`; preserve version, evidence, and more after a divider.

- [ ] **Step 2: Add resident Universe actions**

Map `context.universe` to visible bound/unbound controls. Route creation to `/universes?create=1`, open the binding dialog for the current Work, call `bindWorkToUniverse`, then `reloadContext()`.

- [ ] **Step 3: Allow the Universe page to honor `?create=1`**

On client mount, open the existing create dialog when that query flag is present. Do not create a new Universe until the user submits the existing form.

- [ ] **Step 4: Remove production focus mode and outer stage rail**

Delete the `data-production-focus` effect and render stage content directly. Reserve a desktop gutter for the fixed global navigation and remove it at the existing mobile breakpoint.

- [ ] **Step 5: Run unified workbench tests to verify GREEN**

Run: `node --test tests/ui-v2/unified-workbench/*.test.mjs tests/ui-v2/workbench-shell/workbench-shell.test.mjs`

Expected: PASS.

### Task 3: Make embedded screenplay studio a true two-column workspace

**Files:**
- Modify: `components/v2/screenplay-studio/ScreenplayStudio.tsx`
- Modify: `components/v2/screenplay-studio/ScreenplayStudio.module.css`
- Modify: `components/v2/screenplay-studio/UnitNavigator.tsx`

**Interfaces:**
- Consumes: `embedded`, `activeTool`, similarity gate and review state.
- Produces: `styles.embedded`, `similarityActive` prop, and embedded-only removal of the duplicate workflow strip.

- [ ] **Step 1: Preserve global navigation in embedded mode**

Only set `data-screenplay-focus` for the standalone screenplay route. Give embedded mode a container-height class instead of `100dvh`.

- [ ] **Step 2: Remove duplicated workflow navigation in production**

Do not render the horizontal workflow strip when `embedded` is true; the left workflow tree remains authoritative.

- [ ] **Step 3: Fix similarity false selection**

Pass `similarityActive={activeTool === "similarity"}` to `UnitNavigator`. Use a muted default style, a separate active style, a reviewed style, and disable the control until its gate is ready.

- [ ] **Step 4: Run screenplay layout tests to verify GREEN**

Run: `node --test tests/ui-v2/screenplay-studio/*.test.mjs`

Expected: PASS.

### Task 4: Full verification and release

**Files:**
- Modify only files required by failures introduced by Tasks 1-3.

**Interfaces:**
- Consumes: completed production and screenplay changes.
- Produces: verified release commit and deployment-ready branch.

- [ ] **Step 1: Run targeted and full unit suites**

Run: `node --test tests/ui-v2/unified-workbench/*.test.mjs tests/ui-v2/screenplay-studio/*.test.mjs tests/ui-v2/workbench-shell/workbench-shell.test.mjs`

Run: `pnpm test:unit`

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run type and production build checks**

Run: `npx tsc --noEmit`

Run: `pnpm build`

Expected: both exit successfully.

- [ ] **Step 3: Verify visually**

Open the production page at desktop and narrow widths. Confirm global navigation, compact stage switch, visible Universe actions, exactly two screenplay columns, inactive similarity substep, and no nested full-viewport overflow.

- [ ] **Step 4: Commit and push**

Commit message: `fix(v2.2): restore compact production navigation`

Push the verified branch, merge to `main` only under the already approved production workflow, and confirm the Vercel production deployment corresponds to the pushed commit.
