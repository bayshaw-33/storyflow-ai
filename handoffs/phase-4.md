# Phase 4 Handoff：站外原作导入 Universe

> 分支：`feat/K22-P4-universe-import`（推送前由 `autoclaw/K22-P4-universe-import` 改名，符合 pre-push 钩子只允许 `main`/`feat/*`/`fix/*`）
> 基线：`origin/main` @ `a33defdf` + Phase 3 分支（未合并，Phase 3 的 7 个 commit 已在 `feat/K22-P3-screenplay-studio`）
> 契约版本：`2.2.0-alpha.1`（兼容 `2.0.0-alpha.1`）
> 交付日期：2026-08-16
> 执行者：AutoClaw

## Goal

站外原作（完整剧本 或「世界观+角色圣经+剧情大纲」三件套）导入 Universe：上传 → 解析/分块/提取候选 → 审核 → 原子建立只读 Source Work + Universe U1。Source Work 只读不可改；修订版以 Source Version v2 追加并生成 Universe Upgrade Proposal；权利状态默认私有，权利不明确/受限时禁止公开/授权/二创，但 owner 私有可分析。

## 验证结果（实际命令与结果）

```bash
node --test tests/contracts-v22/universe-import.test.mjs tests/server-v2/universe-import/*.test.mjs tests/ui-v2/universe-import/*.test.mjs
# → 60 tests, 60 pass, 0 fail

npx playwright test e2e/v22-universe-import-review.spec.ts e2e/v22-universe-import-finalize.spec.ts --project=chromium
# → 4 passed (9.7s)（dev server 真实渲染；无后端时验证 UI 结构与 API 真实失败语义，不伪造服务成功）

npx tsc --noEmit
# → 0 errors

pnpm build
# → 成功，全部路由正常生成
```

## Gate 4 验收

| 验收项 | 状态 | 证据 |
|---|---|---|
| 上传完整剧本或三件套，审核后原子建立只读 Source Work + Universe U1 | ✅ | `finalize.test.mjs`（RPC 失败 → Universe/U1/Source Work/Evidence 零残留；重复 finalize 返回同一 U1）+ `finalize_universe_import_v22` RPC 单事务 |
| 权利声明是必填事实快照 | ✅ | Wizard 权利声明未填 → 开始提取禁用；`rights_declaration` 持久化到 session 并在 finalize 时写入 Source Version |
| 三件套缺一不可开始 | ✅ | `tripletRequirementStatus`（missing 显式列出）+ `canStartExtraction`（state=uploaded 且三件齐）+ UI 缺件提示 + 按钮禁用 |
| 扫描 PDF / 质量不足 → degraded 不硬失败 | ✅ | `extraction.test.mjs`（质量门禁 → degraded 信号）+ 状态机 `degraded→extracting` 可重试、`degraded→u1_ready` 直接复活 |
| 重复文件幂等 | ✅ | `sessions.test.mjs`（重复 hash → duplicate 不重复落盘）+ `confirmUpload` SHA-256 校验 |
| Source Work 只读，修订版 = v2 追加 + Upgrade Proposal | ✅ | `sourceWorkIsReadOnly()` 编译期契约 + `revisions.test.mjs`（v1 不覆盖、相同 hash 冲突、v2 生成 pending_review 提案、U1 指针不动） |
| 权利不明确/受限 → 禁止公开/授权/二创，owner 私有可分析 | ✅ | `finalize.test.mjs`（unclear → canPublish/canLicense/canDerivative 全 false，rightsState=private）+ finalize 路由 |

## 交付内容

### Task 4.1：契约与状态机 — `test(v2.2): define universe import state machine`

- `lib/contracts/v2/universe-import.ts` — `ImportMode`（complete_screenplay / bible_triplet）、`ImportState`（upload_draft → uploaded → extracting → review_required → ready_for_u1 → u1_ready，degraded / failed / cancelled 分支）、`SourceRole`（screenplay / world_bible / character_bible / plot_outline / supplement）、`SourceLocation`（fileId + page + [startOffset,endOffset] + sourceHash）、文件格式规则（PDF/DOCX/DOC/MD/TXT 主格式；JSON/HTML/CSV/XLSX 仅补充）、`UniverseImportContractError`
- `lib/server/v2/universe-import/state-machine.ts` — 合法转换表；`degraded→u1_ready` 复活、`cancelled` 复活、`u1_ready` 后写操作非法；模式门禁（bible_triplet 三件齐 / complete_screenplay 唯一剧本）
- `tests/contracts-v22/universe-import.test.mjs`（10）+ `tests/server-v2/universe-import/state-machine.test.mjs`（7）

