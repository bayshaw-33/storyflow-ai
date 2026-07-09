# Kiikis 开发交接日志

本文档是 Kiikis.com 两台 Mac mini / 多 Codex 账号协作开发的固定留痕文件。

每次 Codex 完成开发、修复、部署、数据库变更或重要文档整理后，都必须在本文档顶部追加一条记录。

交接规则见：

```txt
docs/CODEX_HANDOFF_SOP.md
```

---

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
