# kiikis.com 项目简介

> 用于向 AI 分析工具提供项目上下文，包含产品定位、功能架构、技术部署三层信息。

---

## 一、产品定位

**kiikis.com** 是一个 **Universe-First AIGC 创作工作台**，面向短剧/网文/视频创作者，提供从小说到成片的全链路 AI 辅助创作能力。

核心设计理念：**一个 Universe，所有作品继承它**。创作者在 Universe 中定义角色、场景、道具、世界观和 Canon 规则一次，之后每个小说、剧本、分镜、视频、歌曲项目自动继承，IP 资产随项目增长而非碎片化。

目标市场：北美、东南亚、欧洲、中东、拉美、日本、韩国。支持中文、英文、西班牙语、意大利语、法语、日语、韩语七种输出语言。

商业模式：四档订阅（FREE / ELITE $9.9 / PRO / ULTRA $24.9 Beta 价），PRO 以上支持 BYO API Key。

---

## 二、功能架构

### 2.1 七大工作流

| 工作流 | 入口路由 | 说明 |
|--------|---------|------|
| Novel（小说） | `/novel-workbench` | AI 辅助连载小说，8 步流程，基于 Universe 设定 |
| Script（剧本） | `/script-workbench` | 场景大纲到成片级剧本，14 步流程 |
| Storyboard（分镜） | `/storyboard-workbench` | 剧本转视觉序列，Scene → Shot 层级 |
| Art（美术） | `/art-workbench` | 角色/场景/道具卡提取、三视图生成、版本管理 |
| Video（视频） | `/video-workbench` | 分镜转视频，Shot 队列生成，多模型选择 |
| Song（歌曲） | — | 基于故事世界的音乐创作，10 步流程 |
| Viral Creation（爆款复刻） | — | 上传视频分析爆款结构并重制 |

### 2.2 Universe 系统

Universe 是 kiikis 的核心 IP 资产引擎，有三层架构：

- **Personal Universe**：用户私人 IP 库，默认仅本人可见，可主动分享
- **Business Universe**：团队级 IP 库，属于 Business 而非个人，成员退出资产不消失
- **Shared Universe**：访问状态（不是第三种所有权），通过 `UNIVERSE_SHARE` 关系表管理共享，支持 pinned（锁定版本）和 follow_latest（跟随最新）两种引用模式

Universe 资产流程：AI 抽取的实体 → Inbox 待审核 → 用户确认 → Canon 正式入库。资产类型包括角色、场景、道具、时间线事件、世界规则、角色关系。

资产在 Universe 和项目间双向流动：
- **Universe → Project**：引用（锁定版本）、复制（独立副本）、创建变体（保留来源）
- **Project → Universe**：发布为新母版、发布为母版变体、提交为母版新版本、复制为独立资产

### 2.3 三层角色系统

kiikis 的角色管理严格分为三层，互不混淆：

| 层级 | 实体 | 存储位置 | 说明 |
|------|------|---------|------|
| 第一层 | Actor（虚拟演员） | Actor Library | 虚拟艺人的视觉身份档案（面部、体型、气质、可扮演角色范围），不属于任何故事 |
| 第二层 | Character（故事角色） | Universe | 故事人物的身份、设定、关系，有 Identity Anchor（身份锚点） |
| 第三层 | Project Character Version（PCV） | Project | 项目中角色的具体造型版本，通过 Casting Assignment 关联到演员 |

**Casting Assignment**（选角）：Actor 出演 Character 的关系记录，属于 Project。一个选角可对应多个 PCV。PCV 通过 `casting_assignment_id` 可选引用选角记录（nullable，即不是每个 PCV 都必须有选角）。

**Character Portrayal**：演员对某个角色的可复用视觉演绎，独立于故事身份和项目造型。字段包括 `character_id`、`actor_id`、`actor_reference_version_id`、`portrayal_profile`、`universe_id`（可选归属）。

**Identity Passport**：角色身份护照，三层 Prompt 结构：
- Identity Core Prompt：不变量（角色核心身份，跨项目不变）
- Current Appearance Prompt：每项目（项目级外观设定）
- Scene Override Prompt：每场景（场景级临时覆盖）

**一致性检查单**（两层）：
- Core Identity Checklist：`always_locked`，核心身份不可变
- Appearance Checklist：`locked_by_default` / `project_override_allowed`，外观可被项目覆盖
- P0 = Prompt 级检查，P1 = AI 视觉检查

