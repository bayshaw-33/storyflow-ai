# Production Storyboard Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create structured database tables and 6 production API routes for the storyboard/video workbench backend.

**Architecture:** Hybrid table design (projects main table + shots independent table), 6 API routes reusing existing AI/file/video capabilities, dual-write to maintain JSON compatibility snapshot.

**Tech Stack:** Next.js App Router, Supabase (PostgreSQL + RLS), TypeScript, existing `authenticateRequest` + `serviceFetch` pattern.

**Working Directory:** `/Volumes/Kiikis2026/storyflow-ai` (SMB mount — use `python3` scripts for file writes, not Write/Edit tools)

**Spec:** `docs/superpowers/specs/2026-07-16-production-storyboard-backend-design.md`

---

## File Structure

**Create:**
- `supabase/migrations/20260716120000_production_storyboard_backend.sql` — DB schema + RLS
- `lib/production/api.ts` — Shared API utilities (auth, serialization, DB helpers)
- `app/api/production/save-state/route.ts` — Save/load ProductionProjectState
- `app/api/production/storyboard-chat/route.ts` — AI dialogue for storyboard generation
- `app/api/production/source-file/route.ts` — File upload + parse (wraps existing /api/files/parse)
- `app/api/production/generate-shot-image/route.ts` — Shot image generation
- `app/api/production/generate-shot-video/route.ts` — Shot video generation
- `app/api/production/video-status/route.ts` — Video task status polling

**Modify:**
- `docs/DEV_HANDOFF_LOG.md` — Append handoff entry

**Existing files referenced (no changes):**
- `lib/supabase/server.ts` — `authenticateRequest`, `serviceFetch`, `AuthenticatedUser`
- `lib/production/types.ts` — `ProductionProjectState`, `ProductionShot`, etc.
- `lib/production/state.ts` — State conversion utilities
- `lib/production/prompts.ts` — Prompt builders
- `lib/production/providers.ts` — Provider settings
- `lib/ai/providers/` — AI provider implementations
- `app/api/files/parse/route.ts` — File parsing logic
- `app/api/video/minimax/route.ts` — MiniMax video generation logic

---

## Key Patterns (from existing codebase)

### Authentication
```typescript
import { authenticateRequest, serviceFetch } from "@/lib/supabase/server";
// authenticateRequest(request) returns { id, email, token }
// serviceFetch(path, init) uses service role key for Supabase REST API
```

### Supabase REST API pattern
```typescript
// Query
const rows = await serviceFetch<MyRow[]>(`/rest/v1/my_table?user_id=eq.${userId}&select=*`);
// Insert
await serviceFetch("/rest/v1/my_table", { method: "POST", body: JSON.stringify(row) });
// Upsert
await serviceFetch("/rest/v1/my_table?on_conflict=column", {
  method: "POST",
  headers: { Prefer: "resolution=merge-duplicates" },
  body: JSON.stringify(row),
});
// Update
await serviceFetch(`/rest/v1/my_table?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
// Delete
await serviceFetch(`/rest/v1/my_table?id=eq.${id}`, { method: "DELETE" });
```

### API route pattern
```typescript
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await authenticateRequest(request);
    // ... business logic
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
```

---

### Task 1: Create Supabase Migration File

**Files:**
- Create: `supabase/migrations/20260716120000_production_storyboard_backend.sql`

- [ ] **Step 1: Write migration SQL via python3**

```bash
python3 -c "
content = '''-- Production Storyboard Backend: structured tables for production workbench
-- Depends on: 20260716000000_baseline.sql

-- Table 1: Production Projects (main table)
CREATE TABLE IF NOT EXISTS public.storyflow_production_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.storyflow_projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '\''未命名制片项目'\'',
  workflow_type TEXT NOT NULL DEFAULT '\''production'\''
    CHECK (workflow_type IN ('\''storyboard'\'', '\''video'\'', '\''production'\'')),
  content_type TEXT NOT NULL DEFAULT '\''short_drama'\''
    CHECK (content_type IN ('\''short_drama'\'', '\''mv'\'')),
  aspect_ratio TEXT NOT NULL DEFAULT '\''9:16'\''
    CHECK (aspect_ratio IN ('\''9:16'\'', '\''16:9'\'', '\''1:1'\'')),
  language TEXT NOT NULL DEFAULT '\''zh'\''
    CHECK (language IN ('\''zh'\'', '\''en'\'', '\''bilingual'\'')),
  universe_id UUID,
  mode TEXT NOT NULL DEFAULT '\''planning'\''
    CHECK (mode IN ('\''planning'\'', '\''canvas'\'', '\''editor'\'')),
  story_brief JSONB NOT NULL DEFAULT '\''{}'\''::jsonb,
  visual_bible JSONB NOT NULL DEFAULT '\''{}'\''::jsonb,
  providers JSONB NOT NULL DEFAULT '\''{}'\''::jsonb,
  source_files JSONB NOT NULL DEFAULT '\''[]'\''::jsonb,
  source_summary TEXT NOT NULL DEFAULT '\''\'',
  chat_messages JSONB NOT NULL DEFAULT '\''[]'\''::jsonb,
  history JSONB NOT NULL DEFAULT '\''[]'\''::jsonb,
  selected_shot_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table 2: Production Shots (independent table for CRUD/sorting)
CREATE TABLE IF NOT EXISTS public.storyflow_production_shots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_project_id UUID NOT NULL
    REFERENCES public.storyflow_production_projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  index INTEGER NOT NULL DEFAULT 1,
  scene_title TEXT NOT NULL DEFAULT '\''\'',
  shot_type TEXT NOT NULL DEFAULT '\''普通画面'\'',
  duration TEXT NOT NULL DEFAULT '\''5s'\'',
  description TEXT NOT NULL DEFAULT '\''\'',
  composition TEXT NOT NULL DEFAULT '\''\'',
  camera_movement TEXT NOT NULL DEFAULT '\''\'',
  image_prompt TEXT NOT NULL DEFAULT '\''\'',
  video_prompt TEXT NOT NULL DEFAULT '\''\'',
  dialogue TEXT,
  sound TEXT,
  continuity TEXT,
  character_refs JSONB NOT NULL DEFAULT '\''[]'\''::jsonb,
  scene_refs JSONB NOT NULL DEFAULT '\''[]'\''::jsonb,
  image_url TEXT,
  video_url TEXT,
  image_task_id TEXT,
  video_task_id TEXT,
  image_provider TEXT,
  video_provider TEXT,
  status TEXT NOT NULL DEFAULT '\''draft'\''
    CHECK (status IN ('\''draft'\'', '\''image_generating'\'', '\''image_ready'\'',
                      '\''video_generating'\'', '\''video_ready'\'', '\''error'\'')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_production_projects_owner_id
  ON public.storyflow_production_projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_production_projects_project_id
  ON public.storyflow_production_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_production_shots_project_id_index
  ON public.storyflow_production_shots(production_project_id, index);
CREATE INDEX IF NOT EXISTS idx_production_shots_owner_id
  ON public.storyflow_production_shots(owner_id);

-- RLS
ALTER TABLE public.storyflow_production_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_production_shots ENABLE ROW LEVEL SECURITY;

-- RLS Policies: production_projects
CREATE POLICY \"production_projects_owner_select\"
  ON public.storyflow_production_projects FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY \"production_projects_owner_insert\"
  ON public.storyflow_production_projects FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY \"production_projects_owner_update\"
  ON public.storyflow_production_projects FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY \"production_projects_owner_delete\"
  ON public.storyflow_production_projects FOR DELETE
  USING (owner_id = auth.uid());

-- RLS Policies: production_shots
CREATE POLICY \"production_shots_owner_select\"
  ON public.storyflow_production_shots FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY \"production_shots_owner_insert\"
  ON public.storyflow_production_shots FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY \"production_shots_owner_update\"
  ON public.storyflow_production_shots FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY \"production_shots_owner_delete\"
  ON public.storyflow_production_shots FOR DELETE
  USING (owner_id = auth.uid());
'''
with open('/Volumes/Kiikis2026/storyflow-ai/supabase/migrations/20260716120000_production_storyboard_backend.sql', 'w') as f:
    f.write(content)
