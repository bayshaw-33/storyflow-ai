# Kiikis 开发交接日志

本文档是 Kiikis.com 两台 Mac mini / 多 Codex 账号协作开发的固定留痕文件。

每次 Codex 完成开发、修复、部署、数据库变更或重要文档整理后，都必须在本文档顶部追加一条记录。

交接规则见：

```txt
docs/CODEX_HANDOFF_SOP.md
```

---

## 2026-07-13 - Codex / 创作工作台统一升级与制作链路打通

### 本次目标

- 将小说工作台升级为小说与剧本共用的“创作工作台”。
- 建立创作工作台到美术工作台、分镜/视频工作台的可用交接通道。

### 已完成

- `/novel-workbench` 升级为桌面 38/62 双栏：左侧 AI 对话与资料上传，右侧 Markdown 文档编辑。
- 移除可见流程侧栏、重复生成工具、完整 AI 生成序列、章节修改工具和小说转剧本入口。
- 右侧阶段统一为项目背景、世界观与大纲、角色 Bible、正文、翻译、本土化/检查、导出。
- 正文阶段支持小说/剧本模式切换，沿用现有 AI 与项目数据逻辑。
- 支持上传 txt、md、csv、html、pdf、doc、docx、xlsx 资料并写入创作上下文。
- 新增 `CreativeHandoffPackage`，传递前三件套、正文、翻译、本土化、Universe 和来源项目 ID。
- 美术工作台和分镜/视频工作台可从 URL + localStorage 自动消费交接包。
- 修复 Markdown 下载文件名非法字符及 Blob URL 过早释放问题。
- 旧剧本工作台保持不变，未新增 Supabase migration，未重写 AI API。

### 修改文件

- `app/novel-workbench/page.tsx`
- `app/globals.css`
- `components/art/ArtWorkbench.tsx`
- `components/production/ProductionWorkbench.tsx`
- `lib/creative-handoff.ts`
- `lib/creative-handoff.test.ts`
- `docs/superpowers/specs/2026-07-10-creation-workbench-design.md`
- `docs/superpowers/plans/2026-07-10-creation-workbench.md`
- `docs/DEV_HANDOFF_LOG.md`

### 验证结果

- 交接包单元测试：2/2 通过。
- TypeScript：`tsc --noEmit` 通过。
- Next.js production build：57/57 页面生成成功。
- 浏览器：桌面双栏为 38%/61%，无重叠；390px 移动端无横向溢出。
- 浏览器：小说/剧本模式切换、美术交接、分镜/视频交接均通过，控制台 0 error。

### 给下一位 Codex

- 第一版交接使用 `kiikis_creative_handoff_v1` localStorage；后续可迁移到 Supabase production package。
- 开发目标工作台时保留 `sourceProjectId` 与 `universeId`，避免切断上下游追踪。

## 2026-07-10 - 美术工作台生产版首批闭环

### 本次目标

- 将现有美术工作台从三栏本地原型升级为 38/62 的 AI 对话 + 美术仓库布局。
- 增加独立资产详情页、母版/变体/版本、Atlas/FLUX 路由、图片持久化基础和 Universe 发布状态。

### 已完成

- 新增完整设计规格与实施计划。
- 新增美术项目、来源、聊天、action、资产、变体、版本、生成任务、发布和审计表 migration。
- 新增角色/场景/道具统一母版、变体、版本和状态转换领域契约。
- 新增 Atlas Cloud 与 Black Forest Labs FLUX Provider、模型目录、特殊账号授权和智能路由。
- 图片生成结果会从供应商临时 URL 转存到 Supabase 私有 `art-assets` bucket 后返回。
- 新增 `/api/art/chat`，支持结构化新增/编辑 action；危险 action 自动转为确认请求。
- 美术主页改为左侧约 38% KK 对话区、右侧约 62% 美术仓库。
- 资料上传、图片上传和自动拆解入口统一收进对话区。
- 点击资产卡进入 `/art-workbench/assets/[assetId]` 独立详情页。
- 详情页支持大图、角色母版/剧中造型、场景/道具状态变体、上传版本、1/2/4 候选、模型选择、终稿锁定和独立 Universe 发布状态。
- 新增 11 个 Node 行为测试，覆盖状态转换、候选数量、账号路由和 AI action 安全规则。