### 2.4 关键帧系统（Keyframe Slot）

分镜的 Shot 不是直接生成视频，而是先经过关键帧阶段：

```
Shot → Keyframe Set → Keyframe Slot → Keyframe Candidate
                                          ↓
                                   selected_candidate_id（选中候选）
```

Keyframe Slot 数据结构：
- `slot_role`：single（单帧）/ start（首帧）/ intermediate（中间帧）/ end（尾帧）
- `timestamp_ratio`：0.0=起始，1.0=结束
- `prompt_version_id`：当前提示词版本
- `selected_candidate_id`：直接指向选中的 Keyframe Candidate

### 2.5 统一生成任务（Generation Job）

图片、视频、导出、顺片使用统一的 Generation Job 表，通过 `job_type` 区分：

| job_type | target_type | 说明 |
|----------|-------------|------|
| image | Keyframe Slot | 图片生成属于某个关键帧槽位 |
| video | Shot | 视频生成属于某个镜头 |
| export | Project / Universe | 导出任务属于项目或 Universe |
| assembly | Episode / Assembly Sequence | 顺片任务属于某集或某段序列 |

任务提交时通过 `GENERATION_JOB_INPUT_ASSET` 冻结输入资产（关键帧候选 ID、资产版本 ID、Prompt Version、Model Deployment、所有生成参数），确保创作留痕和可复现。

14 种任务状态：DRAFT → PENDING_CONFIRM → QUEUED → GENERATING → RESULT_INGESTING → COMPLETED，以及 PARTIAL_FAILURE / FAILED / CANCEL_REQUESTED / CANCELLED / MODERATION_BLOCKED / EXPIRED / NEEDS_USER_ACTION / PROVIDER_TIMEOUT。

特别注意 `RESULT_INGESTING`：第三方显示成功但文件尚未存入 kiikis 存储时，任务不应标记为 COMPLETED。

### 2.6 创作档案导出

支持完整创作档案（ZIP）和增量创作档案，包含 manifest.json + manifest.sha256（独立 sidecar 文件，不写入 manifest.json 自身避免递归哈希）。

manifest.json 核心字段：`archive_schema_version`、`platform_version`、`subject_type`（project/universe）、`subject_id`、`source_universe_ids[]`、`export_id`、`previous_export_id`（增量档案链）、`files[]`（含 SHA-256 哈希）、`deleted_records[]`（tombstones）。

生成结果必须存入 kiikis 控制存储，不能只存第三方 URL。时间统一 UTC。

### 2.7 项目层级

```
Business → Project → Season → Story Stage → Episode → Scene → Shot → Keyframe Set → Keyframe Slot
```

Story Stage 是叙事弧线单元（如每季 12 个阶段，每阶段 5 集），不是生产阶段。生产进度使用 `workflow_status` 字段管理（开发中/美术中/分镜中/生成中/待剪辑等）。

Character、Location、Prop 支持两种归属：`universe_id`（Universe 资产）或 `project_id`（项目资产），DB 约束要求有且只有一个不为空。

---

## 三、技术部署

### 3.1 前端

- **框架**：Next.js App Router
- **部署**：Vercel
- **认证**：Supabase Auth（密码登录 + OAuth）
- **多语言**：EN / CN 切换
- **图表**：Mermaid（ER 图、流程图）
- **路由结构**：SSR 页面 + SPA 内嵌路由混合。首页 `/`、Dashboard `/dashboard`、演员库 `/actors`、Universe `/universes`、设置 `/settings`、订阅 `/subscription` 为 SSR。各工作台（`/novel-workbench`、`/art-workbench`、`/storyboard-workbench`、`/video-workbench`）需要 `projectId` 参数。

### 3.2 后端

- **数据库**：Supabase PostgreSQL
- **表前缀**：`storyflow_`（所有业务表统一前缀）
- **RLS**：已开启 Row Level Security
- **认证令牌**：Supabase Auth access token
- **API 架构**：Next.js API Routes（`/api/*`）

### 3.3 数据库表概览（40+ 张表）

