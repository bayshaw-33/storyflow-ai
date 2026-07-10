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
- `workflow_type`: `creation` / `continuation` / `song` / `viral` / `novel` / `storyboard` / `video`。
- `project_group`: 首页左侧分组。
- `status`: `draft` / `generating` / `ready` / `error`。
- `data`: 完整 `DramaProject` JSON。

当前 `novel` MVP 先写入 `storyflow_projects.data` 兼容快照，字段包括：
- `novelSettings`: 类型、平台、语言、目标字数、连载频率、目标读者和留存钩子。
- `novelBrief`
- `novelBible`
- `novelCharacters`
- `novelVolumeOutline`
- `novelChapterOutline`
- `novelChapterDraft`
- `novelContinuityNotes`
- `novelStyleGuide`
- `novelChapters[]`: `chapterNo`、`title`、`outline`、`draft`、`endingHook`、`pov`、`wordCount`、`continuityNotes`、`status`。

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

## 演员库、团队共享与项目形象版本（规划）

本节用于下一阶段 schema 和 API 落地。当前不要求前端绕过 API 直接写表，也不允许 AI 抽取内容直接写入 Universe canon。

`storyflow_teams`
- `id`: 团队 ID。
- `owner_id`: 团队拥有者 Supabase Auth 用户 ID。
- `name`: 团队名称。
- `created_at` / `updated_at`: 创建和更新时间。

`storyflow_team_members`
- `id`: 成员记录 ID。
- `team_id`: 所属团队。
- `user_id`: Supabase Auth 用户 ID。
- `role`: `owner` / `admin` / `editor` / `viewer`。
- `status`: `active` / `invited` / `removed`。
- `created_at` / `updated_at`: 创建和更新时间。

`storyflow_actor_profiles`
- `id`: 虚拟演员 ID。
- `owner_id`: 创建者 Supabase Auth 用户 ID。
- `team_id`: 可选，团队共享演员所属团队。
- `visibility`: `private` / `team`。
- `name`: 演员名称。
- `bio`: 演员简介。
- `age_range`: 年龄感。
- `gender_expression`: 性别表达。
- `ethnicity_style`: 族裔 / 地域气质。
- `face_description`: 脸型与五官描述。
- `hair_description`: 发型与发质描述。
- `body_description`: 体型与比例描述。
- `temperament`: 气质关键词 JSON。
- `playable_roles`: 可出演类型 JSON。
- `base_prompt`: 演员基础提示词。
- `negative_prompt`: 禁止元素提示词。
- `avatar_asset_id`: 演员基础头像资产。
- `reference_sheet_asset_id`: 演员基础角色参考表资产。
- `status`: `draft` / `ready` / `archived`。
- `created_at` / `updated_at`: 创建和更新时间。

`storyflow_character_appearance_variants`
- `id`: 项目形象版本 ID。
- `project_id`: 所属项目。
- `universe_id`: 可选，关联 Universe。
- `actor_id`: 选用的虚拟演员。
- `universe_entity_id`: 可选，关联 Universe 角色实体。
- `character_name`: 项目内角色名。
- `project_style`: 项目画风。
- `costume_direction`: 服装与妆造方向。
- `prompt_pack`: 三视图、参考表、分镜调用等提示词 JSON。
- `front_asset_id`: 单张定妆图资产。
- `three_view_asset_id`: 三视图资产。
- `reference_sheet_asset_id`: 项目角色参考表资产。
- `status`: `draft` / `approved` / `archived`。
- `created_at` / `updated_at`: 创建和更新时间。

`storyflow_assets` 新增建议类型：
- `actor_avatar`: 演员库基础头像。
- `actor_reference_sheet`: 演员库基础角色参考表。
- `actor_three_view`: 演员库基础三视图。
- `project_character_reference`: 项目内角色参考表。
- `project_character_three_view`: 项目内角色三视图。
- `scene_concept`: 分镜前置美术设计场景图。
- `storyboard_frame`: 分镜帧图。

## 美术工作台生产数据

迁移文件：`docs/supabase-art-workbench-migration.sql`

核心表：

- `storyflow_art_projects`：美术项目，关联 owner、team、Universe 和来源项目。
- `storyflow_art_sources`：剧本、背景、角色圣经和聊天资料来源。
- `storyflow_art_assets`：角色、场景、道具母资产。
- `storyflow_art_asset_variants`：角色剧中造型、场景状态和道具状态。
- `storyflow_art_asset_versions`：上传或 AI 生成的不可变图片版本。
- `storyflow_art_chat_messages`：KK 美术助理对话留痕。
- `storyflow_art_actions`：结构化 AI 写操作、确认状态和撤销数据。
- `storyflow_art_generation_jobs`：Atlas / FLUX 任务、参数和错误状态。
- `storyflow_art_publications`：终稿发布到 Universe 的记录。
- `storyflow_art_audit_events`：版权与团队协作审计记录。

图片 Provider：

- 普通账号只能使用平台 `BFL_API_KEY` 对应的 FLUX 服务。
- 管理员和特殊授权账号可使用 `smart` / `atlas` / `flux`。
- 特殊账号通过 `ADMIN_EMAIL`、`ART_ATLAS_AUTHORIZED_EMAILS` 或 `ART_ATLAS_AUTHORIZED_USER_IDS` 服务端变量授权。
- Atlas 使用 `ATLASCLOUD_API_KEY`；所有变量都只能存在于 Vercel 或本地服务端环境。
- 供应商临时链接必须转存私有 Supabase Storage bucket `art-assets`。

