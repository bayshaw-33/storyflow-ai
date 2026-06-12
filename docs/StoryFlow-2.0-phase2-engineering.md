# StoryFlow AI 2.0 Phase 2 Engineering Contract

## Status

Phase 2 keeps the Phase 1 Supabase project JSON sync intact and adds a structured production data layer. The old `storyflow_projects.data` JSON remains the compatibility snapshot. New APIs write structured records in parallel so Codex2 can build richer UI without breaking existing users.

## Database Schema

Run:

1. `docs/supabase-schema.sql`
2. `docs/supabase-phase2-migration.sql`

Phase 2 adds or expands:

### `storyflow_projects`

New Phase 2 columns:

- `owner_id`
- `mode`
- `target_market`
- `genre`
- `language`
- `episode_count`
- `episode_duration`
- `current_phase`
- `story_bible jsonb`

`user_id` remains for Phase 1 compatibility. `owner_id` is backfilled from `user_id`.

### `storyflow_project_steps`

New/normalized fields:

- `phase_key`
- `step_key`
- `title`
- `content_text`
- `content_json jsonb`
- `status`: `empty | draft | confirmed | stale`
- `version`

### New Structured Tables

- `storyflow_characters`
- `storyflow_episodes`
- `storyflow_scenes`
- `storyflow_localization_diffs`
- `storyflow_drama_scores`
- `storyflow_task_events`

### Expanded Tables

- `storyflow_versions`: now supports `entity_type`, `entity_id`, `version_no`, `source`, `snapshot_text`, `snapshot_json`, `diff_json`, `created_by`.
- `storyflow_generation_tasks`: now supports `target_entity_type`, `target_entity_id`, `retry_of`, `applied_at`.
- `storyflow_generations`: now supports `target_entity_type`, `target_entity_id`, `applied_at`.
- `storyflow_exports`: now supports `file_url`, `payload_json`, `status`.

All new tables enable RLS and use `user_id = auth.uid()` policies.

## API List

All APIs require `Authorization: Bearer <Supabase access token>`.

### Story Bible

- `GET /api/story-bible?projectId=<id>`
- `PATCH /api/story-bible`

Patch body:

```json
{
  "projectId": "project-id",
  "changedEntity": "story_bible",
  "storyBible": {
    "logline": "",
    "sellingPoint": "",
    "targetMarket": "北美",
    "genreType": "逆袭复仇",
    "world": "",
    "mainConflict": "",
    "characterRelationships": "",
    "lockedCanon": "",
    "languageStyle": "",
    "pacingRules": "",
    "confirmedFacts": ""
  }
}
```

Updating Story Bible creates a version and marks downstream steps `stale`.

### Project Steps

- `GET /api/project-steps?projectId=<id>`
- `GET /api/project-steps?projectId=<id>&stepKey=<step>`
- `POST /api/project-steps`
- `PATCH /api/project-steps`

Save body:

```json
{
  "projectId": "project-id",
  "phaseKey": "story_design",
  "stepKey": "series_outline",
  "title": "大纲",
  "contentText": "markdown text",
  "contentJson": {},
  "status": "draft",
  "source": "manual",
  "createVersion": true
}
```

### Structured Content

Characters:

- `GET /api/structure/characters?projectId=<id>`
- `POST /api/structure/characters`
- `PATCH /api/structure/characters`
- `DELETE /api/structure/characters?projectId=<id>&id=<characterId>`

Episodes:

- `GET /api/structure/episodes?projectId=<id>`
- `POST /api/structure/episodes`
- `PATCH /api/structure/episodes`

Scenes:

- `GET /api/structure/scenes?projectId=<id>&episodeId=<episodeId>`
- `POST /api/structure/scenes`
- `PATCH /api/structure/scenes`

### Versions and Diff

- `GET /api/versions?projectId=<id>`
- `GET /api/versions?projectId=<id>&entityType=project_step&entityId=<id>`
- `GET /api/versions?projectId=<id>&versionA=<id>&versionB=<id>`
- `POST /api/versions`
- `PATCH /api/versions`

Patch actions:

```json
{ "action": "restore", "versionId": "version-id" }
```

```json
{ "action": "save_diff", "versionId": "version-id", "diffJson": {} }
```

Diff helpers:

- `compareTextVersions(oldText, newText)`
- `compareJsonVersions(oldJson, newJson)`
- `saveDiffToVersion(versionId, diffJson)`

### AI Tasks

Existing route enhanced:

- `GET /api/ai/tasks?projectId=<id>`
- `PATCH /api/ai/tasks`

Patch actions:

```json
{ "taskId": "task-id", "action": "cancel" }
```

```json
{ "taskId": "task-id", "action": "retry" }
```

```json
{ "taskId": "task-id", "action": "apply" }
```

`apply` saves `output_snapshot` into `storyflow_project_steps`, creates a version, and sets `applied_at`.

### Localization Diff

- `GET /api/localization-diffs?projectId=<id>`
- `POST /api/localization-diffs`

### DramaScore

- `GET /api/drama-scores?projectId=<id>`
- `POST /api/drama-scores`

### Exports

- `POST /api/exports`

Body:

```json
{ "projectId": "project-id", "exportType": "json" }
```

```json
{ "projectId": "project-id", "exportType": "markdown" }
```

The export payload includes:

- project info
- Story Bible
- project steps
- character cards
- episode outlines
- scenes and visual prompts
- localization Diff summary
- DramaScore summary

DOCX/PDF are intentionally reserved for later.

## Key Data Flows

### AI Generation -> Apply -> Version -> Structured Content

1. `/api/ai/generate` creates `storyflow_generation_tasks`.
2. Provider returns `output_snapshot`.
3. Codex2 calls `/api/ai/tasks` with `action=apply`.
4. Backend saves output into `storyflow_project_steps`.
5. Backend creates `storyflow_versions` with text/json diff.
6. UI can refresh versions and steps.

### Story Bible Change -> Downstream Stale

1. Codex2 calls `PATCH /api/story-bible`.
2. Backend creates a Story Bible version.
3. Backend updates `storyflow_projects.story_bible`.
4. Backend marks downstream `storyflow_project_steps.status = stale`.

### Structured Editing

1. Codex2 reads project-level entities through `/api/structure/*`.
2. Characters/episodes/scenes save independently.
3. Character changes mark structure, outline, script, localization, final script and storyboard steps stale.
4. Episode/scene changes mark downstream script/localization/delivery steps stale.

### Export

1. Codex2 calls `POST /api/exports`.
2. Backend gathers project, Story Bible, steps, characters, episodes, scenes, localization diffs, DramaScores.
3. Backend returns JSON or Markdown.
4. Backend records export history in `storyflow_exports`.

## Codex2 Integration Notes

- Use `storyflow_projects.data` only as fallback/legacy cache.
- Prefer `storyflow_project_steps` for workflow step content.
- Prefer `storyflow_characters`, `storyflow_episodes`, `storyflow_scenes` for structured UI.
- Treat `stale` as a soft warning, not a hard blocker.
- For AI task output, call `PATCH /api/ai/tasks` with `action=apply` instead of writing step content directly.

## Self-Test Results

- `npm.cmd run build` passed.
- New API routes compile under Next.js.
- All new APIs call `authenticateRequest`.
- Project ownership is checked by `requireProjectAccess`.

