# Phase 5 Handoff：全工作流融合与横向导出

> 分支：`feat/K22-P5-workflow-fusion`（从最新 `origin/main` @ `6ce3756d` 建立）
> 契约版本：`2.2.0-alpha.1`（兼容 `2.0.0-alpha.1`）
> 交付日期：2026-08-16
> 执行者：AutoClaw

## Goal

用同一 Project/Work/Version/Universe 身份串起歌曲、美术、分镜、视频、配音和剪辑；每个 Work 都能导出成果与留痕。跨工作流关系统一为 WorkUsageLink；歌曲接入 Conversation Ledger；CosyVoice 与剪辑组件只工作在适配层之后，不拥有 KIIKIS 身份。

## 验证结果（实际命令与结果）

```bash
node --test tests/server-v2/work-usage/*.test.mjs tests/song-conversation-ledger.test.mjs tests/song-generation-latest-input.test.mjs tests/song-prompt.test.mjs tests/art-workbench-production-regressions.test.mjs tests/storyboard-e2e-scenarios.test.mjs tests/production-e2e-flow.test.mjs tests/voice-cosyvoice-provider.test.mjs tests/voice-work-usage.test.mjs tests/v2-editor-timeline-versioning.test.mjs tests/v2-editor-exporters.test.mjs tests/server-v2/evidence/all-work-types.test.mjs tests/v2-production-package.test.mjs
# → 68 tests, 68 pass, 0 fail

npx playwright test e2e/v22-song-history.spec.ts e2e/v22-audiovisual-chain.spec.ts e2e/v22-voice-workbench.spec.ts e2e/v22-editing-workbench.spec.ts e2e/v22-all-work-evidence.spec.ts --project=chromium --workers=1
# → 10 passed (10.2s)（无后端时验证 UI 结构与真实失败语义，不伪造成功）

npx tsc --noEmit
# → 0 errors

pnpm build
# → 成功，全部路由正常生成
```

## Gate 5 验收

| 验收项 | 状态 | 证据 |
|---|---|---|
| 歌曲重开不丢消息，最新输入必定进入本次生成 | ✅ | `song-conversation-ledger.test.mjs`（真实顺序恢复、legacy 一次性导入）+ `song-generation-latest-input.test.mjs`（Snapshot 最后一条 user message = 最新输入，失败保留歌词/提示词/输入） |
| 角色/场景/道具统一在美术；分镜只有一个顶级页面 | ✅ | `artAssetKindScope`（非法类别拒绝）+ `STORYBOARD_ENTRY.id==="storyboard"`、`legacyDynamicStoryboardRedirect`（旧动态分镜 URL 302 兼容重定向，无顶级 Tab） |
| 剧本→美术→分镜→视频→剪辑使用同一 Project 和显式版本关系 | ✅ | `lib/production/lineage.ts`（`deriveWorkId` 同 projectId 独立稳定 workId、`fromScriptScene` 自动 source Checkpoint、`buildChain` 全程可回溯到剧本版本、`markUpstreamChanged` 标 stale 不删除）+ `editingInputLinks`（editing_input usage links） |
| 歌曲/配音保持独立 Work，可关联 Universe、角色、场景和剪辑 | ✅ | `buildSongUsageLinks`（diegetic_song/character_theme/episode_theme/scene_cue）+ `buildVoiceUsageLinks`（character_voice/narration/dialogue_line 绑定 Scene/Dialogue Line/Text Version） |
| CosyVoice 与剪辑组件只在适配层后工作，不拥有 KIIKIS 身份 | ✅ | `lib/voice/providers/cosyvoice.ts`（HTTP adapter：submit/poll/health/超时/错误映射/元数据不含 token）+ `lib/editor/webav-adapter.ts`（持久 URL→clip 映射；缺来源硬错误）+ TimelineEditorV22 dynamic import client boundary |
| `kiikis.timeline/1` round-trip、版本和兼容退路通过 | ✅ | `v2-editor-timeline-versioning.test.mjs`（无损 round-trip、未知 schema 拒绝、CAS 409、finalized 不覆盖）+ `v2-editor-exporters.test.mjs`（EDL/FCPXML 确定性、WebCodecs 退路） |
| 七类 Work 与演员资产均可下载成果和完整 Evidence | ✅ | `all-work-types.test.mjs`（7 类全覆盖 draft/checkpoint/finalized/messages/generations/choices/sources/universe/rights/hashes + actorEvidenceEntries + sanitizePackageEntries）+ `v2-production-package.test.mjs`（确定性 manifest/hash、持久 storage、临时 URL/secret/未授权声音不入包） |

## 交付内容

### 前置修复（main 基线缺口，Codex 方案优先）

- `70f47e7e fix(v2.2): restore usable checkpoint contracts from codex wip` — main 的组件（ScreenplayEditor/UnitNavigator/CreationWorkbench）已引用 `canCreateUnit/isUsableCheckpoint/onConfirmUsable` 但契约未提交，main tsc 损坏；从 P4 分支 stash 恢复 Codex 的 types.ts 并最小对接 ScreenplayStudio。
- Codex 随后提交剧本室重构（`092cefba` + `8b5e7c7d` + Vercel fix `eb6b5da1`/`8f768fde`），剧本室以 Codex 方案为准，未再触碰。

