# Kiikis Production Art Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `/art-workbench` into a cloud-backed, conversational production art workspace with master/variant/version assets, Atlas/FLUX image routing, and controlled Universe publishing.

**Architecture:** Keep the current Next.js App Router surface, but move production state behind authenticated `/api/art/*` routes backed by Supabase. Separate domain types, persistence, providers, AI actions, and UI components so Atlas/BFL parameter differences and future visual refinement do not leak into asset state.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.8, Supabase REST/Storage, Black Forest Labs FLUX.2 API, Atlas Cloud image API, existing MiniMax text extraction.

## Global Constraints

- Workbench home is a 38% AI conversation / 62% art repository split.
- Asset detail is a separate route with large media on the left and editor on the right.
- Character, scene, and prop assets all use master + variants + immutable versions.
- Final approval and Universe publication are separate operations.
- Default generation count is 1; allowed counts are 1, 2, and 4.
- Standard users use platform FLUX; special users may choose smart routing, Atlas, or FLUX.
- API keys must remain server-only and must never be committed or returned to the browser.
- Provider result URLs must be copied to Supabase Storage before becoming asset versions.
- AI actions never write directly; validated server code applies structured actions.
- Reuse existing team roles, actor identity, Universe Inbox, and appearance-variant contracts.

---

### Task 1: Art Domain Contract and Supabase Migration

**Files:**
- Create: `lib/art/types.ts`
- Create: `lib/art/state.ts`
- Create: `docs/supabase-art-workbench-migration.sql`
- Modify: `lib/art-workbench.ts`

**Interfaces:**
- Produces: `ArtProject`, `ArtAsset`, `ArtAssetVariant`, `ArtAssetVersion`, `ArtGenerationJob`, `ArtChatMessage`, `ArtAction`, `ArtProviderSelection`.
- Produces: `createEmptyArtProject()`, `groupAssetsByKind()`, `canTransitionArtVersion()`.

- [ ] **Step 1: Define a compile-time contract fixture**

Add representative constants in `lib/art/state.ts` that must satisfy the new types:

```ts
const EMPTY_COUNTS: Record<ArtAssetKind, number> = {
  character: 0,
  scene: 0,
  prop: 0,
};
```

- [ ] **Step 2: Run TypeScript and confirm the missing modules fail**

Run: `pnpm exec tsc --noEmit`
Expected: FAIL until `lib/art/types.ts` and exports exist.

- [ ] **Step 3: Implement focused domain types**

Use these core signatures:

```ts
export type ArtAssetKind = "character" | "scene" | "prop";
export type ArtAssetStatus = "draft" | "generating" | "candidate" | "approved" | "published" | "archived" | "error";
export type ArtProviderSelection = "smart" | "atlas" | "flux";

export type ArtAsset = {
  id: string;
  projectId: string;
  kind: ArtAssetKind;
  name: string;
  narrativeRole: string;
  description: string;
  identityAnchor: string;
  masterVariantId?: string | null;
  status: ArtAssetStatus;
  actorId?: string | null;
  universeEntityId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ArtAssetVariant = {
  id: string;
  assetId: string;
  name: string;
  variantType: "master" | "appearance" | "state";
  prompt: string;
  negativePrompt: string;
  approvedVersionId?: string | null;
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 4: Add an idempotent migration**

Create tables for projects, sources, chat messages, actions, assets, variants, versions, generation jobs, publications, and audit events. Add indexes by `project_id`, `asset_id`, `status`, and `updated_at`; enable RLS and mirror existing owner/team role semantics. Add a private Storage bucket named `art-assets` through SQL when supported.

- [ ] **Step 5: Preserve compatibility**

Keep `lib/art-workbench.ts` exports used by the old page, but re-export or adapt the new types so the migration can land without breaking the current route.

- [ ] **Step 6: Verify**

Run: `pnpm exec tsc --noEmit && pnpm run build`
Expected: both commands PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/art lib/art-workbench.ts docs/supabase-art-workbench-migration.sql
git commit -m "Add production art workbench data contract"
```

### Task 2: Authenticated Art Persistence API