| 模块 | 表 |
|------|-----|
| 用户/团队 | `storyflow_profiles`、`storyflow_teams`、`storyflow_organizations` |
| Universe | `storyflow_universes`、`storyflow_universe_entities`、`storyflow_universe_inbox_items`、`storyflow_universe_project_links`、`storyflow_universe_relationships`、`storyflow_universe_timeline_events`、`storyflow_canon_facts`、`storyflow_canon_state_snapshots`、`storyflow_canon_check_reports` |
| 项目层级 | `storyflow_projects`、`storyflow_project_groups`、`storyflow_seasons`、`storyflow_episodes`、`storyflow_scenes`、`storyflow_shots` |
| 演员库 | `storyflow_actors`、`storyflow_actor_library`、`storyflow_actor_profiles`、`storyflow_virtual_actors`、`storyflow_identity_passports`、`storyflow_actor_reference_packs`、`storyflow_actor_references`、`storyflow_actor_variants` |
| 选角 | `storyflow_casting_assignments`、`storyflow_character_portrayals`、`storyflow_character_appearance_variants`、`storyflow_characters` |
| 美术资产 | `storyflow_art_projects`、`storyflow_art_assets`、`storyflow_art_asset_variants`、`storyflow_assets`、`storyflow_locations`、`storyflow_props` |
| 关键帧/视频 | `storyflow_keyframe_sets`、`storyflow_keyframe_slots`、`storyflow_keyframe_candidates`、`storyflow_video_takes`、`storyflow_selected_takes` |
| 生成/版本/导出 | `storyflow_generation_jobs`、`storyflow_task_events`、`storyflow_versions`、`storyflow_exports`、`storyflow_export_archives`、`storyflow_creative_documents` |
| 工作台 | `storyflow_novels`、`storyflow_scripts`、`storyflow_storyboards`、`storyflow_songs` |

### 3.4 已知 API 路由

| 路由 | 功能 |
|------|------|
| `/api/teams` | 团队管理（POST 创建） |
| `/api/actors` | 演员库（GET 列表） |
| `/api/actors/generate-avatar` | 生成头像 |
| `/api/actors/generate-prompt` | 生成 Base Prompt |
| `/api/actors/generate-reference-sheet` | 合成参考表 |
| `/api/art/chat` | 美术助手对话 |
| `/api/art/extract-assets` | 自动拆解角色/场景/道具 |
| `/api/art/upload-reference` | 上传参考图 |
| `/api/files/parse` | 解析上传文件 |
| `/api/universe/canon-check` | Canon 一致性检查 |
| `/api/universe/extract` | AI 抽取 Universe 实体 |

### 3.5 模型与 Provider

**图片模型**（美术工作台已接入 12+）：
- FLUX.2 Pro / FLUX.2 Max / FLUX Dev
- GPT Image 2
- Seedream v5.0 Lite / Pro
- Nano Banana 2 Lite / Nano Banana 2
- MAI Image 2.5
- Wan 2.7 Pro
- Qwen Image 2.0
- Grok Imagine Quality

**视频模型**：Default video model（具体型号在视频工作台配置）

**LLM Provider**（API Key 管理页）：
- DeepSeek
- MiniMax
- Custom / OpenAI-compatible

**模型管理架构**（规格定义）：
- Provider（服务商）→ Model（模型）→ Model Version（版本）→ Model Deployment（部署实例，含价格/区域/可用状态）→ Capability（能力：文生视频/图生视频/首尾帧/多参考图等）

### 3.6 真实业务数据

浪哥账号（Ultra 套餐）下有：
- 2 个 Universe（陨神之墓、The Alpha's Hidden Luna）
- 4 个项目（含小说、歌曲）
- 项目分组：默认分组

---

## 四、当前状态（2026-07-16 快照）

| 维度 | 状态 |
|------|------|
| 营销站 | 上线，首页/Dashboard/订阅页/设置页正常 |
| 登录系统 | 正常（Supabase Auth） |
| 数据库表 | 40+ 张已建，约 80% 完成，缺 3 张核心表 |
| API 路由 | 11 个已探测，5 个可用，3 个报错，3 个待测 |
| 前端页面 | 7/15 规格页面存在，8 个 404 |
| 核心功能 | 1/13 部分实现，12 项未落地 |
| 演员库 API | 不可用（报错"云端数据服务暂时不可用"） |
| 上传接口 | 502/500 |
| 核心创作链路 | 美术→分镜→关键帧→视频→顺片→导出 尚未打通 |