### Task 5.1：WorkUsageLink — `c578c1e3`

- `lib/contracts/v2/work-usage.ts` — 14 种 UsageRole、`WorkUsageLinkV1`、`usageLinkFingerprint`（幂等指纹）、`wouldCreateCycle`（沿边方向 DFS，防循环）
- `lib/server/v2/work-usage/index.ts` — createLink（owner/grant 门禁→版本归属→环检测→幂等→append-only 插入；非 owner 必须引用 Active Grant，revoked 阻止新 link 保留历史）、listLinks、getLink、auditOrphans
- `supabase/migrations/20260828050000_K22-P5_work_usage_media.sql` — `storyflow_work_usage_links`（append-only 触发器、RLS、索引）+ `storyflow_asset_versions_usage`（正式媒体持久指针）；审计 SQL
- API：`GET/POST /api/v2/works/[workId]/usages`、`GET /api/v2/work-usages/[usageId]`

### Task 5.2：歌曲会话与生成修复 — `5b9423c0`

- `lib/client/v2/song-workbench/session.ts` — SongSessionLedger：真实顺序恢复（user/assistant 交替、baseVersionId 关联）、legacy notes 一次性导入（`legacy_import` 标记、幂等 key）
- `lib/client/v2/song-workbench/generation.ts` — SongGenerationFlow：最新输入先存为真实 user message → Snapshot 引用它作为最后一条 user message → 失败保留歌词/提示词/输入；applyCandidate append-only 建 Work Version
- `lib/song/prompt.ts` — `deriveDevelopmentSummary`（派生摘要，不再是事实源）、`isLegacyImportContent`
- `lib/song/universe-links.ts` — `buildSongUsageLinks`（diegetic_song/character_theme/episode_theme/scene_cue）

### Task 5.3：美术/分镜/视频谱系 — `720ae432`

- `lib/production/lineage.ts` — 剧本场→下游自动 source Checkpoint、同 projectId 独立稳定 workId、链式回溯、stale 处理（keep_old/new_candidate 不删除）、videoJobBinding、临时 URL 判定、finalizeToPersistentStorage、artAssetKindScope、separateCharacterIdentity
- `lib/storyboard/contracts.ts` — `STORYBOARD_ENTRY`（唯一顶级入口）、`STORYBOARD_WORKBENCH_TABS`（镜头表/宫格/运动预览/视频提示词/版本 Diff）、`isDynamicGridTab`、`legacyDynamicStoryboardRedirect`
- `lib/projects.ts` — Node ESM 兼容修复（2 处无扩展名 import 加 `.ts`）

### Task 5.4：CosyVoice 适配层 — `1ebd2b90`

- `lib/voice/providers/cosyvoice.ts` — VoiceProvider 契约实现：submit/poll/cancel/health、超时（AbortController）、401/5xx 错误映射、`lastMetadata`（model+params，不含 token）
- `lib/voice/provider.ts` — resolver 支持 `cosyvoice`（env `COSYVOICE_BASE_URL/COSYVOICE_API_TOKEN/COSYVOICE_MODEL`，仅服务端）
- `lib/voice/types.ts` — VoiceProviderName 增加 `cosyvoice`
- `lib/voice/queries.ts` — `buildVoiceUsageLinks`（character_voice/narration/dialogue_line）、`replaceDubbing`（已定稿剪辑不变）、`privateTrialOnly`（真人 clone 缺授权仅私有试用）
- `components/v2/voice-workbench/`（VoiceWorkbench + VoiceLineEditor + CSS）、`app/voice-workbench/page.tsx`、`GET /api/voice/provider-status`、`POST /api/voice-lines/generate`

### Task 5.5：轻量剪辑 — `73bda235` + `8f768fde`

- 依赖固定：`@xzdarcy/react-timeline-editor@1.0.0`（MIT，peer react>=18 ✓）、`@webav/av-cliper@1.2.8`（MIT）；rte 无独立 CSS（记录）
- `lib/server/v2/editing/index.ts` — roundTripTimeline（无损、未知 schema 拒绝）、TimelineVersioningService（CAS 409、finalized 不覆盖、每次保存新版本）、editingInputLinks
- `lib/editor/webav-adapter.ts` — WebCodecs 判定、持久 URL→clip 映射（缺来源硬错误）、EDL/FCPXML 确定性导出
- `app/api/v2/works/[workId]/timeline/route.ts`（GET 最新/POST CAS 保存）、`components/editor/TimelineEditorV22.tsx`（dynamic import client boundary、WebCodecs 退路提示）

### Task 5.6：横向 Evidence 与确定性导出 — `b0f06d89` + `33cfb989` + `fix(package-builder imports)`