print('Migration file created')
"
```

- [ ] **Step 2: Verify file created**

Run: `ls -la /Volumes/Kiikis2026/storyflow-ai/supabase/migrations/`
Expected: `20260716120000_production_storyboard_backend.sql` exists

- [ ] **Step 3: Commit migration file**

```bash
cd /Volumes/Kiikis2026/storyflow-ai && git add supabase/migrations/20260716120000_production_storyboard_backend.sql && git commit -m "feat: add production storyboard backend migration"
```

---

### Task 2: Apply Migration to Production Database

**Files:** None (database operation)

- [ ] **Step 1: Run supabase db push**

```bash
cd /Volumes/Kiikis2026/storyflow-ai && SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN supabase db push --linked
```

Expected: Output showing migration applied successfully

- [ ] **Step 2: Verify tables exist in Supabase Dashboard**

Check Supabase Dashboard > Table Editor for `storyflow_production_projects` and `storyflow_production_shots`

---

### Task 3: Create lib/production/api.ts Shared Utilities

**Files:**
- Create: `lib/production/api.ts`

- [ ] **Step 1: Write api.ts via python3**

This module provides:
- `serializeStateToProjectRow()` — Convert ProductionProjectState to DB row
- `parseProjectRowToState()` — Convert DB row + shots to ProductionProjectState
- `serializeShotToRow()` — Convert ProductionShot to DB row
- `parseRowToShot()` — Convert DB row to ProductionShot
- `loadProductionState()` — Load state from DB with fallback to JSON
- `saveProductionState()` — Save state to DB + sync JSON snapshot

```typescript
import { serviceFetch } from "@/lib/supabase/server";
import { createEmptyProductionState } from "./state";
import type {
  ProductionAspectRatio,
  ProductionContentType,
  ProductionLanguage,
  ProductionMode,
  ProductionProjectState,
  ProductionShot,
  ProductionChatMessage,
  ProductionHistoryItem,
  ProductionProviderSettings,
  ProductionSourceFile,
  ProductionStoryBrief,
  ProductionVisualBible,
} from "./types";

type ProductionProjectRow = {
  id: string;
  project_id: string | null;
  owner_id: string;
  title: string;
  workflow_type: string;
  content_type: string;
  aspect_ratio: string;
  language: string;
  universe_id: string | null;
  mode: string;
  story_brief: Record<string, unknown>;
  visual_bible: Record<string, unknown>;
  providers: Record<string, unknown>;
  source_files: unknown[];
  source_summary: string;
  chat_messages: unknown[];
  history: unknown[];
  selected_shot_id: string | null;
  created_at: string;
  updated_at: string;
};

