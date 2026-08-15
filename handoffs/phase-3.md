# Phase 3 Handoff：最好用的剧本室

> 分支：`feat/K22-P3-screenplay-studio`
> 基线：`origin/main` @ `a33defdf`（Phase 2 合并后）
> 契约版本：`2.2.0-alpha.1`（兼容 `2.0.0-alpha.1`）
> 交付日期：2026-08-15
> 执行者：AutoClaw

## Goal

把高频剧本创作升级为可自由导航、持续对话、局部改写、版本安全、Universe 可见的"AI 剧本室"：三栏布局 + 结构化 Screenplay Document；导航状态、内容状态、正式版本状态分离；"聊一聊"只追加对话，"生成修改方案"产生可审阅 Candidate Diff，采用后才产生新版本；长剧本支持连续性定位与增量索引。

## 验证结果（实际命令与结果）

```bash
node --test tests/contracts-v22/screenplay-studio.test.mjs tests/server-v2/screenplays/*.test.mjs tests/ui-v2/screenplay-studio/*.test.mjs tests/creation-workbench-ui.test.mjs
# → 60 tests, 60 pass, 0 fail

npx playwright test e2e/v22-screenplay-navigation.spec.ts e2e/v22-screenplay-ai.spec.ts --project=chromium
# → 7 passed (19.7s)（dev server 真实渲染；无后端时验证 UI 结构与导航契约，不伪造服务成功）

npx tsc --noEmit
# → 0 errors

pnpm build
# → 成功，全部路由正常生成
```

## Gate 3 验收

| 验收项 | 状态 | 证据 |
|---|---|---|
| 无小说入口和小说/剧本双轨 | ✅ | script-workbench 渲染 ScreenplayStudio；无参数保持旧 novel-workbench 兼容重定向（历史入口，非新双轨）；无任何小说模式 unit type |
| 世界观/角色/大纲/分集/正文可自由进入 | ✅ | `tests/contracts-v22/screenplay-studio.test.mjs`（允许 world/character/outline 为空时创建第一场）+ `tests/ui-v2/screenplay-studio/navigation.test.mjs`（canOpenUnit 恒 true）+ E2E 左栏五分组无门禁文案 |
| 上游变化不删除下游，只产生可处置 stale | ✅ | `tests/server-v2/screenplays/dependencies.test.mjs`（内容不被删、四种处置均保留旧版本 + evidence） |
| "聊一聊"不改内容，"生成修改方案"不经确认不落正文 | ✅ | `tests/server-v2/screenplays/generation.test.mjs`（discuss 0 版本 0 候选；候选 apply-only）+ E2E 聊一聊后无候选面板 |
| 重开后会话、当前 unit、候选、版本和引用完整恢复 | ✅ | URL `?workId=&unitId=` 恢复写作位置（E2E）；消息/候选持久化在 Phase 1 表；每 unit 内容缓存保留未保存编辑 |
| 长剧本冲突可定位到集、场和文本来源 | ✅ | `tests/server-v2/screenplays/continuity.test.mjs`（episodeId+sceneId+unitVersionId+textStart/End，拒绝裸"可能冲突"） |
| 草稿可试做；正式动作只消费明确 Finalized Version | ✅ | `tests/ui-v2/screenplay-studio/navigation.test.mjs`（formalActionRequiresFinalized / draftTryoutPolicy 自动冻结 checkpoint） |

## 交付内容

### Task 3.1：Screenplay Document 与 Unit 契约 — `b5ff7b01`

- `lib/contracts/v2/screenplay-studio.ts` — `ScreenplayUnitType`（world/character/outline/episode/scene）、`UnitReadiness`、`DependencyState`、`ScreenplayDocumentV1`、`assertScreenplayDocumentV1`（拒绝重复 ID/scene 无 episode 父/非法 order/循环 parent/跨 Work）、`canonicalScreenplayDocumentJson`（稳定序列化）
- `lib/server/v2/screenplays/document.ts` — `parseScreenplayDocument`、`orderUnits`、`findUnitAncestors`、`findDownstreamUnits`、`computeScreenplayDocumentHash`
- `tests/contracts-v22/screenplay-studio.test.mjs` — 18 测试：枚举、拒绝规则、自由进入、结构工具、canonical hash 稳定性