**Files:**
- Create: `lib/supabase/art.ts`
- Create: `app/api/art/projects/route.ts`
- Create: `app/api/art/projects/[projectId]/route.ts`
- Create: `app/api/art/assets/route.ts`
- Create: `app/api/art/assets/[assetId]/route.ts`
- Create: `app/api/art/upload/route.ts`

**Interfaces:**
- Consumes: domain types from Task 1.
- Produces: `listArtProjects(userId)`, `getArtProject(userId, projectId)`, `upsertArtProject(userId, input)`, `applyArtAssetPatch(userId, assetId, patch)`, `persistArtUpload(userId, file)`.

- [ ] **Step 1: Write route contracts before implementation**

Each route must return one of:

```ts
type ArtApiSuccess<T> = { success: true; data: T; error: null };
type ArtApiFailure = { success: false; error: string };
```

Invalid unauthenticated calls must return `401`; forbidden team writes return `403`; missing records return `404`.

- [ ] **Step 2: Implement the Supabase repository**

Use `authenticateRequest()` for identity and existing `serviceFetch()` for server-only table access. Do not accept `user_id`, `owner_id`, or `team_id` directly from an untrusted request without access validation.

- [ ] **Step 3: Implement project creation and association**

`POST /api/art/projects` accepts:

```ts
type CreateArtProjectInput = {
  name: string;
  mode: "new" | "existing";
  sourceProjectId?: string;
  universeId?: string;
  teamId?: string;
};
```

For `mode: "new"`, create the art project plus a Universe shell through the existing Universe data path. For `existing`, validate access and store the relationship.

- [ ] **Step 4: Implement private uploads**

`POST /api/art/upload` accepts multipart files, validates supported types and size, writes to `art-assets/{userId}/{projectId}/sources|references/...`, and returns a signed preview URL plus stable storage path. Never make the bucket public.

- [ ] **Step 5: Verify API compilation and unauthenticated behavior**

Run: `pnpm run build`
Expected: all new routes appear in the build output and build passes.

- [ ] **Step 6: Commit**

```bash
git add lib/supabase/art.ts app/api/art/projects app/api/art/assets app/api/art/upload
git commit -m "Add cloud art project and asset APIs"
```

### Task 3: Atlas and FLUX Provider Layer

**Files:**
- Create: `lib/art/providers/types.ts`
- Create: `lib/art/providers/catalog.ts`
- Create: `lib/art/providers/atlas.ts`
- Create: `lib/art/providers/flux.ts`
- Create: `lib/art/providers/router.ts`
- Modify: `app/api/art/generate-image/route.ts`

**Interfaces:**
- Produces: `generateArtImages(input: ArtImageRequest, context: ArtProviderContext): Promise<ArtImageResult[]>`.
- Produces: `listAvailableArtModels(context): ArtModelDescriptor[]`.

- [ ] **Step 1: Define provider-neutral requests**

```ts
export type ArtImageRequest = {
  task: "reference_sheet" | "variant" | "concept" | "edit";
  prompt: string;
  negativePrompt?: string;
  referenceUrls: string[];
  aspectRatio: "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
  count: 1 | 2 | 4;
  seed?: number;
  selection: "smart" | "atlas" | "flux";
  modelId?: string;
};
```

- [ ] **Step 2: Add a curated model catalog**

Include only verified Atlas and BFL models, with capabilities and parameter adapters. Do not scrape the Atlas model web page from a request.

- [ ] **Step 3: Implement BFL FLUX**

Use `BFL_API_KEY` server environment variable and `https://api.bfl.ai/v1`. Submit with `x-key`, poll the returned `polling_url`, and treat provider delivery URLs as temporary.

- [ ] **Step 4: Implement Atlas Cloud**

Use `ATLASCLOUD_API_KEY` or an authorized user's saved Atlas connection. Submit to `/api/v1/model/generateImage`, poll `/api/v1/model/prediction/{id}`, and adapt `aspect_ratio`, `size`, `images`, and `negative_prompt` from catalog metadata.

- [ ] **Step 5: Implement permission routing**

Standard users may request only `flux`. Special users may request `smart`, `atlas`, or `flux`. `smart` selects an Atlas model for identity-sensitive edits and falls back to FLUX only when Atlas fails; manual Atlas never silently changes providers.

- [ ] **Step 6: Persist outputs before returning success**