type ProductionShotRow = {
  id: string;
  production_project_id: string;
  owner_id: string;
  index: number;
  scene_title: string;
  shot_type: string;
  duration: string;
  description: string;
  composition: string;
  camera_movement: string;
  image_prompt: string;
  video_prompt: string;
  dialogue: string | null;
  sound: string | null;
  continuity: string | null;
  character_refs: unknown[];
  scene_refs: unknown[];
  image_url: string | null;
  video_url: string | null;
  image_task_id: string | null;
  video_task_id: string | null;
  image_provider: string | null;
  video_provider: string | null;
  status: string;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export async function loadProductionState(
  userId: string,
  projectId: string,
): Promise<ProductionProjectState | null> {
  // Try structured table first
  const rows = await serviceFetch<ProductionProjectRow[]>(
    `/rest/v1/storyflow_production_projects?project_id=eq.${encodeURIComponent(projectId)}&owner_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
  );

  const projectRow = rows[0];
  if (!projectRow) {
    // Fallback: try legacy JSON from storyflow_projects.deliveryPackage
    return loadLegacyState(userId, projectId);
  }

  const shotRows = await serviceFetch<ProductionShotRow[]>(
    `/rest/v1/storyflow_production_shots?production_project_id=eq.${encodeURIComponent(projectRow.id)}&owner_id=eq.${encodeURIComponent(userId)}&select=*&order=index.asc`,
  );

  return parseProjectRowToState(projectRow, shotRows);
}

async function loadLegacyState(userId: string, projectId: string): Promise<ProductionProjectState | null> {
  const rows = await serviceFetch<Array<{ delivery_package: string | null }>>(
    `/rest/v1/storyflow_projects?id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(userId)}&select=delivery_package&limit=1`,
  );

  const deliveryPackage = rows[0]?.delivery_package;
  if (!deliveryPackage) return null;

  try {
    const parsed = JSON.parse(deliveryPackage);
    if (parsed.productionState) {
      return createEmptyProductionState(parsed.productionState);
    }
  } catch {
    // Invalid JSON
  }
  return null;
}

export async function saveProductionState(
  userId: string,
  projectId: string,
  state: ProductionProjectState,
): Promise<string> {
  const projectRow = serializeStateToProjectRow(state, userId, projectId);

  // Upsert production project
  const existing = await serviceFetch<ProductionProjectRow[]>(
    `/rest/v1/storyflow_production_projects?project_id=eq.${encodeURIComponent(projectId)}&owner_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
  );

  let productionProjectId: string;

  if (existing[0]) {
    productionProjectId = existing[0].id;
    await serviceFetch(
      `/rest/v1/storyflow_production_projects?id=eq.${encodeURIComponent(productionProjectId)}`,
      { method: "PATCH", body: JSON.stringify(projectRow) },
    );
  } else {
    const inserted = await serviceFetch<ProductionProjectRow[]>(
      "/rest/v1/storyflow_production_projects",
      { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(projectRow) },
    );
    productionProjectId = inserted[0]?.id || "";
  }

  // Sync shots: delete old, insert new
  await serviceFetch(
    `/rest/v1/storyflow_production_shots?production_project_id=eq.${encodeURIComponent(productionProjectId)}`,
    { method: "DELETE" },
  );

  if (state.shots.length > 0) {
    const shotRows = state.shots.map((shot, index) =>
      serializeShotToRow(shot, productionProjectId, userId, index + 1),
    );
    await serviceFetch("/rest/v1/storyflow_production_shots", {
      method: "POST",
      body: JSON.stringify(shotRows),
    });
  }

  // Sync JSON snapshot to storyflow_projects.deliveryPackage
  await syncJsonSnapshot(userId, projectId, state);

  return productionProjectId;
}

async function syncJsonSnapshot(userId: string, projectId: string, state: ProductionProjectState) {
  const snapshot = JSON.stringify({
    productionState: state,
    exportedAt: new Date().toISOString(),
    version: "production-storyboard-backend-v1",
  });

  await serviceFetch(
    `/rest/v1/storyflow_projects?id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(userId)}`,
    { method: "PATCH", body: JSON.stringify({ delivery_package: snapshot, updated_at: new Date().toISOString() }) },
  );
}

function serializeStateToProjectRow(
  state: ProductionProjectState,
  ownerId: string,
  projectId: string,
): Omit<ProductionProjectRow, "id" | "created_at" | "updated_at"> {
  return {
    project_id: projectId,
    owner_id: ownerId,
    title: state.title,
    workflow_type: state.workflowType,
    content_type: state.contentType,
    aspect_ratio: state.aspectRatio,
    language: state.language,
    universe_id: state.universeId || null,
    mode: state.mode,
    story_brief: state.storyBrief as unknown as Record<string, unknown>,
    visual_bible: state.visualBible as unknown as Record<string, unknown>,
    providers: state.providers as unknown as Record<string, unknown>,
    source_files: state.sourceFiles as unknown[],
    source_summary: state.sourceSummary,
    chat_messages: state.chatMessages as unknown[],
    history: state.history as unknown[],
    selected_shot_id: state.selectedShotId || null,
  };
}

function serializeShotToRow(
  shot: ProductionShot,
  productionProjectId: string,
  ownerId: string,
  index: number,
): Omit<ProductionShotRow, "id" | "created_at" | "updated_at"> {
  return {
    production_project_id: productionProjectId,
    owner_id: ownerId,
    index,
    scene_title: shot.sceneTitle,
    shot_type: shot.shotType,
    duration: shot.duration,
    description: shot.description,
    composition: shot.composition,
    camera_movement: shot.cameraMovement,
    image_prompt: shot.imagePrompt,
    video_prompt: shot.videoPrompt,
    dialogue: shot.dialogue || null,
    sound: shot.sound || null,
    continuity: shot.continuity || null,
    character_refs: shot.characterRefs || [],
    scene_refs: shot.sceneRefs || [],
    image_url: shot.imageUrl || null,
    video_url: shot.videoUrl || null,
    image_task_id: shot.imageTaskId || null,
    video_task_id: shot.videoTaskId || null,
    image_provider: shot.imageProvider || null,
    video_provider: shot.videoProvider || null,
    status: shot.status,
    error: shot.error || null,
  };
}