- `lib/server/v2/evidence/all-work-types.ts` — 7 类 Work 全覆盖 manifest、actorEvidenceEntries（Actor/Portrayal/Asset Version/Job/人工选择/权利 + evidenceHash）、sanitizePackageEntries（临时 URL/secret/未授权声音剔除）
- `lib/export/deterministic-package.ts` + `package-builder.ts` re-export — 确定性 manifest/hash/sha256、manifest 反查来源
- `tests/server-v2/evidence/all-work-types.test.mjs`（4）、`tests/v2-production-package.test.mjs`（4）

## 关键架构决策

1. **WorkUsageLink 是唯一跨工作流关系**：14 种 role 一张表，append-only，source version 创建时锁定；grant 撤销不删历史 link。
2. **谱系可回溯**：每个下游节点持有 sourceWorkId+sourceVersionId；视频 Job 绑定 Shot/Storyboard Version/Model/Provider；Provider URL 只用于 ingestion。
3. **确定性导出**：同一输入 → 同一 manifestHash/sha256；媒体只从持久 storagePath 引用；临时 URL/secret/未授权声音一律不入包。
4. **Provider/第三方组件只在适配层后**：CosyVoice 适配器暴露 KIIKIS 领域输入输出；WebAV/React Timeline Editor 只编辑 projection，不保存第三方内部 state。
5. **Node ESM 兼容修复**（为 node --test 直跑 .ts）：`lib/projects.ts` 2 处、`lib/export/package-builder.ts` 3 处无扩展名 import 加 `.ts`；新逻辑模块一律显式 `.ts` 后缀。
6. **mock 测试纪律延续**：in-memory PostgREST mock（eq/order/幂等语义）验证 owner/CAS/原子性真实行为；`.mjs` 测试文件不使用 TS 类型语法（inline type / 非空断言），纯 JS。
7. **剧本室以 Codex 方案为准**：Codex 重构期间并行修改的 4 个组件文件未触碰；其未提交契约（types.ts）从 stash 恢复并提交。

## 已知限制（不包装成完成）

- **CosyVoice 未连真实服务**：adapter 用 fake fetch 测试；真实 CosyVoice 服务地址/凭证需环境配置，健康检查与错误映射未在线上验证。
- **WebAV/React Timeline Editor 仅 adapter + UI 骨架**：浏览器预览/组合需要 WebCodecs 环境（Chrome 102+）；Safari/Firefox 显示 EDL/FCPXML 退路，未验证真实组合输出。
- **E2E 无真实后端**：验证 UI 结构与 API 真实失败语义；带真实 DB/存储桶的全链路（上传→生成→导出下载）需环境。
- **七类 Work 的 Shell 统一接入未做**：Task 5.6 交付了 Evidence 逻辑层与确定性导出包；`components/v2/workbench-shell/` 的实际 UI 接入（TopBar 统一、缺 workId 阻断）留待后续（需真实 workbench 结构稳定后）。
- **migration 未在真实 Supabase 应用**：`20260828050000_K22-P5_work_usage_media.sql` 为 forward-only + IF NOT EXISTS，应用顺序 P1→P5。
- **并行提交说明**：分支含 Codex 的 `092cefba`（剧本室重构）、`8b5e7c7d`、`eb6b5da1`/`8f768fde`（Vercel 构建 fix）——按用户指示以 Codex 方案为准保留。

## 下一步（Phase 6）

- 任务文件：`docs/kiikis-2.2/AutoClaw/06-Phase-6-集成UAT与发布.md`
- 进入条件：Phase 5 Gate PASS（本 handoff）；建议先补真实后端环境（Supabase migration 应用 + CosyVoice/存储桶配置）
- Deferred：workbench-shell 七工作台统一 UI、真实 CosyVoice 联调、WebAV 真实组合验证、剪辑 timeline 与编辑器的完整交互

## 回滚方式

- 分支级：`git checkout main && git branch -D feat/K22-P5-workflow-fusion`（未合并前）
- migration 级：`20260828050000_K22-P5_work_usage_media.sql` 表族独立，可按惯例单独 DROP（不触碰 Phase 0-4 表）
- 代码级：各 commit 以新增文件为主，`git revert <sha>` 无冲突风险

## 提交清单

```
70f47e7e fix(v2.2): restore usable checkpoint contracts from codex wip
c578c1e3 feat(v2.2): add versioned work usage links
5b9423c0 feat(v2.2): preserve song conversations and latest input
092cefba feat: redesign screenplay studio for ai-first workflow（Codex）
8b5e7c7d chore: trim vercel deployment context（Codex）
720ae432 feat(v2.2): unify art storyboard and video lineage
eb6b5da1 fix: tolerate vercel builds without git metadata（Codex）
1ebd2b90 feat(v2.2): add cosyvoice workbench adapter
73bda235 feat(v2.2): add versioned editing timeline
8f768fde fix: keep runtime fixtures in vercel source（Codex）
b0f06d89 feat(v2.2): expose evidence across every workbench
33cfb989 fix(v2.2): stabilize voice workbench provider check
（后）fix(v2.2): node-esm extension for export package builder imports
```
