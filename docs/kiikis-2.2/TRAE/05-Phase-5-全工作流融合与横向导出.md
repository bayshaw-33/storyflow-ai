# Phase 5：全工作流融合与横向导出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: 使用测试驱动按 5.1→5.6 顺序执行。只执行本阶段，完成后写 `handoffs/phase-5.md` 并停止。

**Goal:** 用同一 Project/Work/Version/Universe 身份串起歌曲、美术、分镜、视频、配音和剪辑，并让每个 Work 都能导出成果与留痕。

**Architecture:** 跨工作流关系统一为 WorkUsageLink。现有 Art、Storyboard、Video、Voice、Editor 能力通过适配层消费 Work Version/Asset Version；歌曲接入 Conversation Ledger。配音和剪辑保持独立 Work，不强行增加复杂向导。

**Tech Stack:** React/Next.js、Phase 1 History/Evidence、Phase 2 Universe、Asset Version API、CosyVoice provider adapter、`@xzdarcy/react-timeline-editor@1.0.0`、`@webav/av-cliper@1.2.8`。

## Global Constraints

继承 [`README.md`](./README.md) 全部约束。第三方组件不得创建平行项目体系；正式媒体必须先转存到持久对象存储。

---

## 前置与分支

- 前置：Phase 4 Gate PASS；读取 `handoffs/phase-4.md`。
- 分支：`trae/K22-P5-workflow-fusion`。
- Migration：`supabase/migrations/20260828050000_K22-P5_work_usage_media.sql`。
- 推荐提交：
  1. `feat(v2.2): add versioned work usage links`
  2. `fix(v2.2): preserve song conversations and latest input`
  3. `feat(v2.2): unify art storyboard and video lineage`
  4. `feat(v2.2): add cosyvoice workbench adapter`
  5. `feat(v2.2): add versioned editing timeline`
  6. `feat(v2.2): expose evidence across every workbench`

## Task 5.1：WorkUsageLink 跨工作流关系

**Files:**

- Create: `lib/contracts/v2/work-usage.ts`
- Create: `supabase/migrations/20260828050000_K22-P5_work_usage_media.sql`
- Create: `supabase/migrations/audits/audit_K22_P5_work_usage_media.sql`
- Create: `lib/server/v2/work-usage/index.ts`
- Create: `app/api/v2/works/[workId]/usages/route.ts`
- Create: `app/api/v2/work-usages/[usageId]/route.ts`
- Test: `tests/server-v2/work-usage/work-usage.test.mjs`

**Interfaces:**

```ts
export type UsageRole =
  | "source_script" | "art_reference" | "storyboard_source" | "video_source"
  | "universe_theme" | "character_theme" | "work_theme" | "episode_theme"
  | "scene_cue" | "diegetic_song" | "character_voice" | "narration"
  | "dialogue_line" | "editing_input";

export interface WorkUsageLinkV1 {
  id: string;
  sourceWorkId: string;
  sourceWorkVersionId: string;
  targetProjectId: string;
  targetWorkId: string;
  targetWorkVersionId: string | null;
  targetEntityType: string | null;
  targetEntityId: string | null;
  usageRole: UsageRole;
  assetVersionId: string | null;
  rightsSnapshotId: string | null;
  createdAt: string;
}
```

- [ ] **Step 1：写 RED**：跨 owner/无 grant 拒绝、sourceVersion 不属于 sourceWork 拒绝、循环链拒绝、重复幂等、撤销新使用不删除历史 link。
- [ ] **Step 2：实现 append-only 表与 API**：正式 link 锁定 source version；更新来源只创建新 link 或 target 新版本。
- [ ] **Step 3：接入 Usage Grant**：非 owner 来源必须引用 Active Grant 和 terms snapshot；Revoked for New Use 阻止新 link，已有 link 保留。
- [ ] **Step 4：audit GREEN**：无孤儿 Work/Version/Asset/Grant 引用。

## Task 5.2：歌曲会话与“生成/更新”修复

**Files:**