function parseProjectRowToState(
  row: ProductionProjectRow,
  shotRows: ProductionShotRow[],
): ProductionProjectState {
  return {
    id: row.id,
    projectId: row.project_id || undefined,
    title: row.title,
    workflowType: row.workflow_type as ProductionProjectState["workflowType"],
    contentType: row.content_type as ProductionContentType,
    aspectRatio: row.aspect_ratio as ProductionAspectRatio,
    language: row.language as ProductionLanguage,
    universeId: row.universe_id || null,
    sourceFiles: (row.source_files as ProductionSourceFile[]) || [],
    sourceSummary: row.source_summary,
    storyBrief: (row.story_brief as unknown as ProductionStoryBrief) || {} as ProductionStoryBrief,
    visualBible: (row.visual_bible as unknown as ProductionVisualBible) || {} as ProductionVisualBible,
    shots: shotRows.map(parseRowToShot),
    selectedShotId: row.selected_shot_id || undefined,
    mode: row.mode as ProductionMode,
    providers: (row.providers as unknown as ProductionProviderSettings) || {} as ProductionProviderSettings,
    chatMessages: (row.chat_messages as ProductionChatMessage[]) || [],
    history: (row.history as ProductionHistoryItem[]) || [],
    updatedAt: row.updated_at,
  };
}