### 修改文件

- `app/art-workbench/page.tsx`
- `app/art-workbench/assets/[assetId]/page.tsx`
- `app/api/art/chat/route.ts`
- `app/api/art/generate-image/route.ts`
- `components/art/ArtWorkbench.tsx`
- `components/art/ArtWorkbench.module.css`
- `components/art/ArtAssetDetail.tsx`
- `components/art/ArtAssetDetail.module.css`
- `lib/art/*`
- `lib/supabase/art-storage.ts`
- `docs/supabase-art-workbench-migration.sql`
- `docs/StoryFlow-2.0-data-contract.md`
- `docs/superpowers/specs/2026-07-10-art-workbench-production-design.md`
- `docs/superpowers/plans/2026-07-10-art-workbench-production.md`
- `tests/art-*.test.mjs`

### 验证结果

- Node 行为测试：11/11 通过。
- `pnpm exec tsc --noEmit`：通过。
- `pnpm run build`：通过，识别 `/art-workbench`、`/art-workbench/assets/[assetId]`、`/api/art/chat` 和 `/api/art/generate-image`。
- 本地浏览器检查：未执行。Codex 工作区额度限制导致本地 dev server 的提权启动被拒绝，不是代码或端口冲突。
- Secret 扫描：代码中没有提交 Atlas 或 BFL 密钥值。

### Git 信息

- branch：main
- commits：`10eddd7`、`eb340b6`、`b2d36d4`、`e36479b`，以及本条 handoff 的后续提交。
- push：本条提交后执行。

### 部署前必做

- 在 Supabase SQL Editor 执行 `docs/supabase-art-workbench-migration.sql`。
- 在 Vercel 服务端环境配置 `BFL_API_KEY`、`ATLASCLOUD_API_KEY`。
- 配置 `ADMIN_EMAIL`，或使用 `ART_ATLAS_AUTHORIZED_EMAILS` / `ART_ATLAS_AUTHORIZED_USER_IDS` 指定 Atlas 特殊授权账号。
- 不要把任何 Key 放入 `NEXT_PUBLIC_*`、前端代码、handoff 或 Git。

### 未完成 / 风险

- 页面仍保留旧 localStorage 状态迁移兼容；结构化表 migration 执行后，下一批需要把主页全部 CRUD 正式切换到云端 art API。
- 当前“发布到 Universe”先在资产状态中分离记录，尚未创建完整 Universe Inbox/publication API 写入。
- 聊天图片当前可作为本次会话母版来源；正式私有上传 API 需要在 migration 后接到 Storage 路径。
- Atlas 和 FLUX 真实调用需要 Vercel 环境变量及供应商账户余额后才能线上验收。

### 给下一位 Codex

- 不要把角色演员身份与项目角色合并；沿用演员库、Universe 角色、项目形象版本三层契约。
- 前端美化只修改 `components/art/*.module.css` 和展示组件，避免改 Provider、action allowlist 和资产状态机。
- 下一批优先执行 migration、接云端 CRUD、Universe publication API 和真实图片生成验收。

## 2026-07-09 - Production Workbench 挂接现有入口

### 本次目标

- 修复新制片工作台已上线但用户从现有入口看不到的问题。
- 将分镜 / 视频入口指向 `/production-workbench`，让用户能直接看到新工作台。

### 已完成

- 工作流首页的“分镜”入口改为 `/production-workbench?mode=planning&setup=1`。
- 工作流首页的“视频”入口改为 `/production-workbench?mode=editor&setup=1`。
- 项目列表中的 storyboard 项目改为打开 `/production-workbench?projectId=...&mode=planning`。
- 项目列表中的 video 项目改为打开 `/production-workbench?projectId=...&mode=editor`。
- Universe 中创建 / 打开的 storyboard、video 项目也改为进入新制片工作台。

### 修改文件

- `components/workflow/workflow-data.ts`
- `components/home/ProjectList.tsx`
- `app/universes/[universeId]/page.tsx`
- `docs/DEV_HANDOFF_LOG.md`

### 验证结果