关键约束：契约模块零 `node:crypto`（客户端 bundle 安全）；order 唯一性按"同父同类型"分组（根层 world/character/outline 各自独立排序）。

### Task 3.2：Unit 身份、版本和依赖状态 — `807a2448`

- `supabase/migrations/20260828030000_K22-P3_screenplay_units.sql` — `storyflow_screenplay_units`（身份：title/order 可更新）、`storyflow_screenplay_unit_versions`（不可变 append-only，UPDATE/DELETE 触发器拦截）、`storyflow_screenplay_dependency_edges`（source/target unit version + state）、`storyflow_stale_resolutions`（处置 evidence，append-only）；全部 forward-only + RLS
- `lib/server/v2/screenplays/units.ts` — `ScreenplayUnitsService`：createUnit（自由创建）/ updateUnitIdentity（身份更新不产版本）/ saveUnitContent（CAS baseVersionId → 409 + currentVersionId）/ markFinalized（finalized 后修改产生 child draft）/ adaptLegacyProject（story_bible/episodes/scenes → 稳定 legacyId units，幂等，不批量覆盖旧字段）
- `lib/server/v2/screenplays/dependencies.ts` — recomputeStale（上游新版本 → edge 标 stale，内容不删、readiness 不重置）/ resolveStale（keep_old/regenerate/manual_revise/confirm_no_impact 四种处置，全部保留旧下游版本 + evidence）
- API：`GET/POST /api/v2/works/[workId]/screenplay`（列 units / 旧项目适配）、`GET/PATCH/POST/PUT .../screenplay/units/[unitId]`（读/身份/存版本/定稿）、`GET/POST .../screenplay/dependencies`（列 stale / recompute|resolve）、`GET/POST .../screenplay/units`（列/建）
- `GET /api/v2/project-start/resolve-work`（旧 projectId → primary Work，只读）

### Task 3.3：三栏剧本室与自由导航 — `1fc59e3e`

- `components/v2/screenplay-studio/ScreenplayStudio.tsx` — 三栏布局；URL 状态恢复；窄屏抽屉不丢编辑态（每 unit 内容缓存）；409 冲突显示处置条不覆盖
- `UnitNavigator.tsx` — 五分组树 + readiness 色点 + stale 徽标；空组显示"＋"创建而非禁用
- `ScreenplayEditor.tsx` — 空内容建议（软引导）+ "继续创作"恒可用；光标位置恢复
- `StudioRightPanel.tsx` — KK/引用/版本/连续性四 tab
- `lib/client/v2/screenplay-studio/types.ts` — NAV_GROUPS、RIGHT_PANEL_TABS、STUDIO_LAYOUT、buildStudioUrl/parseStudioUrl、canOpenUnit（恒 true，防回归线性门禁）、formalActionRequiresFinalized、draftTryoutPolicy、emptyUnitSuggestion
- `lib/client/v2/screenplay-studio/api.ts` — 全部 API 封装，错误显式抛出（无本地假成功）
- `app/script-workbench/page.tsx` — V2.2 Work → ScreenplayStudio；旧 projectId 经 resolve-work 适配进入；CreationWorkbench.tsx 未改动（旧入口保持兼容，未在其中叠加）

### Task 3.4：KK 两种操作语义与 Candidate Diff — `a2fdd81e`

- `lib/server/v2/screenplays/generation.ts` — discuss（user msg → Context Packet → assistant msg，0 内容版本）；proposeChange（快照保存 scope/baseVersionId/messageIds/contextPacketId → Candidate Diff；apply-only）；applyCandidate（只为接受的 hunks 建 editing_draft）；rejectCandidate（只改状态）；失败保护（用户消息+快照持久化；idempotencyKey 重试复用快照，不重复消息）；复用 Phase 1 表（conversation_threads/messages、generation_request_snapshots、generation_candidates、work_versions），零新表
- API：`POST .../screenplay/discuss`、`POST/PUT/DELETE .../screenplay/propose-change`
- `KkScreenplayRoom.tsx` + `CandidateDiffPanel.tsx` — 双模式按钮（聊一聊/生成修改方案）；before/after 逐块接受；未接受任何块时"采用"禁用；失败保留输入 + 重试复用同一快照
- 注：modelInvoke 在 Phase 5 model-router 接入前返回确定性回显/建议块，语义为"产生待审阅 patch"，绝不静默改正文