安全规则：

- AI 只返回允许列表内的结构化 action，不能直接写数据库。
- 删除、替换终稿、更换 Universe、发布和撤回必须二次确认。
- 已发布版本不可覆盖；下游引用固定 `asset_version_id`。
- 美术发布不能静默改写演员母版或 Universe canon。

权限规则：
- 演员库第一版只支持虚拟演员，不支持真实演员肖像授权流程。
- `private` 演员仅创建者可见。
- `team` 演员按团队成员角色授权查看或使用。
- `viewer` 可查看团队演员、Universe 和项目资产。
- `editor` 可创建项目、提交 Universe Inbox、创建项目形象版本。
- `admin` / `owner` 可管理团队演员、共享 Universe 和 Inbox 审核。
- 项目形象版本不能自动覆盖演员基础形象，也不能自动覆盖 Universe 角色 canon。
- AI 提取的角色、地点、关系、事件、规则和 canon fact 必须先进入 Inbox。

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
- 小说任务已接入同一 API：`novel_brief`、`novel_bible`、`novel_characters`、`novel_volume_outline`、`novel_chapter_outline`、`novel_chapter_draft`、`novel_revision`、`novel_export`。

`POST /api/ai/character-image`
- Header: `Authorization: Bearer <supabase_access_token>`
- 生成角色图，失败时保留本地 SVG 兜底。

`POST /api/ai/relationship-image`
- Header: `Authorization: Bearer <supabase_access_token>`
- 生成人物关系图，失败时保留本地 SVG 兜底。

`GET /api/actors`
- Header: `Authorization: Bearer <supabase_access_token>`
- 返回当前用户可见的个人演员和团队演员。

`POST /api/actors`
- Header: `Authorization: Bearer <supabase_access_token>`
- 创建虚拟演员资料，支持 `private` 或 `team` 可见性。

`PATCH /api/actors`
- Header: `Authorization: Bearer <supabase_access_token>`
- 更新虚拟演员资料、提示词、可见性和状态。

`DELETE /api/actors?id=<actorId>`
- Header: `Authorization: Bearer <supabase_access_token>`
- 归档或删除虚拟演员，不能破坏已存在项目形象版本引用。

`POST /api/actors/generate-prompt`
- Header: `Authorization: Bearer <supabase_access_token>`
- 根据演员资料生成 `base_prompt` 和 `negative_prompt`。

`POST /api/actors/generate-avatar`
- Header: `Authorization: Bearer <supabase_access_token>`
- 通过 MiniMax 生成虚拟演员头像，写入生成任务和资产记录。

`POST /api/actors/generate-reference-sheet`
- Header: `Authorization: Bearer <supabase_access_token>`
- 基于文字资料或上传头像生成角色参考表，写入生成任务和资产记录。

`GET /api/projects/[projectId]/appearance-variants`
- Header: `Authorization: Bearer <supabase_access_token>`
- 返回项目内演员饰演角色的形象版本。

`POST /api/projects/[projectId]/appearance-variants`
- Header: `Authorization: Bearer <supabase_access_token>`
- 创建项目形象版本，可关联 `actor_id` 和 `universe_entity_id`。

`PATCH /api/projects/[projectId]/appearance-variants`
- Header: `Authorization: Bearer <supabase_access_token>`
- 更新项目画风、妆造、提示词和生成资产引用。

`GET /api/teams`
- Header: `Authorization: Bearer <supabase_access_token>`
- 返回用户所属团队和角色。

`POST /api/teams`
- Header: `Authorization: Bearer <supabase_access_token>`
- 创建团队，创建者成为 `owner`。

`PATCH /api/teams`
- Header: `Authorization: Bearer <supabase_access_token>`
- 更新团队资料，要求 `admin` 或 `owner`。

`POST /api/teams/invite`
- Header: `Authorization: Bearer <supabase_access_token>`
- 邀请成员加入团队，要求 `admin` 或 `owner`。

`PATCH /api/teams/members`
- Header: `Authorization: Bearer <supabase_access_token>`
- 更新团队成员角色或状态，要求 `admin` 或 `owner`。

`PATCH /api/universe/share`
- Header: `Authorization: Bearer <supabase_access_token>`
- 将 Universe 绑定或解绑团队共享范围，要求 Universe owner 或团队 admin / owner。

`GET /api/universe/access?universeId=<id>`
- Header: `Authorization: Bearer <supabase_access_token>`
- 返回当前用户对指定 Universe 的权限：`none` / `read` / `write` / `admin`。

## Codex2 可以继续开发

1. 在 `storyflow_project_steps` 上实现 5 阶段视图。
2. 在 `storyflow_versions` 上实现 Story Bible 版本、Diff、本土化红线。
3. 在 `storyflow_generations` 上做 DramaScore 历史对比。
4. 在 `storyflow_assets` / `storyflow_exports` 上做正式交付包上传和下载。
5. 使用 `phase_key` 把现有 14 步收纳为 5 阶段，不需要删除原有步骤。
6. 按 `PRD-actor-library-team-universe.md` 落地团队、演员库、项目形象版本和分镜预生产流程。