- `pnpm run build`：通过。

### Git 信息

- branch：main
- commit：待提交
- push：待推送

### 未完成 / 风险

- 旧 `/storyboard-workbench` 与 `/video-workbench` 页面仍保留，直接输入旧 URL 仍会看到旧工作台。
- 下一步如确认新工作台稳定，可以把旧页面改成 redirect 或 wrapper。

### 给下一位 Codex

- 用户从首页工作流卡片、项目列表、Universe 项目进入分镜 / 视频时，应看到 `/production-workbench`。
- 不要删除旧工作台文件，等新工作台 API 与保存逻辑稳定后再迁移。

## 2026-07-09 - Production Workbench Phase 2 基础页面

### 本次目标

- 按 PRD Phase 2 搭建 Seko 风格的一体化制片工作台基础可用版。
- 先以独立 `/production-workbench` 路由承载，不直接替换现有 `/storyboard-workbench` 与 `/video-workbench`。

### 已完成

- 新增 `components/production/ProductionWorkbench.tsx`。
- 新增 `components/production/ProductionWorkbench.module.css`。
- 新增 `/production-workbench` 页面入口。
- 实现左侧 AI 制片对话区。
- 实现左侧上传剧本 / 背景设定 / 角色设定资料，并复用现有 `/api/files/parse`。
- 实现顶部三模式切换：剧本策划 / 分镜画布 / 视频编辑。
- 实现右侧分镜文档模式，分镜可编辑、删除、标记图片状态。
- 实现分镜画布网格，包含分镜卡片、缩略图、状态、上移 / 下移 / 删除。
- 实现视频编辑基础模式，包含当前镜头编辑、中央预览、底部轻量时间线。
- 实现本地保存与 Markdown 导出。

### 修改文件

- `app/production-workbench/page.tsx`
- `components/production/ProductionWorkbench.tsx`
- `components/production/ProductionWorkbench.module.css`
- `docs/DEV_HANDOFF_LOG.md`

### 验证结果

- `pnpm run build`：通过。
- 本地启动 `next dev -H 127.0.0.1 -p 3004`：通过。
- `HEAD /production-workbench`：200。
- 本次未处理未跟踪 `.DS_Store`。

### Git 信息

- branch：main
- commit：待提交
- push：待推送

### 未完成 / 风险

- 当前 `/production-workbench` 是独立入口，尚未替换 storyboard/video 入口。
- 当前对话生成分镜为本地草稿逻辑，尚未接真实 AI 分镜 API。
- 图片生成 / 视频生成按钮目前是状态和 URL 管理基础，尚未接 `/api/production/*`。
- 下一步建议进入 Phase 3 / Phase 4：新增 production API，并把 storyboard/video 入口逐步接入。

### 给下一位 Codex

- 不要先美化视觉；下一步优先接真实 API 与项目保存 / Universe 同步。
- 如果要让同事美化，可从 `components/production/ProductionWorkbench.module.css` 入手，不要改核心状态结构。

## 2026-07-09 - Production Workbench Phase 1 架构底座

### 本次目标

- 按 `docs/PRD-production-workbench-seko-style.md` 开始实现分镜视频一体化制片工作台。
- 先完成 Phase 1 的数据结构、状态转换、Provider 抽象与 Universe 快照底座。

### 已完成

- 新增 `lib/production/types.ts`，定义 `ProductionProjectState`、`ProductionShot`、上传资料、历史记录、Provider、时间线等核心类型。
- 新增 `lib/production/state.ts`，支持从现有 storyboard/video `DramaProject` 转换为统一 production state。
- 新增 `lib/production/providers.ts`，定义 MiniMax / Seedance / Runway / Kling 等 Provider 抽象与默认 MiniMax 设置。
- 新增 `lib/production/prompts.ts`，沉淀分镜对话、图片生成、视频生成 Prompt 构建函数。
- 新增 `lib/production/universe.ts`，支持生成 Production Universe Snapshot 与 Creative Package。
- 已确认现有 `/api/files/parse` 可复用，后续左侧文件上传不需要重复造解析轮子。

### 修改文件