- Create: `lib/client/v2/song-workbench/session.ts`
- Create: `lib/client/v2/song-workbench/generation.ts`
- Modify: `app/song-workbench/page.tsx`
- Modify: `lib/song/prompt.ts`
- Modify: `lib/song/universe-links.ts`
- Test: `tests/song-conversation-ledger.test.mjs`
- Test: `tests/song-generation-latest-input.test.mjs`
- Test: `tests/song-prompt.test.mjs`
- Create: `e2e/v22-song-history.spec.ts`

**Interfaces:** Consumes Phase 1 Conversation/Generation APIs；`songDevelopmentNotes` 降级为派生摘要，只用于旧项目导入，不再回写为事实源。

- [ ] **Step 1：写重开 RED**：历史 user/assistant 消息按真实顺序恢复，不被压成一段 assistant notes；歌词、提示词和消息版本保持关联。
- [ ] **Step 2：写最新输入 RED**：输入“副歌更克制”后点击生成，Generation Snapshot 的最后一条 user message 必须是该文字；点击时不先清空输入或现有成果。
- [ ] **Step 3：实现旧记录一次性导入**：旧 notes 作为一条标记 `legacy_import` 的 source message 导入，之后所有消息逐条保存；重复打开不重复导入。
- [ ] **Step 4：实现生成/更新**：保存当前输入→创建 Snapshot→启动 Job→生成 Candidate→用户应用创建 Work Version。失败保留原歌词/提示词和当前消息。
- [ ] **Step 5：歌曲显式关联**：支持 Universe/角色/作品/集/场景 usage role；歌曲流程和现有创作界面不重做。

## Task 5.3：剧本→美术→分镜→视频的身份与谱系融合

**Files:**

- Modify: `components/art/ArtWorkbench.tsx`
- Modify: `lib/art-workbench.ts`
- Modify: `components/production/ProductionWorkbench.tsx`
- Modify: `components/production/StoryboardPanels.tsx`
- Modify: `app/storyboard-workbench/page.tsx`
- Modify: `app/video-workbench/page.tsx`
- Modify: `lib/storyboard/contracts.ts`
- Modify: `lib/storyboard/dynamic-grid-contract.ts`
- Modify: `lib/production/state.ts`
- Modify: `lib/production/universe.ts`
- Test: `tests/art-workbench-production-regressions.test.mjs`
- Test: `tests/storyboard-e2e-scenarios.test.mjs`
- Test: `tests/production-e2e-flow.test.mjs`
- Create: `e2e/v22-audiovisual-chain.spec.ts`

**Interfaces:** 每个下游 Work 使用 `source_script`/`storyboard_source`/`video_source` Link；每个正式产物使用 Asset/Asset Version 和来源 Job。

- [ ] **Step 1：写链路 RED**：从剧本场景试做美术时自动创建 source Checkpoint；Art/Storyboard/Video 复用同 projectId，拥有独立 workId，来源版本可追溯。
- [ ] **Step 2：统一美术**：角色、场景、道具只在 Art Workbench 的类别/标签中区分；Character Identity 与 Work Local Appearance/Asset Version 分离。
- [ ] **Step 3：合并分镜概念**：入口只保留“分镜”；单一页面同时承载镜头表、4/6/9/12 宫格、运动预览、视频提示词和版本 Diff。旧动态分镜 URL 只做兼容重定向，不再显示顶级 Tab。
- [ ] **Step 4：视频来源与持久结果**：Job 绑定 Shot、Storyboard Version、Model、Provider；Provider URL 只在 ingestion 临时使用，完成后 Asset Version 指向持久 storage path。
- [ ] **Step 5：上游变化处理**：已生成 Art/Storyboard/Video 保留，标 stale 并提供继续旧版/创建新候选；不自动删除或替换。
- [ ] **Step 6：E2E**：剧本场→美术母版→分镜→视频在同一项目完成，任一产物可回到源版本。

## Task 5.4：轻量配音与 CosyVoice 适配层

**Files:**

