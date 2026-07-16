# Production Storyboard Backend Design

> **Status**: Approved
> **Date**: 2026-07-16
> **Sub-project**: 2 of 11 (Storyboard structured backend)
> **Depends on**: Database Migration Engineering (sub-project 1, completed)

## Background

Kiikis.com 的制片工作台（ProductionWorkbench）目前使用 localStorage + `DramaProject.deliveryPackage` JSON 存储状态。PRD（`docs/PRD-production-workbench-seko-style.md`）规划了完整的制片工作台，但缺少结构化后端支持。

本子项目建立分镜结构化的数据库表和 production API，为后续前端接入云端保存奠定基础。

## Goals

1. 创建 `storyflow_production_projects` 和 `storyflow_production_shots` 数据库表
2. 实现 6 个 production API 路由，内部复用现有 AI/文件/视频能力
3. 保持与现有 `storyflow_projects` 的外键关联和 JSON 兼容快照
4. 不改动前端代码

## Scope Boundaries

### In Scope
- 2 个数据库表 + RLS 策略 + 索引
- 6 个 production API 路由
- `lib/production/api.ts` 共享工具模块
- Supabase migration 文件
- `.env.example` 更新（如有新环境变量）

### Out of Scope
- 前端 ProductionWorkbench 组件改动
- 现有 API 重构
- 文件存储实现（走现有 Supabase Storage）
- 旧工作台兼容迁移

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| 范围 | schema + API | 单子项目聚焦后端，前端后续接入 |
| API 策略 | 复用现有能力 | 避免重复实现，保持一致性 |
| 表结构 | 混合模式 | shots 独立表支持 CRUD/排序，其他 JSONB 平衡复杂度 |
| 与 storyflow_projects 关系 | 外键 + JSON 快照 | 遵循 Phase 2 engineering contract 模式 |
| 认证 | 复用 authenticateRequest | 与现有 API 一致 |
| RLS | owner_id = auth.uid() | 与现有表策略一致 |

## Database Schema

### Table 1: storyflow_production_projects

```sql
CREATE TABLE public.storyflow_production_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.storyflow_projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '未命名制片项目',
  workflow_type TEXT NOT NULL DEFAULT 'production'
    CHECK (workflow_type IN ('storyboard', 'video', 'production')),
  content_type TEXT NOT NULL DEFAULT 'short_drama'
    CHECK (content_type IN ('short_drama', 'mv')),
  aspect_ratio TEXT NOT NULL DEFAULT '9:16'
    CHECK (aspect_ratio IN ('9:16', '16:9', '1:1')),
  language TEXT NOT NULL DEFAULT 'zh'
    CHECK (language IN ('zh', 'en', 'bilingual')),
  universe_id UUID,
  mode TEXT NOT NULL DEFAULT 'planning'
    CHECK (mode IN ('planning', 'canvas', 'editor')),
  story_brief JSONB NOT NULL DEFAULT '{}',
  visual_bible JSONB NOT NULL DEFAULT '{}',
  providers JSONB NOT NULL DEFAULT '{}',
  source_files JSONB NOT NULL DEFAULT '[]',
  source_summary TEXT NOT NULL DEFAULT '',
  chat_messages JSONB NOT NULL DEFAULT '[]',
  history JSONB NOT NULL DEFAULT '[]',
  selected_shot_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Table 2: storyflow_production_shots

```sql
CREATE TABLE public.storyflow_production_shots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_project_id UUID NOT NULL
    REFERENCES public.storyflow_production_projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  index INTEGER NOT NULL DEFAULT 1,
  scene_title TEXT NOT NULL DEFAULT '',
  shot_type TEXT NOT NULL DEFAULT '普通画面',
  duration TEXT NOT NULL DEFAULT '5s',
  description TEXT NOT NULL DEFAULT '',
  composition TEXT NOT NULL DEFAULT '',
  camera_movement TEXT NOT NULL DEFAULT '',
  image_prompt TEXT NOT NULL DEFAULT '',
  video_prompt TEXT NOT NULL DEFAULT '',
  dialogue TEXT,
  sound TEXT,
  continuity TEXT,
  character_refs JSONB NOT NULL DEFAULT '[]',
  scene_refs JSONB NOT NULL DEFAULT '[]',
  image_url TEXT,
  video_url TEXT,
  image_task_id TEXT,
  video_task_id TEXT,
  image_provider TEXT,
  video_provider TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'image_generating', 'image_ready',
                      'video_generating', 'video_ready', 'error')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Indexes