- `lib/production/types.ts`
- `lib/production/state.ts`
- `lib/production/providers.ts`
- `lib/production/prompts.ts`
- `lib/production/universe.ts`
- `docs/DEV_HANDOFF_LOG.md`

### 验证结果

- `pnpm run build`：通过。
- 构建时发现当前工作区存在未跟踪 `app/api/art/`、`lib/art-workbench.ts`、`.DS_Store`，本次未修改也未清理。

### Git 信息

- branch：main
- commit：待提交
- push：待推送

### 未完成 / 风险

- 下一步需要进入 Phase 2：搭建 `components/production/ProductionWorkbench.tsx` 基础可用页面。
- 之后再把 `/storyboard-workbench` 与 `/video-workbench` 逐步接入统一工作台。
- 真实图片 / 视频 API 需要在现有 MiniMax 能力基础上新增 production 级接口。

### 给下一位 Codex

- 不要重写 `lib/production/*` 的核心类型，后续页面、API、Universe 都应复用这套结构。
- 如果要改动未跟踪 art 相关文件，先确认它们是谁的工作。

## 2026-07-09 - 新增 Kiikis 美术工作台 MVP

### 本次目标

- 加急新增独立美术工作台，用于根据剧本、项目背景、角色圣经等资料自动拆解角色、场景和关键道具，并生成角色参考表 / 三视图 / 场景道具概念图。

### 已完成

- 新增 `/art-workbench` 独立页面。
- 新增工作流入口“美术”。
- 新增 `lib/art-workbench.ts`，定义美术工作台状态、资产类型、提示词构建和本地兜底拆解。
- 新增 `/api/art/extract-assets`，使用 MiniMax 文本模型拆解角色、场景、道具；失败时返回本地规则初稿。
- 新增 `/api/art/generate-image`，使用 MiniMax 图片接口生成角色参考表、三视图、场景/道具概念图。
- 支持从本地已有项目载入资料。
- 支持上传并解析 `.txt/.md/.json/.csv/.doc/.docx/.pdf/.html/.xlsx`。
- 支持用户手动增删资产、编辑名称、角色级别、叙事功能、设计说明、正向提示词和负面提示词。
- 美术工作台状态暂存 localStorage，并支持 JSON 导出。

### 修改文件

- `app/art-workbench/page.tsx`
- `app/api/art/extract-assets/route.ts`
- `app/api/art/generate-image/route.ts`
- `lib/art-workbench.ts`
- `components/workflow/workflow-data.ts`
- `app/globals.css`
- `docs/DEV_HANDOFF_LOG.md`

### 验证结果

- `pnpm run build`：通过。
- Next 构建已识别 `/art-workbench`、`/api/art/extract-assets`、`/api/art/generate-image`。

### Git 信息

- branch：main
- commit：待提交
- push：待推送

### 未完成 / 风险

- 当前版本未新增 Supabase 专用美术资产表，项目状态先保存在 localStorage；后续如需团队协作，应补结构化表。
- 图片生成当前只启用 MiniMax，接口已预留 provider，明天更换 API 时优先改 `/api/art/generate-image` 与 provider 层。
- 视觉是基础可用版，后续由同事 Codex 做精修。
- 当前工作区存在未跟踪 `.DS_Store`，本次不处理。

### 给下一位 Codex

- 不要先重构演员库或分镜工作台；美术工作台已作为独立入口实现。
- 下一步优先考虑 Supabase 持久化、Universe 关联、批量生成和 API provider 替换。

## 2026-07-09 - 新增分镜视频一体化制片工作台 PRD

### 本次目标

- 将 Kiikis 分镜与视频工作流升级为 Seko 风格一体化制片工作台的产品与工程方案固化成文档。
- 明确主 Codex 负责架构、功能和基础布局，同事 Codex 后续负责视觉美化。

### 已完成

- 新增 `docs/PRD-production-workbench-seko-style.md`。
- 明确制片工作台服务短剧优先，同时兼容 MV。
- 明确保留 Universe 作为一级能力。
- 明确第一版直接接真实图片生成和真实视频生成。
- 明确视频默认走 MiniMax，并预留 Seedance / Runway / Kling provider。
- 明确左侧对话框支持上传剧本、背景设定、角色设定等资料文件。
- 明确第一版视频编辑器只做时间线预览、镜头顺序和视频片段管理，不做剪映级剪辑。

