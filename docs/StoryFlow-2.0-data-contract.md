# StoryFlow 2.0 数据接口说明

## 前端状态

未登录：
- 项目只保存到 `localStorage`。
- 可以编辑本地草稿。
- 不能调用 AI 生成。

已登录：
- 本地草稿会按 `id` 与 Supabase 项目合并。
- 同一 `id` 使用 `updatedAt` 较新的版本。
- 保存时先写 localStorage，再异步写 Supabase。

## 主要表

`storyflow_projects`
- `id`: 项目 ID，前端已有 UUID 或 demo ID。
- `user_id`: Supabase Auth 用户 ID。
- `workflow_type`: `creation` 或 `continuation`。
- `project_group`: 首页左侧分组。
- `status`: `draft` / `generating` / `ready` / `error`。
- `data`: 完整 `DramaProject` JSON。

`storyflow_project_steps`
- 预留给 Codex2 拆分 5 阶段和结构化步骤。
- `step_key`: 当前 14 步里的 taskType。
- `phase_key`: 5 阶段 key。
- `content`: 结构化 JSON。
- `content_text`: 可编辑文本。

`storyflow_generation_tasks`
- 每次 AI 调用的任务状态。
- 状态：`queued` / `running` / `streaming` / `completed` / `failed` / `retrying` / `cancelled`。
- 字段包含 provider、model、input_snapshot、output_snapshot、usage、cost、latency。

`storyflow_generations`
- 每次成功生成的历史记录。
- Codex2 可用它做版本历史、回滚、质量对比、DramaScore 趋势。

`storyflow_credits`
- `monthly_limit`: 每月额度。
- `balance`: 当前剩余额度。
- `period_start` / `period_end`: 月度周期。

`storyflow_versions`
- 预留 Story Bible 版本、剧本 Diff、本土化 Diff、DramaScore 快照。

`storyflow_assets` / `storyflow_exports`
- 预留角色图、关系图、分镜图、Word/PDF/MD 导出文件。

## API

`GET /api/account/credits`
- Header: `Authorization: Bearer <supabase_access_token>`
- 返回当前用户额度。

`POST /api/ai/generate`
- Header: `Authorization: Bearer <supabase_access_token>`
- Body 包含：
  - `taskType`
  - `projectId`
  - `input`
  - `context`
  - `options`
  - `allSteps`
- 成功后写入 `storyflow_generation_tasks` 和 `storyflow_generations`。

`POST /api/ai/character-image`
- Header: `Authorization: Bearer <supabase_access_token>`
- 生成角色图，失败时保留本地 SVG 兜底。

`POST /api/ai/relationship-image`
- Header: `Authorization: Bearer <supabase_access_token>`
- 生成人物关系图，失败时保留本地 SVG 兜底。

## Codex2 可以继续开发

1. 在 `storyflow_project_steps` 上实现 5 阶段视图。
2. 在 `storyflow_versions` 上实现 Story Bible 版本、Diff、本土化红线。
3. 在 `storyflow_generations` 上做 DramaScore 历史对比。
4. 在 `storyflow_assets` / `storyflow_exports` 上做正式交付包上传和下载。
5. 使用 `phase_key` 把现有 14 步收纳为 5 阶段，不需要删除原有步骤。

