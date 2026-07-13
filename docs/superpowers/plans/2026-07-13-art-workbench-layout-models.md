# Art Workbench Layout and Atlas Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the art workbench desktop layout and expose six task-compatible Atlas Cloud image models with model-specific request bodies.

**Architecture:** Keep the existing workbench and provider boundaries. Add task-aware catalog helpers, make the Atlas adapter build payloads from a model profile, and use a unique global shell marker for navigation spacing.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS Modules, Node test runner, Atlas Cloud REST API, Vercel.

## Global Constraints

- Atlas catalog contains exactly the six models in the approved design.
- Default text-to-image model is `black-forest-labs/flux-dev`.
- Default image-edit model is `bytedance/seedream-v5.0-lite/edit`.
- GPT Image 2 is not implemented in this change.
- No provider safety option is disabled by Kiikis.
- Existing teammate changes and unrelated files are not modified.

---

### Task 1: Regression tests for layout and catalog

**Files:**
- Modify: `tests/art-workbench-production-regressions.test.mjs`
- Modify: `tests/art-provider-routing.test.mjs`

**Interfaces:**
- Consumes: `ART_MODEL_CATALOG`, `resolveArtProviderRoute`
- Produces: failing assertions for unique page marker, six-model catalog, task filtering, and defaults

- [ ] **Step 1: Add failing assertions**

Assert that the component uses `art-workbench-shell`, the old marker is absent, the asset grid uses `auto-fill`, the Atlas catalog IDs equal the approved six IDs, and route defaults differ for `concept` and `edit`.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/art-workbench-production-regressions.test.mjs tests/art-provider-routing.test.mjs
```

Expected: failures for the old page marker, old Qwen/Imagen catalog, and missing task defaults.

### Task 2: Task-aware Atlas catalog and payload profiles

**Files:**
- Modify: `lib/art/providers/types.ts`
- Modify: `lib/art/providers/catalog.ts`
- Modify: `lib/art/providers/router.ts`
- Modify: `lib/art/providers/atlas.ts`
- Test: `tests/art-provider-routing.test.mjs`
- Create: `tests/art-atlas-payload.test.mjs`

**Interfaces:**
- Produces: `listArtModels(provider, task)`, `buildAtlasRequestBody(request, model)`
- Consumes: `ArtImageRequest`, `ArtModelDescriptor`

- [ ] **Step 1: Add payload tests**

Cover FLUX text-to-image, Grok edit, Seedream edit, and Nano Banana Ultra fields. Assert edit profiles require at least one reference URL.

- [ ] **Step 2: Verify payload tests fail**

Run:

```bash
node --test tests/art-atlas-payload.test.mjs
```

Expected: failure because `buildAtlasRequestBody` is not exported.

- [ ] **Step 3: Implement minimal catalog and adapters**

Add a small `atlasProfile` discriminator to descriptors and a switch in `buildAtlasRequestBody`. Convert aspect ratios to Seedream sizes without introducing a generic schema engine.

- [ ] **Step 4: Verify provider tests pass**

Run:

```bash
node --test tests/art-provider-routing.test.mjs tests/art-atlas-payload.test.mjs
```

Expected: all provider tests pass.

### Task 3: Model selector and layout repair

**Files:**
- Modify: `components/art/ArtAssetDetail.tsx`
- Modify: `components/art/ArtWorkbench.tsx`
- Modify: `components/art/ArtWorkbench.module.css`
- Modify: `components/art/ArtWorkbenchCollapse.module.css`
- Modify: `app/globals.css`
- Test: `tests/art-workbench-layout.test.mjs`
- Test: `tests/art-workbench-production-regressions.test.mjs`

**Interfaces:**
- Consumes: `listArtModels`, `resolveArtProviderRoute`
- Produces: task-filtered selector and non-overlapping workbench shell

- [ ] **Step 1: Implement the unique shell marker**

Replace `art-workbench-page` with `art-workbench-shell` only on the new component and add that marker to the desktop navigation-offset rule. Leave the legacy class untouched.

- [ ] **Step 2: Repair collapsed assistant rail**

Keep the expand control at the top of the 48px rail and hide only the content. Do not vertically center it across the full viewport.

- [ ] **Step 3: Make the asset grid dense**

Use an auto-fill grid with bounded tracks so two cards do not stretch to half-screen width.

- [ ] **Step 4: Filter and default the model selector**

Derive the current task from reference-image presence, list only compatible Atlas models, and reset the selected model to the task default when provider or task changes.

- [ ] **Step 5: Verify layout tests pass**

Run:

```bash
node --test tests/art-workbench-layout.test.mjs tests/art-workbench-production-regressions.test.mjs
```

Expected: all layout tests pass.

### Task 4: Full verification, handoff, and deployment

**Files:**
- Modify: `docs/DEV_HANDOFF_LOG.md`

**Interfaces:**
- Consumes: completed implementation
- Produces: committed and production-verified change

- [ ] **Step 1: Run full verification**

```bash
node --test tests/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node scripts/validate-assets.mjs
git diff --check
```

Expected: all tests pass, TypeScript passes, asset validation passes with only the existing `LOGO_PRIMARY` warning.

- [ ] **Step 2: Update handoff**

Add the model IDs, routing defaults, UI fixes, verification result, and residual GPT Image 2 follow-up to `docs/DEV_HANDOFF_LOG.md`.

- [ ] **Step 3: Commit and push**

```bash
git add <only files listed in this plan>
git commit -m "Fix art workbench layout and Atlas models"
git push origin HEAD:main
```

- [ ] **Step 4: Verify Production**

Confirm the Vercel deployment commit SHA matches the pushed commit, state is `READY`, `https://www.kiikis.com/art-workbench?setup=1` returns 200, and deployed static assets contain `art-workbench-shell` plus the approved model IDs.