```sql
CREATE INDEX idx_production_projects_owner_id
  ON public.storyflow_production_projects(owner_id);
CREATE INDEX idx_production_projects_project_id
  ON public.storyflow_production_projects(project_id);
CREATE INDEX idx_production_shots_project_id_index
  ON public.storyflow_production_shots(production_project_id, index);
CREATE INDEX idx_production_shots_owner_id
  ON public.storyflow_production_shots(owner_id);
```

### RLS Policies

```sql
ALTER TABLE public.storyflow_production_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_production_shots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "production_projects_owner_select"
  ON public.storyflow_production_projects FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "production_projects_owner_insert"
  ON public.storyflow_production_projects FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "production_projects_owner_update"
  ON public.storyflow_production_projects FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "production_projects_owner_delete"
  ON public.storyflow_production_projects FOR DELETE
  USING (owner_id = auth.uid());

CREATE POLICY "production_shots_owner_select"
  ON public.storyflow_production_shots FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "production_shots_owner_insert"
  ON public.storyflow_production_shots FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "production_shots_owner_update"
  ON public.storyflow_production_shots FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "production_shots_owner_delete"
  ON public.storyflow_production_shots FOR DELETE
  USING (owner_id = auth.uid());
```

## API Design

### 1. POST /api/production/save-state

**Purpose**: Save or load ProductionProjectState

**Request (save mode)**:
```json
{
  "projectId": "uuid",
  "mode": "save",
  "state": { /* ProductionProjectState */ }
}
```

**Request (load mode)**:
```json
{
  "projectId": "uuid",
  "mode": "load"
}
```

**Response**:
```json
{
  "success": true,
  "state": { /* ProductionProjectState, null if load mode and not found */ }
}
```

**Internal logic**:
- Save: upsert into `storyflow_production_projects` + sync shots table + update `storyflow_projects.deliveryPackage` JSON snapshot
- Load: read from `storyflow_production_projects` + join shots, reconstruct state
- Fallback: if no structured record, fall back to `deliveryPackage.productionState`

### 2. POST /api/production/storyboard-chat

**Purpose**: AI dialogue to generate/modify storyboard

**Request**:
```json
{
  "projectId": "uuid",
  "message": "帮我把剧本拆成30个镜头",
  "sourceFileIds": ["id1", "id2"],
  "shotId": "optional, for single-shot modification"
}
```

**Response**:
```json
{
  "success": true,
  "reply": "AI回复文本",
  "shots": [ /* ProductionShot[], new or modified */ ],
  "statePatch": { /* optional partial state patch */ }
}
```

**Internal logic**:
- Load current state + source file texts
- Build prompt using `lib/production/prompts.ts`
- Call AI provider via `lib/ai/providers` (DeepSeek or MiniMax)
- Parse response into ProductionShot[]

### 3. POST /api/production/source-file

**Purpose**: Upload and parse source file

**Request**: multipart/form-data with file

**Response**:
```json
{
  "success": true,
  "sourceFile": {
    "id": "source-xxx",
    "name": "script.txt",
    "mimeType": "text/plain",
    "size": 12345,
    "textPreview": "...",
    "extractedText": "full text",
    "uploadedAt": "ISO date"
  }
}
```

**Internal logic**:
- Reuse `/api/files/parse` parsing logic
- Return ProductionSourceFile metadata
- File storage to Supabase Storage (future enhancement)

### 4. POST /api/production/generate-shot-image

**Purpose**: Generate image for a single shot