Download each provider output server-side and upload it to the private `art-assets` bucket. Save provider task ID, model, prompt, seed, storage path, dimensions, and generation status.

- [ ] **Step 7: Verify secret isolation**

Run:

```bash
rg -n "apikey-|bfl_" app lib docs --glob '!docs/superpowers/specs/**'
pnpm run build
```

Expected: no literal secret matches; build passes.

- [ ] **Step 8: Commit**

```bash
git add lib/art/providers app/api/art/generate-image/route.ts
git commit -m "Add Atlas and FLUX art image providers"
```

### Task 4: AI Conversation Actions

**Files:**
- Create: `lib/art/actions.ts`
- Create: `lib/art/chat-prompt.ts`
- Create: `app/api/art/chat/route.ts`
- Modify: `app/api/art/extract-assets/route.ts`

**Interfaces:**
- Produces: `parseArtActions(output): ArtAction[]`.
- Produces: `validateArtAction(action, context): ArtActionValidation`.
- Produces: `applyArtActions(userId, projectId, actions): ArtActionResult[]`.

- [ ] **Step 1: Define the action allowlist**

```ts
export type ArtAction =
  | { type: "create_asset"; kind: ArtAssetKind; name: string; narrativeRole: string; description: string }
  | { type: "create_variant"; assetId: string; name: string; description: string }
  | { type: "update_asset"; assetId: string; patch: Pick<ArtAsset, "name" | "narrativeRole" | "description" | "identityAnchor"> }
  | { type: "attach_upload"; assetId?: string; uploadId: string; purpose: "master" | "candidate" | "reference" }
  | { type: "request_confirmation"; reason: string; pendingAction: Record<string, unknown> };
```

- [ ] **Step 2: Make destructive intent non-executable by default**

Delete, replace approved version, change Universe, publish, and withdraw actions must become `request_confirmation`; the first request must never execute them.

- [ ] **Step 3: Implement structured AI output**

Use the existing authenticated text provider path. Ask for strict JSON containing assistant text and actions. Parse code fences and surrounding prose defensively, but reject unknown action types and unknown fields.

- [ ] **Step 4: Apply safe actions transactionally enough for MVP**

Validate project access and target IDs immediately before every write. Store the user message, assistant message, action payload, result, and inverse patch for undo.

- [ ] **Step 5: Extend extraction without overwriting**

The extraction route returns proposed draft assets and merges by normalized kind/name. Existing approved or published assets must never be replaced by re-extraction.

- [ ] **Step 6: Verify**

Run: `pnpm exec tsc --noEmit && pnpm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/art/actions.ts lib/art/chat-prompt.ts app/api/art/chat app/api/art/extract-assets/route.ts
git commit -m "Add conversational art repository actions"
```

### Task 5: Workbench Home UI

**Files:**
- Create: `components/art/ArtWorkbench.tsx`
- Create: `components/art/ArtChatPanel.tsx`
- Create: `components/art/ArtRepository.tsx`
- Create: `components/art/ArtProjectChooser.tsx`
- Create: `components/art/ArtWorkbench.module.css`
- Modify: `app/art-workbench/page.tsx`

**Interfaces:**
- Consumes: project, asset, chat, upload, and action APIs from Tasks 2 and 4.
- Produces: route navigation to `/art-workbench/assets/[assetId]?projectId=...`.

- [ ] **Step 1: Replace the monolithic local page with a shell**

`app/art-workbench/page.tsx` renders `<ArtWorkbench />`; localStorage is used only to import the old MVP state once and then marks migration complete.

- [ ] **Step 2: Build project selection**

Show new-project and existing-project choices before the workbench. Creating a new project creates its Universe shell; existing selection loads sources and assets.

- [ ] **Step 3: Build the 38/62 layout**

Use CSS grid `grid-template-columns: minmax(340px, 38fr) minmax(520px, 62fr)` on desktop and a stacked/tabbed layout below the existing mobile breakpoint.

- [ ] **Step 4: Build the chat panel**

Support messages, structured change results, undo, file/image upload, Universe mention, send states, and compact source chips. Do not render full source documents in the main layout.

- [ ] **Step 5: Build the repository**

Add character/scene/prop tabs, status filters, search, counts, loading/empty/error states, and cards with image, name, state, variant count, and source.

