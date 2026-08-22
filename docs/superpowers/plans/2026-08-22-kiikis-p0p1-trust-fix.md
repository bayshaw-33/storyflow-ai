# KIIKIS P0/P1 线上可信度修复 — 实施计划

> **For agentic workers:** 本计划按 PRD（`/Users/kiikis000/Downloads/KIIKIS_P0_P1_Fix_PRD_v1.0.md`）切片顺序执行。每个切片走 Gate B：RED 测试 → 单一根因修复 → focused 测试 + `npx tsc --noEmit` + 必要时 `pnpm build` → 独立 commit → `docs/DEV_HANDOFF_LOG.md` 记录。

**Goal:** 消除线上"无法创作、数据打不开、错误伪装成成功"的 P0 问题，修复持续制造脏数据/降低信任的 P1 问题。

**Architecture:** Next.js 15 App Router + Supabase（PostgREST）。认证为 Bearer-only `authenticateRequest`（lib/supabase/server.ts:42），客户端 session 存 localStorage。按 PRD 边界：不引入三栏编辑器、不移除门禁以外的数据模型、历史对象 append-only、migration forward-only。

**Tech Stack:** TypeScript, node:test（tests/*.test.mjs 静态源码断言 + mock fetcher 服务测试）, Playwright（不在此会话强制跑）。

## Global Constraints（PRD §2 摘要）

- 禁止三栏剧本编辑器/永久右栏/第二套工作台事实源。
- 剧本五节点自由进入：不得用禁用按钮/路由拦截/服务端门禁阻止进入。
- 聊一聊只 append 消息；生成修改方案必须走 Candidate；只有采用才建版本。
- 版本/Candidate/Conversation/Evidence append-only；禁止原地 UPDATE 历史。
- 不删除/重命名/合并现有 Skills、Prompts、模型路由、规则、API、Schema、历史 migration。
- 禁止 fixture/演示数据/假进度/HTTP 200 掩盖失败。
- migration forward-only、幂等；本会话不做生产 schema/data 写入。
- 生产库 `vgcafbzksizlwmylphzu`，staging `cwpyolxitkcpitqizgtq`。
- 不把密码/token/私有正文写入代码/日志/提交。

## 根因清单（勘察结论，base = origin/main b3ba9c1a）

| 切片 | 根因 | 关键位置 |
|---|---|---|
| P0-01 | ①KK profile 错误映射把认证错伪装 503；②客户端无 401→refresh→retry（除 screenplay-studio）；③storyboard-chat 等 catch-all 把基础设施故障映射 401"请先登录"；④客户端 POST /api/v2/kk 但路由无 POST；⑤首用户 406 判定失效（serviceFetch 不带 .status）；⑥DiscoveryFeed 无 Authorization 头调 /api/v2/kk | lib/server/v2/kk/http.ts:9-29; lib/client/v2/kk/api.ts:49-53,88-97,343-381; app/api/production/storyboard-chat/route.ts:34-39; lib/server/v2/kk/profile.ts:82-88; lib/supabase/server.ts:395-398; components/v2/community/DiscoveryFeed.tsx:45 |
| P0-02 | ①Dashboard `USE_FIXTURE=true` 渲染不存在项目；②helpers 伪造 unitId `project-<id>` → verify-entry 硬门禁拦截整个工作台；③verify-entry 失败即整页阻断（fail-closed）；④resolve-work 无 Work 时 404 → 遗留入口 catch 全部丢 projectId 重定向 new-v2 | lib/client/v2/dashboard/api.ts:13; lib/client/v2/project-library/helpers.ts:81; components/production/ProductionWorkbench.tsx:365-406,1454-1493; app/api/v2/project-start/resolve-work/route.ts:44-63; app/script-workbench/page.tsx:19-21 |
| P0-03 | UniverseWorkbenchClient 传 null accessToken → 适配器客户端即抛 UNAUTHENTICATED；applyInboxAction/bindWorkToUniverse 无认证头 | components/v2/universe/UniverseWorkbenchClient.tsx:90; lib/client/v2/universe/api.ts:291-296,613-654,792-810 |
| P0-04 | 标题编辑只进本地 state；保存只 POST 正文；保存后 getUnit 刷新回滚标题；标题改动不标记 unsaved | components/v2/screenplay-studio/ScreenplayStudio.tsx:329-358 |
| P0-05 | storyflow_exports 无 updated_at/completed_at（仅存在于未应用 draft）；select/PATCH 都在用；jobsErrorResponse 泄露原始 SQL；classifyServiceError 未接线；completed 无进度事实时伪造 1/1 | lib/server/v2/jobs/index.ts:49-50,86,112,228,247; lib/server/v2/jobs/http.ts:4-8; lib/server/v2/service-errors.ts:63-153 |
| P0-06 | 模块卡 onClick 立即 startProject（默认标题"未命名X"、每次点击新幂等键），无确认步骤 | components/v2/project-start/ProjectStartFlow.tsx:101-140,195-201 |
| P1-01 | 进度只认 legacy 向导字段（V2 项目恒 null/0%）；STATUS_LABELS.ready="已完成" 与"暂无可计算进度"并存；archived 被 normalize 成 draft | lib/client/v2/project-library/helpers.ts:14-56,61-66; lib/server/v2/project-library/index.ts:145-159 |
| P1-02 | 版本抽屉直接打印 currentVersionId UUID；GET /api/v2/works/[workId]/versions 存在但 UI 未消费（唯一客户端是死代码且无认证） | ScreenplayStudio.tsx:630-637; lib/client/v2/work-history/api.ts:111-115 |
| P1-03 | 全局 KK 状态条永久遮挡 + 登录文案不一致（随 P0-01 修复收尾） | 待定位（KkRuntimeProvider/状态条组件） |
| P1-04 | marketplace USE_FIXTURE 默认 ON（`!== "false"`）；PublishFlowClient 无条件 fixture；个人演员库注入 platform 演员 + 无名字去重 | lib/client/v2/marketplace/api.ts:64-66; components/v2/marketplace/PublishFlowClient.tsx:73; lib/supabase/actors.ts:130-155 |
| P1-05 | song-workbench 仍用 songDevelopmentNotes 单串（24k 截断），重开压缩成一条 assistant 消息；SongSessionLedger 已写好但未接线 | app/song-workbench/page.tsx:819-843,981-1031,2544+; lib/client/v2/song-workbench/session.ts |
| P1-06 | 遗留入口 resolve 失败 → router.replace("/projects/new-v2") 丢 projectId | app/script-workbench/page.tsx:21 等 5 处 |

## 任务切片

### Task 0 (Gate A)：契约测试基线
- 新建 `tests/contracts-v22/p0p1-trust-contracts.test.mjs`：静态源码断言 + 服务级断言，覆盖 PRD Gate A.4 七个事实。当前为 bug 的断言 RED（universe token、标题持久化、jobs 列、创建确认、入口不丢 projectId），已成立的行为锁定 GREEN。
- 记录基线：base commit b3ba9c1a、脏文件 reports/2026-08-16-screenplay-production-hotfix.md（24 行追加，保留不动）。

### Task 1 (P0-05)：任务中心 schema 对齐【先做：最小、隔离】
1. RED：tests/server-v2/jobs/jobs.test.mjs 增加断言——exports select 不得含 updated_at/completed_at；PATCH 不得写 completed_at；errorResponse 不得含 PGRST 原文。
2. 修复 `lib/server/v2/jobs/index.ts`：select 移除两列（时间用 created_at）；PATCH 移除 completed_at 写入（exports 行状态语义保留 status）。
3. `lib/server/v2/jobs/http.ts` 接线 `classifyServiceError`：schema 错误 → 稳定 code `schema_not_deployed`/`service_unavailable`，中文文案，request id，不泄露 SQL。
4. 进度：`completed` 无 metadata 计数时不再伪造 1/1（返回 null → UI 显示无进度）。storyflow_generation_jobs 的 completed_at 真实存在，保留。
5. 检查 `app/job-center/[jobId]/page.tsx:79` 三元优先级 bug 一并修复（属于同一切片的错误显示）。
- 已知风险记录：app/api/exports/request|status|download 写 14 个 draft-only 列（超出 P0-05 范围，写入 DEV_HANDOFF_LOG 待专项）。

### Task 2 (P0-01)：KK 对话、认证与真实错误
1. 服务端错误分类：`lib/server/v2/kk/http.ts` 认证错 → 401 + code（unauthenticated/invalid_token），配置缺失 → 503 configuration_missing，其余 503 + request id。
2. `app/api/production/storyboard-chat/route.ts`（及同模式 catch-all 只修此切片涉及的 KK 对话面）：区分 MISSING_SUPABASE_SERVER_CONFIG/网络故障（503）与 token 缺失/无效（401）。
3. `lib/supabase/server.ts` serviceFetch 抛错带 `.status`（解析 SUPABASE_SERVICE_ERROR:NNN）→ 修复 kk/profile.ts:82 首用户 406 自建 profile 路径。
4. `app/api/v2/kk/route.ts` 增加 POST handler（action: list/update_settings），替换客户端死端点。
5. 客户端：`lib/client/v2/kk/api.ts` 增加 401 → refreshSession → 重试一次（对齐 screenplay-studio auth 模式）；buildHeaders 保持 Bearer。
6. `components/v2/community/DiscoveryFeed.tsx:45` 改用带认证的 kk 客户端调用。
7. 失败保留输入/消息：检查 KkScreenplayRoom 失败路径不清空 draft（有测试锁定）。

### Task 3 (P0-03)：Universe 认证一致
1. `UniverseWorkbenchClient.tsx`：挂载时 getSession + onAuthStateChange → 传真实 token 给 fetchUniverseBundle（对齐列表页模式）。
2. `lib/client/v2/universe/api.ts` applyInboxAction / bindWorkToUniverse：走共享认证 fetch（Bearer）。
3. 服务端 universe bundle 路由：权限拒绝(403 permission_denied) vs 未登录(401)分开返回稳定 code。
4. 修正 tests/ui-v2/universe/api-adapter.test.mjs 中锁定 null→UNAUTHENTICATED 的断言（行为保留但新增带 token 用例）。

### Task 4 (P0-04)：标题+正文原子保存
1. `ScreenplayStudio.tsx`：handleTitleChange → 标记 unsaved；saveActiveUnit → 若标题脏先 PATCH updateUnitIdentity（失败则整体失败、保留本地），成功后 POST saveUnitContent；成功后一次性 getUnit 刷新。
2. 保存失败：保留本地 title+content，显示失败状态 + request id，提供重试。
3. 保存状态机：未保存/保存中/已保存/失败（复用 unsaved-guard 文案）。
4. 服务端 `saveUnitContent` 3 步非事务：将"版本插入+指针 PATCH"合并为 CAS 指针更新失败时返回 409（已有），孤立版本风险记录（无事务能力下的最小语义：失败不报成功）。

### Task 5 (P0-02)：路由与自由进入
1. `lib/client/v2/dashboard/api.ts` USE_FIXTURE 默认 false（环境变量显式开）。
2. `lib/client/v2/project-library/helpers.ts:81`：不再伪造 unitId；无 sourceUnitId 时不带 unitId 进 /production。
3. `ProductionWorkbench.tsx` verify-entry 门禁：从整页阻断改为非阻塞警示条（可忽略、可继续），校验失败/异常不拦进入；文案改"该集未定稿（可继续制作，下游可能需要重生成）"。
4. `resolve-work`：项目存在但无 Work → 服务端调用 ensure_project_stage_work（script）自动补建（幂等）→ 返回可操作 work；项目行不存在 → 410 `migration_issue`（可追踪），不再 404。
5. project-library `art-<id>` 伪造 id 修正：art 行带真实 project_id。

### Task 6 (P0-06)：确认式创建
1. `ProjectStartFlow.tsx`：onClick 打开确认步（项目名输入 placeholder=默认名、起始节点=所选模块、可选 Universe 选择）；只有确认才调用 startProject；取消/关闭/返回零副作用。
2. 幂等键：确认提交生成一次，失败重试复用同一键。
3. 服务端 route：保留现有幂等（不放宽）；缺 header 时改为 400 要求幂等键（检查现有调用方后再定，若仅此客户端调用则收紧）。
4. RED 测试：源码断言 onClick 不直接调用 startProject；存在确认 UI。

### Task 7 (P1-06)：遗留入口不丢上下文
1. 5 个遗留入口的 `.catch(() => router.replace("/projects/new-v2"))` 改为：停留本页显示错误说明（可重试、可回项目库），URL 保留 projectId。
2. e2e/静态断言：入口 catch 不再重定向 new-v2。

### Task 8 (P1-01)：真实进度与状态整理
1. `STATUS_LABELS.ready` → "可进入制作"；archived 保留映射"已归档"（normalizeStatus 不再把 archived 压成 draft）。
2. `getProjectProgress`：script/creation 项目若无 legacy 字段但服务端提供 unit 统计（新增 project-library 行字段 screenplayProgress = finalized/total），有事实才返回数字，否则 null → "暂无可计算进度"；0% 不再同时显示"已完成"徽标。
3. 重命名（如已缺）+ 归档/取消归档 action（status 字段软更新，不删任何行）。
4. 空壳项目"候选清理"标记：列表内标识"疑似空项目（无 Work/无版本/无对话）"，只标记不删除。

### Task 9 (P1-02)：版本面板与恢复
1. `ScreenplayStudio.tsx` 版本抽屉：调用 GET /api/v2/works/[workId]/versions（带认证），展示 序号/kind/创建时间/来源/内容摘要（hash 前 8 位 + 字数），当前/定稿指针高亮。
2. 恢复动作：POST /api/v2/works/[workId]/versions/[versionId]/restore → append_work_version(source=restore, parent=当前)（若无路由则新增，append-only 语义）。
3. 不再显示裸 UUID。

### Task 10 (P1-03)：全局 KK 状态降噪
1. 定位全局状态条；仅在受影响能力实际不可用时显示；附最近成功时间 + 重试按钮；登录文案统一（认证 OK 时不显示"请先登录"类文案）。

### Task 11 (P1-04)：真实 Feed
1. marketplace USE_FIXTURE 默认 false（`=== "true"` 才开）；PublishFlowClient 走真实 API（fixture 仅环境显式）。
2. 演员库：个人列表仅 owner（platform 演员只在市场区）；同名去重（按 name+owner 保留最新，显示计数）。
3. 空态/错误态替换任何 demo 兜底。

### Task 12 (P1-05)：歌曲会话恢复
1. song-workbench 接线 SongSessionLedger：发送→appendConversationMessage；重开→ledger.restore() 按序恢复真实消息；songDevelopmentNotes 降级为派生展示（deriveDevelopmentSummary），legacy notes 仅导入一次。
2. 移除 24k 截断对事实源的影响（截断只允许存在于派生摘要）。

### Task 13：收尾
1. 全量 `node --test tests/contracts-v22/*.test.mjs` + 受影响子集 + `npx tsc --noEmit` + `pnpm build`。
2. `git diff --check`；无敏感信息复查。
3. DEV_HANDOFF_LOG 汇总 + 空壳项目候选清理报告（reports/，仅关联检查无删除）。
4. 合入 main 由用户决定；本会话产出分支 fix/K22-p0p1-trust。

## 执行顺序调整说明

PRD Gate B 要求切片顺序执行、禁止跨切片顺手重构。Task 1（P0-05）先行因其完全隔离（jobs 模块），可最快建立"RED→修复→验证→提交"节奏；其余按 PRD P0 编号顺序。