**Request**:
```json
{
  "projectId": "uuid",
  "shotId": "uuid",
  "provider": "minimax",
  "model": "optional model override"
}
```

**Response**:
```json
{
  "success": true,
  "imageUrl": "https://...",
  "status": "image_ready"
}
```

**Internal logic**:
- Load shot by ID
- Call MiniMax image generation (reuse existing capability)
- Update shot status + image_url in database
- Return result

### 5. POST /api/production/generate-shot-video

**Purpose**: Generate video for a single shot

**Request**:
```json
{
  "projectId": "uuid",
  "shotId": "uuid",
  "provider": "minimax",
  "model": "optional model override"
}
```

**Response**:
```json
{
  "success": true,
  "taskId": "minimax-task-id",
  "status": "video_generating"
}
```

**Internal logic**:
- Load shot by ID (include image_url if available)
- Call MiniMax video generation (reuse `/api/video/minimax` logic)
- Update shot status + video_task_id in database
- Return task ID for polling

### 6. POST /api/production/video-status

**Purpose**: Query video generation task status

**Request**:
```json
{
  "taskId": "minimax-task-id",
  "projectId": "uuid",
  "shotId": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "status": "video_ready",
  "videoUrl": "https://..."
}
```

**Internal logic**:
- Query MiniMax task status (reuse existing query logic)
- If ready: update shot video_url + status in database
- Return current status

## Authentication & Authorization

All 6 API routes:
1. Call `authenticateRequest(request)` to verify Supabase access token
2. Call `requireProjectAccess(projectId, userId)` to verify ownership
3. RLS policies enforce `owner_id = auth.uid()` at database level

## Relationship with Existing Architecture

```
storyflow_projects (existing)
  ├── id (PK)
  ├── deliveryPackage (JSON, legacy compatibility snapshot)
  └── ← storyflow_production_projects.project_id (FK)

storyflow_production_projects (new)
  ├── id (PK)
  ├── project_id (FK → storyflow_projects)
  ├── owner_id (FK → auth.users)
  └── ← storyflow_production_shots.production_project_id (FK)

storyflow_production_shots (new)
  ├── id (PK)
  ├── production_project_id (FK → storyflow_production_projects)
  └── owner_id (FK → auth.users)
```

**Dual-write strategy**:
- `save-state` API writes to new structured tables AND updates `storyflow_projects.deliveryPackage` JSON
- This maintains backward compatibility with existing frontends
- Future frontend migration can stop reading from JSON

## File Structure

```
supabase/migrations/
  20260716120000_production_storyboard_backend.sql  (new)

app/api/production/
  save-state/route.ts          (new)
  storyboard-chat/route.ts     (new)
  source-file/route.ts         (new)
  generate-shot-image/route.ts (new)
  generate-shot-video/route.ts (new)
  video-status/route.ts        (new)

lib/production/
  api.ts                       (new: shared API utilities)
  types.ts                     (existing, minor adjustments if needed)
  state.ts                     (existing, minor adjustments if needed)
  prompts.ts                   (existing)
  providers.ts                 (existing)
```

## Verification Criteria

1. `supabase db push` succeeds without errors
2. New tables appear in Supabase Dashboard
3. RLS policies active on both tables
4. All 6 API routes compile under `pnpm run build`
5. `pnpm exec tsc --noEmit` passes
6. Existing tests still pass
7. Vercel deployment succeeds

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| AI provider rate limits | Reuse existing rate limiting, return clear errors |
| JSONB field size growth | shots are in separate table, JSONB only for chat/history |
| Migration conflicts | Use standard naming convention, test on staging |
| Breaking existing frontends | Dual-write to JSON snapshot, no frontend changes |

## Dependencies on Future Sub-projects

This sub-project provides the backend foundation for:
- Keyframe system frontend (sub-project 3) — will call save-state API
- Video generation enhancement (sub-project 5) — will extend generate-shot-video
- Version and creation records (sub-project 6) — will hook into save-state
- Auto assembly/顺片 (sub-project 8) — will read production_shots