- Create: `lib/voice/providers/cosyvoice.ts`
- Modify: `lib/voice/provider.ts`
- Modify: `lib/voice/types.ts`
- Modify: `lib/voice/queries.ts`
- Modify: `app/voice-workbench/page.tsx`
- Create: `components/v2/voice-workbench/VoiceWorkbench.tsx`
- Create: `components/v2/voice-workbench/VoiceLineEditor.tsx`
- Modify: `app/api/voice-lines/[voiceLineId]/generate/route.ts`
- Test: `tests/voice-cosyvoice-provider.test.mjs`
- Test: `tests/voice-work-usage.test.mjs`
- Create: `e2e/v22-voice-workbench.spec.ts`

**Interfaces:** Provider adapter 只暴露 KIIKIS 领域输入输出；正式输出写 Asset Version，`Voice Identity` 与 `Character Identity` 用 usage link 关联。

```ts
export interface VoiceProvider {
  submit(input: { text: string; language: string; emotion?: string; speed?: number; voiceRef?: string }): Promise<{ providerTaskId: string }>;
  poll(providerTaskId: string): Promise<{ status: "running" | "completed" | "failed"; temporaryUrl?: string; error?: string }>;
  cancel?(providerTaskId: string): Promise<void>;
}
```

- [ ] **Step 1：写 provider contract RED**：超时、失败、重试、临时 URL ingestion、模型/参数记录；网络测试用 fake provider，不依赖在线模型。
- [ ] **Step 2：实现 CosyVoice HTTP adapter**：服务地址和凭证仅服务端环境变量；对官方 FastAPI/gRPC 服务增加健康检查、超时和错误映射。
- [ ] **Step 3：实现简单工作台**：选择角色/旁白/台词、Voice Identity、语言、情绪、速度，生成并试听；不增加复杂流程向导。
- [ ] **Step 4：真人声音保护**：voice clone 缺授权时仅可私有试用，不可公开/商业；服务端 enforce，UI 解释原因。
- [ ] **Step 5：显式关系**：角色声音绑定 Character→Voice Identity；台词绑定 Scene/Dialogue Line/Text Version；替换配音不改变已定稿剪辑。

## Task 5.5：轻量剪辑与 `kiikis.timeline/1`

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `app/editor/EditorPageClient.tsx`
- Modify: `components/editor/EditorFramework.tsx`
- Create: `components/editor/TimelineEditorV22.tsx`
- Create: `lib/editor/webav-adapter.ts`
- Create: `lib/server/v2/editing/index.ts`
- Create: `app/api/v2/works/[workId]/timeline/route.ts`
- Modify: `lib/editor/timeline-schema.ts`
- Modify: `lib/editor/types.ts`
- Test: `tests/v2-editor-timeline-versioning.test.mjs`
- Test: `tests/v2-editor-exporters.test.mjs`
- Create: `e2e/v22-editing-workbench.spec.ts`

**Interfaces:** Timeline 持久化为 Phase 1 Work Version，`contentSchema = "kiikis.timeline/1"`；React Timeline Editor 只编辑 projection，WebAV 只负责浏览器预览/组合。

- [ ] **Step 1：固定并审计依赖**

```bash
pnpm add @xzdarcy/react-timeline-editor@1.0.0 @webav/av-cliper@1.2.8
```

保存 MIT 许可证来源和依赖审计输出；若生产构建不兼容 React 19/SSR，记录证据并通过 dynamic import/client boundary 解决，不替换事实源。

- [ ] **Step 2：写 timeline round-trip RED**：tracks/clips/source Asset Version/in/out/transform/audio/subtitle 序列化后无损；未知 schema 拒绝；并发保存 CAS 冲突。
- [ ] **Step 3：实现轨道 UI adapter**：React Timeline Editor 的 row/action 与 `kiikis.timeline/1` 双向映射；不保存第三方内部 state。
- [ ] **Step 4：实现 WebAV adapter**：将持久 Asset URL 转成 `MP4Clip/ImgClip/Sprite/Combinator`；不支持 WebCodecs 时明确提供 EDL/FCPXML/服务端导出。
- [ ] **Step 5：版本与关系**：每次保存创建 Editing Work Version；输入视频、歌曲、配音、字幕均建立 `editing_input` Link；Finalized timeline 不可覆盖。
- [ ] **Step 6：浏览器验证**：Chrome 102+ / Edge 当前稳定版可预览和导出最小项目；Safari/Firefox 显示兼容退路，不伪装成功。