### 修改文件

- `docs/PRD-production-workbench-seko-style.md`
- `docs/DEV_HANDOFF_LOG.md`

### 验证结果

- 文档创建完成。
- 本次仅新增和更新 Markdown 文档，无代码逻辑修改，无需运行 build。

### Git 信息

- branch：main
- commit：待提交
- push：待推送

### 未完成 / 风险

- 下一步需要开始 Phase 1：抽象 `lib/production/*` 数据结构与状态转换。
- 当前工作区存在未跟踪 `.DS_Store`，本次不处理。

### 给下一位 Codex

- 开工前先阅读 `docs/PRD-production-workbench-seko-style.md`。
- 实现时优先保证数据结构、状态流转、API 与 Universe 接入，不要先陷入视觉细节。

## 2026-07-09 - 新增协作开发 Codex 接入说明

### 本次目标

- 生成一份可直接发给协作开发伙伴 Codex 的完整 Markdown 接入说明，避免项目背景、交接规则和开发规范遗漏。

### 已完成

- 新增 `docs/CODEX_TEAMMATE_ONBOARDING.md`。
- 文档包含项目背景、技术架构、开工必读文件、收工留痕要求、已完成重点方向、Git 规范、开发原则和第一条指令模板。
- 明确要求协作 Codex 每次开工前必须先读 `docs/DEV_HANDOFF_LOG.md` 和 `docs/CODEX_HANDOFF_SOP.md`。

### 修改文件

- `docs/CODEX_TEAMMATE_ONBOARDING.md`
- `docs/DEV_HANDOFF_LOG.md`

### 验证结果

- 文档创建完成。
- 本次仅新增和更新 Markdown 文档，无代码逻辑修改，无需运行 build。

### Git 信息

- branch：main
- commit：待提交
- push：待推送

### 未完成 / 风险

- 协作开发伙伴接入后，需要确认其本地项目路径、GitHub 权限、Supabase/Vercel 权限是否可用。

### 给下一位 Codex

- 开工前先执行 `git pull origin main`。
- 优先阅读 `docs/CODEX_TEAMMATE_ONBOARDING.md`、`docs/DEV_HANDOFF_LOG.md`、`docs/CODEX_HANDOFF_SOP.md`。
- 完成任何任务后继续在本日志顶部追加交接记录。

## 2026-07-09 - Codex 协作留痕机制初始化

### 本次目标

- 建立一个固定交接文件，让不同电脑、不同 Codex 账号开工前能快速同步项目进度。

### 已完成

- 新增 Codex 协作交接 SOP。
- 新增开发交接日志文件。
- 约定每次开工先读 `docs/DEV_HANDOFF_LOG.md`。
- 约定每次收工前更新本文档。

### 修改文件

- `docs/CODEX_HANDOFF_SOP.md`
- `docs/DEV_HANDOFF_LOG.md`

### 验证结果

- 文档创建完成。
- 暂无代码逻辑修改，无需运行 build。

### Git 信息

- branch：main
- commit：待提交
- push：待推送

### 未完成 / 风险

- 后续每次开发都需要严格执行“收工更新日志”。
- 如多人同时修改本文档，可能出现 Git 冲突，需要保留双方记录后再提交。

### 给下一位 Codex

- 开工前先执行 `git pull origin main`。
- 然后阅读本文档顶部最近 3 条记录。
- 如果接到新任务，请在完成后把本次变更追加到本文档顶部。

## 2026-07-10 17:05 - SMB workspace rebuilt from GitHub

- Backed up the previous SMB working folder to `/Volumes/Kiikis2026/storyflow-ai-backup-20260710-170551`.
- Re-cloned the canonical GitHub repository into `/Volumes/Kiikis2026/storyflow-ai`.
- Restored local-only `.env.local` from the backup; it remains uncommitted.
- Restored `docs/KIIKIS_CODEX_WORKSPACE_RULE.md` so future Codex sessions know the required workspace path.
- From this point forward, all Kiikis development work should happen in `/Volumes/Kiikis2026/storyflow-ai`.