### Task 4.2：持久化与上传闭环 — `feat(v2.2): persist source works and import sessions`

- `supabase/migrations/20260828040000_K22-P4_universe_import.sql` — 7 张表：sessions / source_works / source_versions / chunks / candidates / decisions / files；source_versions append-only 触发器（UPDATE/DELETE 拦截）；RLS；私有桶 `universe-source-imports/<ownerId>/<sessionId>/`；审计文件 `supabase/migrations/audits/audit_K22_P4_universe_import.sql`
- `lib/server/v2/universe-import/index.ts` — `UniverseImportSessionsService`：createSession / getSession / listSessions / cancelSession / attachFile（MIME+扩展名双校验、100MB 上限、重复 hash 幂等）/ confirmUpload（SHA-256 校验存储元数据）/ startExtraction 状态门禁
- `lib/server/v2/universe-import/storage.ts` — 私有对象路径构造
- API：`POST/GET /api/v2/universe-imports`、`POST/PATCH /api/v2/universe-imports/[sessionId]/files`、`POST /api/v2/universe-imports/[sessionId]/start`
- `tests/server-v2/universe-import/sessions.test.mjs` + `storage.test.mjs`（16 项）

### Task 4.3：解析/分块/提取 — `feat(v2.2): extract long source documents`

- fixture：`tests/fixtures/universe-import/long-screenplay.txt`（~69K 字符确定性长剧本）
- `lib/server/v2/universe-import/parsers/{text,pdf,docx}.ts` — 文本/PDF/DOCX 解析；PDF 扫描件（无可提取文本）→ degraded 信号，不假装 OCR
- `chunker.ts` — 场景边界优先 + token 预算 + 重叠、幂等 key
- `extraction.ts` — 候选带 SourceLocation、去重合并保留全部位置、质量门禁（conflict / 低置信 / 无来源标记）
- `merge-candidates.ts` — 候选合并语义
- API：`GET /api/v2/universe-imports/[sessionId]/jobs/[jobId]`（任务轮询）
- `tests/server-v2/universe-import/parsers.test.mjs` + `extraction.test.mjs`（17 项）
- 附带修复：`fix(v2.2): extend parsed block with page/section fields`（ParsedBlock 扩展字段过 tsc）

### Task 4.4：三栏审核台 — `feat(v2.2): add universe import review`

- `lib/client/v2/universe-import/types.ts` — `UNIVERSE_CREATE_ENTRIES`（从零创建 / 从现有 Work / 上传站外原作）、`tripletRequirementStatus`、`canStartExtraction`、`canBulkAccept`（conflict/低置信/无来源禁止批量）、`nextReviewState`（append-only decisions）、`sessionProgress`（resume 卡）
- `lib/client/v2/universe-import/api.ts` — 全部 API 封装，错误显式抛出（无本地假成功）
- `components/v2/universe-import/` — `UniverseImportWizard`（模式选择 → 角色上传 → 权利声明必填 → 开始提取）、`CandidateList`（分类/状态筛选 + 批量保护）、`CandidateEditor`（payload 编辑 + 接受/拒绝/合并）、`SourceViewer`（原文定位高亮）、`UniverseImportReview`（三栏审核台 + resume 进度卡）
- `app/api/v2/universe-imports/[sessionId]/decisions/route.ts` — append-only decision trail + 候选状态迁移
- `app/universes/page.tsx` — 新增「上传站外原作」入口（无 Project 也可用，`data-testid="entry-external-upload"`）+ 导入弹窗
- `app/universes/import/[sessionId]/page.tsx` — 审核页
- `tests/ui-v2/universe-import/universe-import.test.mjs`（7）+ `e2e/v22-universe-import-review.spec.ts`

### Task 4.5：原子建立 U1 与修订版 — `feat(v2.2): finalize universe import atomically`