## Task 5.6：所有 Work 的横向定稿、导出与 Evidence

**Files:**

- Modify: `components/v2/workbench-shell/VersionActions.tsx`
- Modify: `components/v2/workbench-shell/EvidenceActions.tsx`
- Modify: `components/v2/workbench-shell/WorkbenchShell.tsx`
- Modify: `lib/server/v2/evidence/manifest-v2.ts`
- Modify: `lib/export/package-builder.ts`
- Modify: `app/api/export/production-package/route.ts`
- Test: `tests/server-v2/evidence/all-work-types.test.mjs`
- Test: `tests/v2-production-package.test.mjs`
- Create: `e2e/v22-all-work-evidence.spec.ts`

- [ ] **Step 1：写覆盖 RED**：script/song/art/storyboard/video/voice/editing 和演员/角色资产都能导出当前草稿、Checkpoint、Finalized、消息、生成、选择、来源、Universe、权利和 hashes。
- [ ] **Step 2：把 Shell 接到七个工作台**：专业界面不统一，TopBar 的身份/Universe/版本/Evidence 统一；缺少 workId 时阻断并引导修复。
- [ ] **Step 3：确定性包**：同一 Work Version 重复导出 manifest/hash 一致；媒体文件从持久 storage 读取；临时 URL、secret 和未授权原始声音不进入包。
- [ ] **Step 4：演员留痕**：Actor/Portrayal/Asset Version、生成 Job、人工选择和权利声明进入 Evidence；提供 Actor 详情页下载入口。
- [ ] **Step 5：全链 E2E**：从剧本到剪辑下载完整包，manifest 可反查每个成果的来源 Work/Version/Asset/Job。

## Phase 5 完整验证

```bash
node --test tests/server-v2/work-usage/*.test.mjs tests/song-conversation-ledger.test.mjs tests/song-generation-latest-input.test.mjs tests/song-prompt.test.mjs tests/art-workbench-production-regressions.test.mjs tests/storyboard-e2e-scenarios.test.mjs tests/production-e2e-flow.test.mjs tests/voice-*.test.mjs tests/v2-editor-*.test.mjs tests/server-v2/evidence/*.test.mjs tests/v2-production-package.test.mjs
npx playwright test e2e/v22-song-history.spec.ts e2e/v22-audiovisual-chain.spec.ts e2e/v22-voice-workbench.spec.ts e2e/v22-editing-workbench.spec.ts e2e/v22-all-work-evidence.spec.ts --project=chromium
npx tsc --noEmit
pnpm build
```

## Gate 5

- 歌曲重开不丢消息，最新输入必定进入本次生成。
- 角色/场景/道具统一在美术；分镜只有一个顶级页面。
- 剧本→美术→分镜→视频→剪辑使用同一 Project 和显式版本关系。
- 歌曲/配音保持独立 Work，并可关联 Universe、角色、场景和剪辑。
- CosyVoice 与剪辑组件只在适配层后工作，不拥有 KIIKIS 身份。
- `kiikis.timeline/1` round-trip、版本和兼容退路通过。
- 七类 Work 与演员资产均可下载成果和完整 Evidence。

## 禁止扩展

- 不重做歌曲工作流。
- 不恢复“动态分镜”独立页面。
- 不加入多轨专业 NLE 的高级调色、特效市场或插件系统。
- 不把 CosyVoice 服务部署代码放入 Next.js Web 仓库；这里只实现 provider adapter。
- 不在 Provider 临时 URL 上宣告 Asset Ready。
