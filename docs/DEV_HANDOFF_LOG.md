# Kiikis 开发交接日志

本文档是 Kiikis.com 两台 Mac mini / 多 Codex 账号协作开发的固定留痕文件。

每次 Codex 完成开发、修复、部署、数据库变更或重要文档整理后，都必须在本文档顶部追加一条记录。

交接规则见：

```txt
docs/CODEX_HANDOFF_SOP.md
```

---

## 2026-07-13 - Codex / 美术工作台布局与 Atlas 六模型修复

### 本次目标

- 修复美术工作台全局导航遮挡、助理折叠按钮冲突和少量资产卡过度拉伸。
- 将 Atlas Cloud 模型菜单替换为已确认的六模型组合，并按文生图/图生图能力过滤。

### 已完成

- 新工作台使用独立 `art-workbench-shell` 标记，保留旧版 `.art-workbench-page`，避免旧 CSS 覆盖导航偏移。
- KK 助理折叠后的展开按钮固定在 48px 侧栏顶部，不再与全局导航项目重叠。
- 美术资产网格改为 240-320px 有界自动填充，少量资产不会拉伸成半屏大卡。
- Atlas 菜单固定为：FLUX Dev、GPT Image 2 Text-to-Image、Seedream v5.0 Lite、Grok Imagine Edit、GPT Image 2 Edit、Nano Banana Pro Edit Ultra。
- 无参考图时 Atlas 默认 `black-forest-labs/flux-dev`；有参考图时默认 `openai/gpt-image-2/edit`。
- 模型下拉只显示当前任务可用能力；服务端拒绝手动选择的能力不匹配模型。
- Atlas 适配器按六个模型的官方 schema 分别构造请求，并支持非批量模型按候选数量发起多次任务。
- Atlas 轮询同时接受 `completed` 和 `succeeded`，并兼容 `outputs` / `output` 返回字段。

### 验证结果

- Node 测试：27/27 通过。
- TypeScript：`tsc --noEmit --incremental false` 通过。
- 资源校验：通过；仅有仓库既存的 `LOGO_PRIMARY` orphan 警告。
- `git diff --check`：通过。
- 本机 Next build 仍被 SMB 依赖中的 macOS SWC 二进制签名策略阻塞；必须以 Vercel Linux Production 构建作为最终部署验证。

### 未完成 / 风险

- 本次没有消耗 Atlas 额度逐个发起真实图片任务；请求模型 ID 与字段已按 Atlas 官方模型页面核对并由单元测试锁定。
- GPT Image 2 使用 Atlas 的 `moderation: low`，没有关闭或绕过供应商审核。

### 给下一位 Codex

- 修改 Atlas 模型时同步更新 `lib/art/providers/catalog.ts`、`atlasProfile` payload 和 `tests/art-atlas-payload.test.mjs`。
- 不要恢复 Qwen Image / Imagen 4，也不要把纯文生图模型显示在有参考图的编辑任务中。
- 开工前确认本条记录所在提交已在 Vercel Production 为 `READY`。

---

## 2026-07-13 - Codex / 创作工作台 V2 七阶段升级

### 本次目标

- 将 `/novel-workbench` 内部升级为小说/剧本共用的“创作工作台”，旧剧本工作台保持不变。
- 支持逐章/逐集创作、三种剧本格式、多语言、本土化留痕，以及 Markdown、DOCX 和 ZIP 交付。

### 已完成

- 建立 V2 创作状态：背景及世界观、角色圣经、剧情及大纲，小说与剧本独立单元及版本历史。
- 旧小说字段自动迁移到 V2，旧字段继续保留，锁定单元禁止 AI 覆盖。
- 同一结构化剧本母版支持 `international_production`、`hollywood_spec`、`asian_production` 三种渲染。
- AI 新增七阶段任务、界面语言规则、作品语言规则、逐章/逐集机器标记和本土化三段输出。
- 新增确定性文档合并器；只提供 Markdown、真实 DOCX 和完整 ZIP，不提供 PDF。
- `/novel-workbench` 改为左侧 38% 对话、右侧 62% 七阶段文档，保留资料上传、Universe、美术和分镜/视频交接。
- 翻译可跳过；本土化可切换完整内容、修改记录和雷同查验报告。

### 主要修改文件

- `app/novel-workbench/page.tsx`
- `components/creation/CreationWorkbench.tsx`
- `app/globals.css`
- `lib/creation/*`
- `lib/ai/prompts.ts`
- `lib/ai/generate.ts`
- `lib/creative-handoff.ts`
- `package.json`
- `package-lock.json`
- `tests/creation-*.test.mjs`