- `lib/server/v2/universe-import/finalize.ts` — `FinalizeUniverseImportService.finalize()`（只接受 ready_for_u1；幂等重复返回同一 U1；RPC 失败零残留）+ `createSourceVersion`（append-only v2/v3，相同 hash 冲突）+ `buildUpgradeProposal`（pending_review，U1 指针不动）+ `sourceWorkIsReadOnly()` 编译期契约 + 权利派生（unclear/restricted → 私有只读）
- `app/api/v2/universe-imports/[sessionId]/finalize/route.ts` — POST 原子建立 / GET 查当前结果
- `app/api/v2/source-works/[sourceWorkId]/versions/route.ts` — 只读版本列表（view/download only，无编辑/覆盖面）
- `tests/server-v2/universe-import/finalize.test.mjs`（6）+ `revisions.test.mjs`（4）+ `e2e/v22-universe-import-finalize.spec.ts`（无后端 → 真实 401/503 失败，绝不伪造 success）

## 关键架构决策

1. **原子性在 DB 层**：finalize 走单个 Postgres RPC（`finalize_universe_import_v22`）单事务创建 Source Work / Source Version / Universe / Universe U1 / Canon 对象 / 来源关系 / Evidence；应用层不做多表补偿。
2. **Source Work 只读是编译期契约**：`sourceWorkIsReadOnly()` 显式函数 + 测试锁语义；UI 只有查看/下载，无编辑/覆盖入口。
3. **修订版 = 追加不是覆盖**：v2 永远 append；相同 manifest hash 视为冲突（重传不是修订）；U2 发布前 U1 指针不动。
4. **权利 = 事实快照不是法律裁定**：声明记录在 Source Version；派生规则（unclear/restricted → 私有）在 finalize 结果中显式返回，UI 展示禁止公开/授权/二创。
5. **mock fetcher 测真实语义**：服务层测试用 in-memory PostgREST mock（eq/is/in 过滤 + RPC 模拟含注入失败回滚），验证 owner/幂等/原子性真实行为，不用 fixture 冒充。
6. **未配置后端时 UI/API 显示真实错误**（errorBar + 401/503），不本地假造数据。
7. **批量保护**：conflict / 低置信（<0.5）/ 无来源候选不可批量接受，需逐条处理（`canBulkAccept` 测试锁住）。

## 已知限制（不包装成完成）

- **真实解析器未接第三方库**：PDF/DOCX 解析为自研轻量实现（文本层提取），扫描 PDF 明确 degraded（无 OCR）；真实文档解析质量需在真实文件上验证。
- **AI 提取未接真实模型**：候选提取与合并当前为确定性规则实现，Phase 5 model-router 接入后替换为模型增强提取。
- **migration 未在真实 Supabase 应用**：本机无 DB 服务配置；SQL 为 forward-only + IF NOT EXISTS，应用顺序 20260828030000 → 20260828031000 → 20260828040000。
- **E2E 无真实后端**：验证 UI 结构与 API 真实失败语义；带真实存储桶/DB 的全链路 E2E 需要环境。
- **long-screenplay.txt 长文真实提取验证**：fixture 为确定性生成文本，真实长篇剧本（含 PDF 排版/分页）需在环境内手工验证。
- **decisions 路由的候选状态迁移**是服务端直接 PATCH（与 review 状态机一致），但候选列表刷新走 jobs 轮询（Task 4.3 worker），worker 落库路径尚未在真实后端验证。

## 下一步（Phase 5 及以后）

- 任务文件：`docs/kiikis-2.2/AutoClaw/05-Phase-5-*.md`（如存在）
- 进入条件：Phase 4 Gate PASS（本 handoff）；建议先补真实后端环境下的 migration 应用 + 一部真实剧本的解析/提取验证
- Deferred：真实 AI provider 接入（model-router）、PDF OCR、候选提取模型增强、U2 发布流（Upgrade Proposal 审核发布）、移动端

## 回滚方式

- 分支级：`git checkout main && git branch -D feat/K22-P4-universe-import`（未合并前）
- migration 级：`20260828040000_K22-P4_universe_import.sql` 表族独立，可按 `supabase/migrations/rollback/` 惯例单独 DROP（不触碰 Phase 0-3 表）
- 代码级：八个 commit 均为新增文件为主，`git revert <sha>` 无冲突风险

## 提交清单

```
（Task 4.1）test(v2.2): define universe import state machine
（Task 4.2）feat(v2.2): persist source works and import sessions
（Task 4.3）feat(v2.2): extract long source documents
（Task 4.3 修复）fix(v2.2): extend parsed block with page/section fields
（Task 4.4）feat(v2.2): add universe import review
（Task 4.5）feat(v2.2): finalize universe import atomically
```