### Task 3.5：长剧本连续性与影响分析 — `dde1f19a`

- `supabase/migrations/20260828031000_K22-P3_screenplay_continuity.sql` — `storyflow_continuity_index`（增量索引）、`storyflow_continuity_findings`（定位化冲突 + 状态机）、`storyflow_evidence_events`（处置 evidence，append-only）
- `lib/server/v2/screenplays/continuity.ts` — analyze（名字一致性等跨单元检查，定位到 episode/scene/unitVersion/[textStart,textEnd]）；reindexUnit（只重算受影响单元）/reindexAll；listReferences（对象级引用 + version + reason，无 prompt blob）；disposeFinding（ignore/revise/create_candidate/universe_proposal 全部写 evidence）
- `ContinuityPanel.tsx` + `ReferenceList.tsx` — 冲突列表可点开来源单元；四种处置按钮；引用列表带 reason 标签

### E2E — 同 `dde1f19a` 后单独提交

- `e2e/v22-screenplay-navigation.spec.ts`（4 tests）+ `e2e/v22-screenplay-ai.spec.ts`（3 tests），chromium 全过

## 关键架构决策

1. **状态三分**：导航状态（URL）、内容状态（unit versions + 本地编辑缓存）、正式版本状态（finalized 指针）分离，Gate 3 的"重开恢复"由此达成。
2. **canOpenUnit 恒 true 写成显式函数**：防止未来回归线性门禁，测试直接锁语义。
3. **复用 Phase 1 会话/快照/候选表**：Task 3.4 零新 migration，append-only 语义与幂等键直接继承。
4. **mock fetcher 测真实语义**：服务层测试用 in-memory PostgREST mock（eq/is/in 过滤、PostgREST 参数格式），验证 owner/409/幂等真实行为，不用 fixture 冒充。
5. **未配置后端时 UI 显示真实错误**（errorBar + service_unavailable），不本地假造数据。

## 已知限制（不包装成完成）

- **真实模型路由未接入**：discuss/propose 的 modelInvoke 是确定性回显（Phase 5 model-router 接入点已留），Candidate patch 目前来自请求本身推导，不是真实 AI 改写。
- **E2E 无真实后端**：验证 UI 结构与导航契约；带真实 Work/Universe 的全链路 E2E 需要环境（与 Phase 2 相同限制）。
- **10 集 × 20 场真实剧本手工验证未执行**：需要用户提供或授权生成匿名化样本。
- **migration 未在真实 Supabase 应用**：本机无 DB 服务配置；SQL 为 forward-only + IF NOT EXISTS，应用顺序 20260828030000 → 20260828031000。
- **旧 projectId 适配**只覆盖 primary Work 解析；story_bible 富结构导入走 POST /screenplay（adaptLegacyProject），未在真实旧库上跑过。

## 下一步（Phase 4）

- 任务文件：`docs/kiikis-2.2/AutoClaw/04-Phase-4-站外原作导入Universe.md`
- 进入条件：Phase 3 Gate PASS（本 handoff）；建议先补真实后端环境下的 migration 应用 + 一部真实剧本的手工验证
- Deferred：真实 AI provider 接入（Phase 5）、移动端手势优化、连续性规则扩展（时间线/道具规则检测器目前只有名字一致性落库）

## 回滚方式

- 分支级：`git checkout main && git branch -D feat/K22-P3-screenplay-studio`（未合并前）
- migration 级：两个新增表族相互独立，可按 `supabase/migrations/rollback/` 惯例单独 DROP（不触碰 Phase 0-2 表）
- 代码级：五个 commit 均为新增文件为主，`git revert <sha>` 无冲突风险

## 提交清单

```
b5ff7b01 test(v2.2): define screenplay studio behavior contracts
807a2448 feat(v2.2): add screenplay units and dependency state
1fc59e3e feat(v2.2): build free-navigation screenplay studio
a2fdd81e feat(v2.2): add kk discussion and candidate diffs
dde1f19a feat(v2.2): add screenplay continuity tools
（后续）test(v2.2): add screenplay studio e2e specs
```