### 验证状态

- 底层状态、剧本格式、解析、AI 提示和文档导出模块在 UI 开发前已通过聚焦测试及 TypeScript 检查。
- 按项目负责人本轮明确要求，完成 UI 与下游交接后未再运行测试、production build、浏览器验收或线上回归，以节省额度。

### 风险 / 后续

- 下一位开发者开工后应优先补跑 TypeScript、production build，并检查桌面 1440x900 与移动 390x844。
- 需要用真实账号分别试跑小说单章、剧本单集、大章批量、翻译、本土化、DOCX/ZIP 下载和两个下游入口。
- 剧本 Markdown 手工编辑目前作为编辑稿保存；结构化母版仍是三种格式重渲染的权威来源，后续可增加“从编辑稿更新母版”的显式动作。

### Git 信息

- branch：`codex/creation-workbench-v2`
- commit / push：见本次最终提交与远端 `main`

### 给下一位 Codex

- 开工先读本条、`docs/superpowers/specs/2026-07-13-creation-workbench-v2-design.md` 和对应 plan。
- 不要删除旧剧本工作台；新创作工作台完成真实项目验收后，再由项目负责人决定下线时间。

---

## 2026-07-13 - Codex / 美术工作台生产故障修复

### 本次目标

- 修复 `/art-workbench?setup=1` 的导航遮挡、中等宽度裁切、旧项目状态残留和参考图未进入 AI 上下文等线上问题。
- 补齐美术项目、参考图与资产版本的云端保存反馈，避免浏览器存储失败时静默丢失。

### 已完成

- 美术工作台接入全局导航偏移，桌面端不再被左侧导航覆盖。
- 38/62 双栏改为可收缩网格，移除 761-1050px 区间造成横向裁切的固定最小宽度。
- `setup=1` 会清除旧的本地工作台状态并建立空白项目，同时从地址栏移除一次性参数。
- 来源项目同时读取本地缓存和 Supabase 项目，按 ID 与更新时间合并。
- 登录用户新建美术项目时会创建 `storyflow_art_projects` 云端记录；未登录时明确提示仅保存在当前设备。
- 新增 `/api/art/upload-reference`：PNG/JPG/WebP、最大 10MB，经服务端上传到私有 `art-assets` bucket。
- 对话参考图以 MiniMax `image_url` 多模态内容发送，不再只传文件名；资产详情页上传版本也改为云端存储。
- localStorage 写入失败会向创作者显示空间不足提示，不再静默忽略。

### 修改文件

- `app/api/art/chat/route.ts`
- `app/api/art/upload-reference/route.ts`
- `app/globals.css`
- `components/art/ArtAssetDetail.tsx`
- `components/art/ArtWorkbench.tsx`
- `components/art/ArtWorkbench.module.css`
- `components/art/ArtWorkbenchCollapse.module.css`
- `lib/ai/providers/minimax.ts`
- `lib/ai/providers/types.ts`
- `lib/supabase/art-storage.ts`
- `tests/art-workbench-layout.test.mjs`
- `tests/art-workbench-production-regressions.test.mjs`
- `docs/DEV_HANDOFF_LOG.md`

### 验证结果

- Node 测试：17/17 通过。
- TypeScript：`tsc --noEmit --incremental false` 通过。
- 资源校验：通过；既有 `LOGO_PRIMARY` orphan 警告未由本次引入。
- `git diff --check`：通过。
- 本机 Next production build 受 SMB 依赖中的 macOS SWC 二进制签名错误阻塞；以 Vercel Linux Production 构建为最终部署验证。

### 未完成 / 风险

- 当前工作台主体状态仍以 localStorage 为第一版缓存；本次只补齐项目外壳和图片文件的云端持久化，没有新增数据库 schema 或重写整套状态 API。
- 私有 bucket 的预览地址为七天签名 URL；后续完整云端状态迁移时应按 `storagePath` 在读取阶段重新签名。

### 给下一位 Codex

- 开工前先确认本条记录对应提交已经在 Vercel Production 成功部署。
- 不要重新引入双栏固定像素最小宽度；中等视口必须允许两栏按比例收缩。
- 参考图和上传版本只允许通过服务端私有 bucket 链路保存，不要恢复 Base64 写入 localStorage。

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

## 2026-07-13 - Codex / Atlas 临时全员授权与认证邮件修复

### 本次目标

- 暂时允许所有已注册并登录的 Kiikis 账号使用 Atlas 图片生成。
- 排查注册确认邮件、找回密码邮件中的链接乱码问题。