function parseRowToShot(row: ProductionShotRow): ProductionShot {
  return {
    id: row.id,
    index: row.index,
    sceneTitle: row.scene_title,
    shotType: row.shot_type as ProductionShot["shotType"],
    duration: row.duration,
    description: row.description,
    composition: row.composition,
    cameraMovement: row.camera_movement,
    imagePrompt: row.image_prompt,
    videoPrompt: row.video_prompt,
    dialogue: row.dialogue || undefined,
    sound: row.sound || undefined,
    continuity: row.continuity || undefined,
    characterRefs: (row.character_refs as string[]) || [],
    sceneRefs: (row.scene_refs as string[]) || [],
    imageUrl: row.image_url || undefined,
    videoUrl: row.video_url || undefined,
    imageTaskId: row.image_task_id || undefined,
    videoTaskId: row.video_task_id || undefined,
    imageProvider: (row.image_provider as ProductionShot["imageProvider"]) || undefined,
    videoProvider: (row.video_provider as ProductionShot["videoProvider"]) || undefined,
    status: row.status as ProductionShot["status"],
    error: row.error || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function updateShotStatus(
  userId: string,
  productionProjectId: string,
  shotId: string,
  patch: Partial<Pick<ProductionShot, "status" | "image_url" | "video_url" | "image_task_id" | "video_task_id" | "error">>,
): Promise<void> {
  const dbPatch: Record<string, unknown> = {
    ...patch,
    updated_at: new Date().toISOString(),
  };
  await serviceFetch(
    `/rest/v1/storyflow_production_shots?id=eq.${encodeURIComponent(shotId)}&production_project_id=eq.${encodeURIComponent(productionProjectId)}&owner_id=eq.${encodeURIComponent(userId)}`,
    { method: "PATCH", body: JSON.stringify(dbPatch) },
  );
}

export async function getShotById(
  userId: string,
  shotId: string,
): Promise<ProductionShot | null> {
  const rows = await serviceFetch<ProductionShotRow[]>(
    `/rest/v1/storyflow_production_shots?id=eq.${encodeURIComponent(shotId)}&owner_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
  );
  return rows[0] ? parseRowToShot(rows[0]) : null;
}
```

Write this to `/Volumes/Kiikis2026/storyflow-ai/lib/production/api.ts` via python3 `shutil.copy2`.

- [ ] **Step 2: Verify file compiles**

Run: `cd /Volumes/Kiikis2026/storyflow-ai && pnpm exec tsc --noEmit 2>&1 | grep "lib/production/api.ts"`
Expected: No errors for api.ts (other existing errors may appear)

- [ ] **Step 3: Commit**

```bash
cd /Volumes/Kiikis2026/storyflow-ai && git add lib/production/api.ts && git commit -m "feat: add production API shared utilities"
```

---

### Task 4: Create save-state API Route

**Files:**
- Create: `app/api/production/save-state/route.ts`

- [ ] **Step 1: Write route.ts via python3**

```typescript
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";
import { createEmptyProductionState } from "@/lib/production/state";
import { loadProductionState, saveProductionState } from "@/lib/production/api";
import type { ProductionProjectState } from "@/lib/production/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SaveStateRequest = {
  projectId?: string;
  mode?: "save" | "load";
  state?: Partial<ProductionProjectState>;
};

export async function POST(request: Request) {
  let body: SaveStateRequest;
  try {
    body = (await request.json()) as SaveStateRequest;
  } catch {
    return NextResponse.json({ success: false, error: "请求格式不正确，请提交 JSON。" }, { status: 400 });
  }

  const projectId = body.projectId?.trim();
  if (!projectId) {
    return NextResponse.json({ success: false, error: "缺少 projectId。" }, { status: 400 });
  }

  let userId: string;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
  } catch {
    return NextResponse.json({ success: false, error: "请先登录后再操作。" }, { status: 401 });
  }

  try {
    if (body.mode === "load") {
      const state = await loadProductionState(userId, projectId);
      return NextResponse.json({ success: true, state });
    }

    // Save mode
    if (!body.state) {
      return NextResponse.json({ success: false, error: "缺少 state 数据。" }, { status: 400 });
    }

    const normalizedState = createEmptyProductionState(body.state);
    normalizedState.projectId = projectId;
    normalizedState.updatedAt = new Date().toISOString();

    const productionProjectId = await saveProductionState(userId, projectId, normalizedState);

    return NextResponse.json({
      success: true,
      productionProjectId,
      state: normalizedState,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SAVE_STATE_ERROR";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
```

Write to `/Volumes/Kiikis2026/storyflow-ai/app/api/production/save-state/route.ts` via python3.

- [ ] **Step 2: Verify compile**

Run: `cd /Volumes/Kiikis2026/storyflow-ai && pnpm exec tsc --noEmit 2>&1 | grep "save-state"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Volumes/Kiikis2026/storyflow-ai && git add app/api/production/save-state/ && git commit -m "feat: add production save-state API"
```

---

### Task 5: Create storyboard-chat API Route

**Files:**
- Create: `app/api/production/storyboard-chat/route.ts`

- [ ] **Step 1: Read existing AI provider interface**

Read `lib/ai/providers/index.ts` and `lib/production/prompts.ts` to understand the generate function signature.

- [ ] **Step 2: Write route.ts via python3**

```typescript
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";
import { loadProductionState } from "@/lib/production/api";
import { buildStoryboardChatPrompt } from "@/lib/production/prompts";
import { generateText } from "@/lib/ai/providers";
import { createProductionShot } from "@/lib/production/state";
import type { ProductionShot } from "@/lib/production/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StoryboardChatRequest = {
  projectId?: string;
  message?: string;
  sourceFileIds?: string[];
  shotId?: string;
};

type ChatShot = Partial<ProductionShot>;

export async function POST(request: Request) {
  let body: StoryboardChatRequest;
  try {
    body = (await request.json()) as StoryboardChatRequest;
  } catch {
    return NextResponse.json({ success: false, error: "请求格式不正确。" }, { status: 400 });
  }

  const projectId = body.projectId?.trim();
  const message = body.message?.trim();
  if (!projectId || !message) {
    return NextResponse.json({ success: false, error: "缺少 projectId 或 message。" }, { status: 400 });
  }

  let userId: string;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
  } catch {
    return NextResponse.json({ success: false, error: "请先登录。" }, { status: 401 });
  }

  try {
    const state = await loadProductionState(userId, projectId);
    const sourceFiles = state?.sourceFiles || [];
    const sourceText = sourceFiles
      .map((f) => f.extractedText || f.textPreview || "")
      .filter(Boolean)
      .join("\n\n---\n\n");

    const prompt = buildStoryboardChatPrompt({
      message,
      sourceText,
      currentState: state,
      shotId: body.shotId,
    });

    const result = await generateText({
      prompt,
      systemPrompt: "You are a professional storyboard director assistant for short drama production.",
    });

    // Parse shots from AI response
    const shots = parseShotsFromReply(result.text);

    return NextResponse.json({
      success: true,
      reply: result.text,
      shots,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "STORYBOARD_CHAT_ERROR";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function parseShotsFromReply(text: string): ProductionShot[] {
  // Try to extract structured shots from AI response
  // Look for JSON array of shots in the response
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      if (Array.isArray(parsed)) {
        return parsed.map((item, index) =>
          createProductionShot({
            ...item,
            index: index + 1,
          }),
        );
      }
    } catch {
      // JSON parse failed, continue to fallback
    }
  }

  // Fallback: try to find a raw JSON array
  const arrayMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed.map((item, index) =>
          createProductionShot({ ...item, index: index + 1 }),
        );
      }
    } catch {
      // Parse failed
    }
  }

  return [];
}
```

Write to `/Volumes/Kiikis2026/storyflow-ai/app/api/production/storyboard-chat/route.ts` via python3.

Note: The exact import for `generateText` may need adjustment based on actual `lib/ai/providers/index.ts` exports. Check and adjust during implementation.

- [ ] **Step 3: Verify compile and adjust imports if needed**

Run: `cd /Volumes/Kiikis2026/storyflow-ai && pnpm exec tsc --noEmit 2>&1 | grep "storyboard-chat"`
Expected: No errors (adjust imports if errors appear)

- [ ] **Step 4: Commit**

```bash
cd /Volumes/Kiikis2026/storyflow-ai && git add app/api/production/storyboard-chat/ && git commit -m "feat: add production storyboard-chat API"
```

---

### Task 6: Create source-file API Route

**Files:**
- Create: `app/api/production/source-file/route.ts`

- [ ] **Step 1: Write route.ts via python3**

This route wraps existing `/api/files/parse` logic internally by calling the same parsing functions.

```typescript
import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { readSheet } from "read-excel-file/node";
import { authenticateRequest } from "@/lib/supabase/server";
import { createProductionId } from "@/lib/production/state";
import type { ProductionSourceFile } from "@/lib/production/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 12 * 1024 * 1024;

export async function POST(request: Request) {
  let userId: string;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
  } catch {
    return NextResponse.json({ success: false, error: "请先登录。" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "请上传文件。" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: "文件过大，请控制在 12MB 以内。" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name.toLowerCase();
    const text = await parseFile(fileName, buffer);

    if (!text.trim()) {
      return NextResponse.json({ success: false, error: "没有解析到可用文本。" }, { status: 422 });
    }

    const sourceFile: ProductionSourceFile = {
      id: createProductionId("source"),
      name: file.name,
      mimeType: file.type || "text/plain",
      size: file.size,
      textPreview: text.slice(0, 500),
      extractedText: text,
      uploadedAt: new Date().toISOString(),
    };

    return NextResponse.json({ success: true, sourceFile });
  } catch {
    return NextResponse.json(
      { success: false, error: "文件解析失败，请换一个 txt、md、pdf、doc、docx、xlsx、csv 或 html 文件重试。" },
      { status: 500 },
    );
  }
}

async function parseFile(fileName: string, buffer: Buffer): Promise<string> {
  if (fileName.endsWith(".txt") || fileName.endsWith(".md") || fileName.endsWith(".csv")) {
    return buffer.toString("utf8");
  }

  if (fileName.endsWith(".html") || fileName.endsWith(".htm")) {
    return buffer
      .toString("utf8")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  if (fileName.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text || "";
  }

  if (fileName.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  }

  if (fileName.endsWith(".doc")) {
    return buffer
      .toString("utf16le")
      .replace(/\u0000/g, "")
      .replace(/[^\S\r\n]+/g, " ")
      .trim();
  }

  if (fileName.endsWith(".xlsx")) {
    const rows = await readSheet(buffer);
    return rows
      .map((row) => row.map((cell) => String(cell ?? "").trim()).filter(Boolean).join(" | "))
      .filter(Boolean)
      .join("\n");
  }

  throw new Error("UNSUPPORTED_FILE_TYPE");
}
```

Write to `/Volumes/Kiikis2026/storyflow-ai/app/api/production/source-file/route.ts` via python3.

- [ ] **Step 2: Verify compile**

Run: `cd /Volumes/Kiikis2026/storyflow-ai && pnpm exec tsc --noEmit 2>&1 | grep "source-file"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Volumes/Kiikis2026/storyflow-ai && git add app/api/production/source-file/ && git commit -m "feat: add production source-file API"
```

---

### Task 7: Create generate-shot-image API Route

**Files:**
- Create: `app/api/production/generate-shot-image/route.ts`

- [ ] **Step 1: Read existing image generation code**

Read `lib/art/providers/index.ts` and `lib/art/providers/minimax.ts` to understand the image generation function signature.

- [ ] **Step 2: Write route.ts via python3**

```typescript
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";
import { getShotById, updateShotStatus } from "@/lib/production/api";
import { loadProductionState } from "@/lib/production/api";
import { generateArtImages } from "@/lib/art/providers";
import { isAtlasAuthorizedUser } from "@/lib/art/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GenerateShotImageRequest = {
  projectId?: string;
  shotId?: string;
  provider?: string;
  model?: string;
};

export async function POST(request: Request) {
  let body: GenerateShotImageRequest;
  try {
    body = (await request.json()) as GenerateShotImageRequest;
  } catch {
    return NextResponse.json({ success: false, error: "请求格式不正确。" }, { status: 400 });
  }

  const projectId = body.projectId?.trim();
  const shotId = body.shotId?.trim();
  if (!projectId || !shotId) {
    return NextResponse.json({ success: false, error: "缺少 projectId 或 shotId。" }, { status: 400 });
  }

  let userId: string;
  let isAtlas: boolean;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
    isAtlas = isAtlasAuthorizedUser(user);
  } catch {
    return NextResponse.json({ success: false, error: "请先登录。" }, { status: 401 });
  }

  try {
    const state = await loadProductionState(userId, projectId);
    if (!state) {
      return NextResponse.json({ success: false, error: "项目状态未找到。" }, { status: 404 });
    }

    const shot = state.shots.find((s) => s.id === shotId);
    if (!shot) {
      return NextResponse.json({ success: false, error: "分镜未找到。" }, { status: 404 });
    }

    // Update status to image_generating
    await updateShotStatus(userId, state.id, shotId, {
      status: "image_generating",
      error: null,
    });

    // Generate image using existing art providers
    const generated = await generateArtImages({
      task: "concept",
      prompt: shot.imagePrompt,
      negativePrompt: state.visualBible.negativePrompt || "",
      referenceUrls: [],
      aspectRatio: state.aspectRatio === "9:16" ? "9:16" : state.aspectRatio === "1:1" ? "1:1" : "16:9",
      count: 1,
      selection: "smart",
    }, { atlasAuthorized: isAtlas });

    const imageUrl = generated[0]?.imageUrl || "";

    // Update shot with image URL
    await updateShotStatus(userId, state.id, shotId, {
      status: "image_ready",
      image_url: imageUrl,
      image_provider: generated[0]?.provider || "minimax",
    });

    return NextResponse.json({
      success: true,
      imageUrl,
      status: "image_ready",
      provider: generated[0]?.provider,
      model: generated[0]?.model,
    });
  } catch (error) {
    // Update shot status to error
    const message = error instanceof Error ? error.message : "IMAGE_GENERATION_ERROR";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
```

Write to `/Volumes/Kiikis2026/storyflow-ai/app/api/production/generate-shot-image/route.ts` via python3.

Note: Adjust imports based on actual `lib/art/providers/index.ts` exports during implementation.

- [ ] **Step 3: Verify compile**

Run: `cd /Volumes/Kiikis2026/storyflow-ai && pnpm exec tsc --noEmit 2>&1 | grep "generate-shot-image"`
Expected: No errors (adjust if needed)

- [ ] **Step 4: Commit**

```bash
cd /Volumes/Kiikis2026/storyflow-ai && git add app/api/production/generate-shot-image/ && git commit -m "feat: add production generate-shot-image API"
```

---

### Task 8: Create generate-shot-video API Route

**Files:**
- Create: `app/api/production/generate-shot-video/route.ts`

- [ ] **Step 1: Write route.ts via python3**

This route reuses MiniMax video generation logic by calling the same internal functions as `/api/video/minimax`.

```typescript
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";
import { loadProductionState, updateShotStatus } from "@/lib/production/api";
import { getMiniMaxApiKey } from "@/lib/ai/providers/minimax";
import { resolveSavedApiConfig } from "@/lib/supabase/api-connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GenerateShotVideoRequest = {
  projectId?: string;
  shotId?: string;
  provider?: string;
  model?: string;
};

type MiniMaxVideoConfig = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
};

export async function POST(request: Request) {
  let body: GenerateShotVideoRequest;
  try {
    body = (await request.json()) as GenerateShotVideoRequest;
  } catch {
    return NextResponse.json({ success: false, error: "请求格式不正确。" }, { status: 400 });
  }

  const projectId = body.projectId?.trim();
  const shotId = body.shotId?.trim();
  if (!projectId || !shotId) {
    return NextResponse.json({ success: false, error: "缺少 projectId 或 shotId。" }, { status: 400 });
  }

  let userId: string;
  let minimaxConfig: MiniMaxVideoConfig;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
    const savedConfig = await resolveSavedApiConfig(user.id, "minimax").catch(() => null);
    minimaxConfig = {
      apiKey: savedConfig?.minimaxApiKey || getMiniMaxApiKey(),
      model: savedConfig?.minimaxModel,
      baseUrl: savedConfig?.minimaxBaseUrl,
    };
  } catch {
    return NextResponse.json({ success: false, error: "请先登录。" }, { status: 401 });
  }

  try {
    const state = await loadProductionState(userId, projectId);
    if (!state) {
      return NextResponse.json({ success: false, error: "项目状态未找到。" }, { status: 404 });
    }

    const shot = state.shots.find((s) => s.id === shotId);
    if (!shot) {
      return NextResponse.json({ success: false, error: "分镜未找到。" }, { status: 404 });
    }

    if (!shot.videoPrompt?.trim()) {
      return NextResponse.json({ success: false, error: "分镜缺少 videoPrompt。" }, { status: 400 });
    }

    // Update status to video_generating
    await updateShotStatus(userId, state.id, shotId, {
      status: "video_generating",
      error: null,
    });

    // Call MiniMax video generation API directly
    const model = body.model?.trim() || minimaxConfig.model || process.env.MINIMAX_VIDEO_MODEL || "MiniMax-Hailuo-02";
    const baseUrl = minimaxConfig.baseUrl
      || process.env.MINIMAX_VIDEO_API_BASE_URL
      || (minimaxConfig.apiKey.startsWith("sk-cp-") ? "https://api.minimaxi.com/v1" : "https://api.minimax.io/v1");
    const generationUrl = process.env.MINIMAX_VIDEO_GENERATION_URL || `${baseUrl.replace(/\/$/, "")}/video_generation`;

    const response = await fetch(generationUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${minimaxConfig.apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt: shot.videoPrompt,
        duration: 5,
        resolution: "768P",
        prompt_optimizer: true,
      }),
      signal: AbortSignal.timeout(90000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`MINIMAX_VIDEO_API_ERROR:${response.status}:${detail.slice(0, 500)}`);
    }

    const data = await response.json();
    const taskId = extractString(data, ["task_id", "taskId", "data.task_id", "data.taskId"]);

    if (!taskId) {
      throw new Error("EMPTY_MINIMAX_VIDEO_TASK_ID");
    }

    // Update shot with task ID
    await updateShotStatus(userId, state.id, shotId, {
      status: "video_generating",
      video_task_id: taskId,
      video_provider: "minimax",
    });

    return NextResponse.json({
      success: true,
      taskId,
      status: "video_generating",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "VIDEO_GENERATION_ERROR";

    // Update shot status to error if we have state
    try {
      const state = await loadProductionState(userId!, projectId!);
      if (state) {
        await updateShotStatus(userId!, state.id, shotId!, {
          status: "error",
          error: message,
        });
      }
    } catch {
      // Ignore update error
    }

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function extractString(source: unknown, paths: string[]): string {
  for (const path of paths) {
    const value = path.split(".").reduce<unknown>((current, key) => {
      if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
      return (current as Record<string, unknown>)[key];
    }, source);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}
```

Write to `/Volumes/Kiikis2026/storyflow-ai/app/api/production/generate-shot-video/route.ts` via python3.

- [ ] **Step 2: Verify compile**

Run: `cd /Volumes/Kiikis2026/storyflow-ai && pnpm exec tsc --noEmit 2>&1 | grep "generate-shot-video"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Volumes/Kiikis2026/storyflow-ai && git add app/api/production/generate-shot-video/ && git commit -m "feat: add production generate-shot-video API"
```

---

### Task 9: Create video-status API Route

**Files:**
- Create: `app/api/production/video-status/route.ts`

- [ ] **Step 1: Write route.ts via python3**

```typescript
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";
import { loadProductionState, updateShotStatus } from "@/lib/production/api";
import { getMiniMaxApiKey } from "@/lib/ai/providers/minimax";
import { resolveSavedApiConfig } from "@/lib/supabase/api-connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VideoStatusRequest = {
  taskId?: string;
  projectId?: string;
  shotId?: string;
};

export async function POST(request: Request) {
  let body: VideoStatusRequest;
  try {
    body = (await request.json()) as VideoStatusRequest;
  } catch {
    return NextResponse.json({ success: false, error: "请求格式不正确。" }, { status: 400 });
  }

  const taskId = body.taskId?.trim();
  const projectId = body.projectId?.trim();
  const shotId = body.shotId?.trim();

  if (!taskId) {
    return NextResponse.json({ success: false, error: "缺少 taskId。" }, { status: 400 });
  }

  let userId: string;
  let apiKey: string;
  let baseUrl: string;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
    const savedConfig = await resolveSavedApiConfig(user.id, "minimax").catch(() => null);
    apiKey = savedConfig?.minimaxApiKey || getMiniMaxApiKey();
    baseUrl = savedConfig?.minimaxBaseUrl
      || process.env.MINIMAX_VIDEO_API_BASE_URL
      || (apiKey.startsWith("sk-cp-") ? "https://api.minimaxi.com/v1" : "https://api.minimax.io/v1");
  } catch {
    return NextResponse.json({ success: false, error: "请先登录。" }, { status: 401 });
  }

  try {
    const queryUrl = new URL(process.env.MINIMAX_VIDEO_QUERY_URL || `${baseUrl.replace(/\/$/, "")}/query/video_generation`);
    queryUrl.searchParams.set("task_id", taskId);

    const response = await fetch(queryUrl.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`MINIMAX_VIDEO_QUERY_ERROR:${response.status}:${detail.slice(0, 500)}`);
    }

    const data = await response.json();
    const rawStatus = extractString(data, ["status", "task_status", "data.status", "data.task_status"]);
    const status = normalizeStatus(rawStatus);
    const fileId = extractString(data, ["file_id", "fileId", "data.file_id", "data.fileId"]);

    let videoUrl = "";

    if (status === "done" && fileId) {
      // Retrieve video URL
      const retrieveUrl = new URL(process.env.MINIMAX_FILE_RETRIEVE_URL || `${baseUrl.replace(/\/$/, "")}/files/retrieve`);
      retrieveUrl.searchParams.set("file_id", fileId);

      const retrieveResponse = await fetch(retrieveUrl.toString(), {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(30000),
      });

      if (retrieveResponse.ok) {
        const retrieveData = await retrieveResponse.json();
        videoUrl = extractString(retrieveData, [
          "download_url",
          "downloadUrl",
          "file.download_url",
          "file.downloadUrl",
          "data.download_url",
          "data.downloadUrl",
        ]);
      }
    }

    // Update shot in database if projectId and shotId provided
    if (projectId && shotId && (status === "done" || status === "error")) {
      try {
        const state = await loadProductionState(userId, projectId);
        if (state) {
          if (status === "done" && videoUrl) {
            await updateShotStatus(userId, state.id, shotId, {
              status: "video_ready",
              video_url: videoUrl,
            });
          } else if (status === "error") {
            await updateShotStatus(userId, state.id, shotId, {
              status: "error",
              error: "Video generation failed",
            });
          }
        }
      } catch {
        // Ignore DB update error
      }
    }

    return NextResponse.json({
      success: true,
      taskId,
      status: status === "done" ? "video_ready" : status === "error" ? "error" : "video_generating",
      videoUrl: videoUrl || undefined,
      fileId: fileId || undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "VIDEO_STATUS_ERROR";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function normalizeStatus(status: string): "draft" | "queued" | "running" | "done" | "error" {
  const value = status.toLowerCase();
  if (["success", "succeeded", "done", "completed"].includes(value)) return "done";
  if (["fail", "failed", "error"].includes(value)) return "error";
  if (["queueing", "queued", "pending", "preparing"].includes(value)) return "queued";
  return "running";
}

function extractString(source: unknown, paths: string[]): string {
  for (const path of paths) {
    const value = path.split(".").reduce<unknown>((current, key) => {
      if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
      return (current as Record<string, unknown>)[key];
    }, source);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}
```

Write to `/Volumes/Kiikis2026/storyflow-ai/app/api/production/video-status/route.ts` via python3.

- [ ] **Step 2: Verify compile**

Run: `cd /Volumes/Kiikis2026/storyflow-ai && pnpm exec tsc --noEmit 2>&1 | grep "video-status"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Volumes/Kiikis2026/storyflow-ai && git add app/api/production/video-status/ && git commit -m "feat: add production video-status API"
```

---

### Task 10: Full Type Check and Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run type check**

Run: `cd /Volumes/Kiikis2026/storyflow-ai && pnpm exec tsc --noEmit 2>&1 | tail -20`
Expected: No new errors related to production API files

- [ ] **Step 2: Run build (may fail on SMB, that's OK)**

Run: `cd /Volumes/Kiikis2026/storyflow-ai && pnpm run build 2>&1 | tail -30`
Expected: Build succeeds or fails only due to SMB SWC binary issues (known limitation)

- [ ] **Step 3: Verify API routes are recognized**

Run: `cd /Volumes/Kiikis2026/storyflow-ai && pnpm run build 2>&1 | grep "/api/production/"`
Expected: All 6 routes appear in build output

---

### Task 11: Update DEV_HANDOFF_LOG and Final Commit + Push

**Files:**
- Modify: `docs/DEV_HANDOFF_LOG.md`

- [ ] **Step 1: Update DEV_HANDOFF_LOG via python3**

Insert new entry at the top (after the first `---` separator):

```markdown
## 2026-07-16 - TRAE: 分镜结构化后端 — Production Storyboard Backend

**变更类型**: 后端 API + 数据库

**变更内容**:
- 创建 `storyflow_production_projects` 和 `storyflow_production_shots` 数据库表 + RLS + 索引
- 创建 6 个 production API 路由：
  - `/api/production/save-state` — 保存/加载 ProductionProjectState
  - `/api/production/storyboard-chat` — AI 对话生成分镜
  - `/api/production/source-file` — 文件上传解析
  - `/api/production/generate-shot-image` — 单镜头图片生成
  - `/api/production/generate-shot-video` — 单镜头视频生成
  - `/api/production/video-status` — 视频任务状态查询
- 创建 `lib/production/api.ts` 共享工具模块
- API 内部复用现有能力（authenticateRequest, art providers, MiniMax video）
- 双写策略：结构化表 + JSON 兼容快照

**新增文件**:
- `supabase/migrations/20260716120000_production_storyboard_backend.sql`
- `lib/production/api.ts`
- `app/api/production/save-state/route.ts`
- `app/api/production/storyboard-chat/route.ts`
- `app/api/production/source-file/route.ts`
- `app/api/production/generate-shot-image/route.ts`
- `app/api/production/generate-shot-video/route.ts`
- `app/api/production/video-status/route.ts`

**后续影响**:
- 前端 ProductionWorkbench 可接入云端保存（后续子项目）
- 所有分镜数据支持结构化 CRUD
- JSON 兼容快照保持向后兼容
```

- [ ] **Step 2: Stage and commit all remaining files**

```bash
cd /Volumes/Kiikis2026/storyflow-ai && git add docs/DEV_HANDOFF_LOG.md && git commit -m "docs: update handoff log for production storyboard backend"
```

- [ ] **Step 3: Push to origin/main**

```bash
cd /Volumes/Kiikis2026/storyflow-ai && git push origin main
```

- [ ] **Step 4: Verify Vercel deployment**

Check Vercel deployment status for the latest commit. Verify all API routes compile in the build output.

---

## Self-Review Checklist

- [ ] All 6 API routes follow the existing pattern (authenticateRequest → business logic → NextResponse)
- [ ] Database migration includes RLS policies for both tables
- [ ] save-state API implements dual-write (structured table + JSON snapshot)
- [ ] storyboard-chat API reuses existing AI providers
- [ ] source-file API reuses existing file parsing logic
- [ ] generate-shot-image API reuses existing art providers
- [ ] generate-shot-video API reuses MiniMax video generation
- [ ] video-status API queries MiniMax and updates shot status
- [ ] All files use `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"`
- [ ] No secrets committed to code
- [ ] DEV_HANDOFF_LOG updated