- [ ] **Step 6: Verify layout and behavior**

Run: `pnpm run build`; then open `/art-workbench` at desktop and mobile widths and confirm no overlap, horizontal clipping, or pale-on-white regressions.

- [ ] **Step 7: Commit**

```bash
git add components/art app/art-workbench/page.tsx
git commit -m "Build conversational art repository workspace"
```

### Task 6: Asset Detail, Versions, and Generation

**Files:**
- Create: `app/art-workbench/assets/[assetId]/page.tsx`
- Create: `components/art/ArtAssetDetail.tsx`
- Create: `components/art/ArtAssetMedia.tsx`
- Create: `components/art/ArtAssetEditor.tsx`
- Create: `components/art/ArtAssetDetail.module.css`
- Create: `app/api/art/assets/[assetId]/approve/route.ts`

**Interfaces:**
- Consumes: asset APIs and `generateArtImages`.
- Produces: approved version records and immutable version navigation.

- [ ] **Step 1: Build the separate detail route**

Left side displays large media, master/variant tabs, and candidate/version thumbnails. Right side edits metadata, prompt, provider, model, aspect ratio, resolution, count, and seed.

- [ ] **Step 2: Add the production reference-sheet template**

For character master generation, use the approved Chinese instruction from the design spec, replace “图1” with the selected reference URL, enforce 4:3, and preserve face/body identity across panels.

- [ ] **Step 3: Add upload and generation flows**

Allow 1/2/4 candidates, show individual job states, save every successful result as a version, and never replace `approvedVersionId` automatically.

- [ ] **Step 4: Implement approval**

`POST /api/art/assets/[assetId]/approve` validates ownership/team role, locks the selected version, updates the variant pointer, and records an audit event.

- [ ] **Step 5: Verify**

Run: `pnpm run build`; manually open one character, one scene, and one prop detail and confirm each supports master/variant/version navigation.

- [ ] **Step 6: Commit**

```bash
git add app/art-workbench/assets components/art app/api/art/assets
git commit -m "Add art asset detail and version approval"
```

### Task 7: Universe Publication and Handoff

**Files:**
- Create: `lib/art/universe.ts`
- Create: `app/api/art/assets/[assetId]/publish/route.ts`
- Modify: `docs/DEV_HANDOFF_LOG.md`
- Modify: `docs/StoryFlow-2.0-data-contract.md`

**Interfaces:**
- Produces: `publishArtAssetVersion(userId, assetId, versionId)` and `ArtPublicationResult`.

- [ ] **Step 1: Build a publication package**

Include asset/variant/version IDs, Universe/project IDs, type, name, identity anchor, prompt pack, stable Storage path, provider metadata, and publication timestamp.

- [ ] **Step 2: Publish without rewriting canon**

Create/update the project asset relationship and submit canon-relevant text through Universe Inbox. Never silently overwrite actor identity or Universe entity canon.

- [ ] **Step 3: Protect referenced versions**

Published versions are immutable. Replacements create a new publication and preserve old IDs for existing storyboard/video references.

- [ ] **Step 4: Update documentation and handoff**

Record migration name, required Vercel environment variable names, routes, verification, commit hashes, remaining Supabase execution step, SMB sync status, and warnings. Do not include secret values.

- [ ] **Step 5: Final verification**

Run:

```bash
pnpm exec tsc --noEmit
pnpm run build
git diff --check
rg -n "apikey-|bfl_" app components lib docs --glob '!docs/superpowers/specs/**'
```

Expected: TypeScript and build pass, no whitespace errors, no literal secrets.

- [ ] **Step 6: Commit and push**

```bash
git add lib/art/universe.ts app/api/art/assets docs/DEV_HANDOFF_LOG.md docs/StoryFlow-2.0-data-contract.md
git commit -m "Publish approved art assets to Universe"
git push origin main
```

- [ ] **Step 7: Sync SMB working copy**

Use a non-destructive sync from the verified Git worktree to `/Volumes/Kiikis2026/storyflow-ai`, excluding `.git`, `.next`, `node_modules`, `.DS_Store`, and `.superpowers`. Confirm the destination contains the final handoff and the same `HEAD` source files without deleting unrelated destination-only files.