### 已完成

- `isAtlasAuthorizedUser` 增加服务端环境开关 `ART_ATLAS_ALLOW_ALL_AUTHENTICATED_USERS`。
- 开关仅在值严格等于 `true` 时生效；未登录请求仍会被认证层拒绝。
- 注册时显式设置当前站点为 Supabase 邮箱确认后的回跳地址。
- 新增 Supabase 注册确认和密码重置的 UTF-8 HTML 模板及控制台配置说明。
- 模板将 `{{ .ConfirmationURL }}` 放进按钮链接，不直接把长 URL 输出为正文，避免邮件客户端显示编码后的乱码。

### 修改文件

- `lib/art/providers/router.ts`
- `components/layout/AuthModal.tsx`
- `tests/art-provider-routing.test.mjs`
- `docs/supabase-auth-email-templates.md`
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
- Atlas 授权行为测试：5/5 通过。
- `pnpm exec tsc --noEmit`：通过。
- `pnpm run build`：通过。
- 资源校验：通过，既有 `LOGO_PRIMARY` 孤立 token 警告未由本次引入。
- 仓库未写入供应商密钥。

### 部署 / 配置操作

- 在 Vercel Production 新增 `ART_ATLAS_ALLOW_ALL_AUTHENTICATED_USERS=true`，然后重新部署。
- 在 Supabase `Authentication -> Email Templates` 粘贴 `docs/supabase-auth-email-templates.md` 中的 Confirm signup 与 Reset password 模板。
- 在 Supabase URL Configuration 中确认 Site URL 为 `https://www.kiikis.com`，并允许该站点回跳地址。

### 未完成 / 风险

- 当前 Codex 没有 Supabase Management API token，不能代替管理员直接修改项目级邮件模板；publishable key 也不具备该权限。
- 临时全员 Atlas 开关上线后，后续应改回 `ART_ATLAS_AUTHORIZED_EMAILS` / `ART_ATLAS_AUTHORIZED_USER_IDS` 白名单模式。
- 如果粘贴模板后仍显示乱码，应检查邮件供应商的 HTML 编码和链接追踪重写设置，并发送原始邮件源码进一步定位。

### 给下一位 Codex

- 不要把 `ART_ATLAS_ALLOW_ALL_AUTHENTICATED_USERS` 写入前端或改成 `NEXT_PUBLIC_*`。
- 邮件模板必须使用 `{{ .ConfirmationURL }}` 作为 href，不能拼接或 URL 二次编码。

---

## 2026-07-10 17:18 - Codex / 美术工作台线上环境验证

### 本次目标

- 验证用户已执行的 Supabase 美术工作台 migration 和 Vercel 图片服务环境变量是否可用。
- 说明 Atlas 特殊授权账号变量的配置方式。

### 已完成

- 用户确认 Supabase SQL Editor 已成功执行 `docs/supabase-art-workbench-migration.sql`。
- 使用测试账号获取 Supabase access token 后，请求线上 `https://www.kiikis.com/api/art/generate-image`。
- FLUX 路由验证通过：`selection=flux`、`modelId=flux-2-pro` 返回 200，生成 1 张图片，并返回可用预览地址。
- Atlas 路由验证通过：`selection=atlas`、`modelId=google/imagen4` 返回 200，生成 1 张图片，并返回 provider/model 信息。
- 验证过程未写入任何密钥到仓库或文档。

### 修改文件

- `docs/DEV_HANDOFF_LOG.md`

### 验证结果

- 线上 Supabase Auth：测试账号登录 token 获取成功。
- 线上 FLUX 图片接口：HTTP 200，`provider=flux`，`model=flux-2-pro`，`images=1`。
- 线上 Atlas 图片接口：HTTP 200，`provider=atlas`，`model=google/imagen4`，`images=1`。

### Git 信息

- branch：main
- commit：待提交
- push：待推送

### 未完成 / 风险

- Vercel 环境变量值无法也不应该在 Codex 中明文查看；本次通过真实运行时行为确认变量已生效。
- 用户已在对话中暴露过供应商 Key，建议后续在供应商后台轮换一次，并只保存在 Vercel Server Environment Variables。

### 给下一位 Codex

- Atlas 授权由 `ADMIN_EMAIL`、`ART_ATLAS_AUTHORIZED_EMAILS`、`ART_ATLAS_AUTHORIZED_USER_IDS` 控制。
- 标准用户默认走 FLUX；Atlas 只给管理员或特殊授权账号开放。

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
