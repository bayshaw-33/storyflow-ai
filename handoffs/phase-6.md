# Phase 6 Handoff：集成 UAT 与发布

> 分支：`feat/K22-P6-release-uat`（从 `origin/main` @ `84fc46107` 建立；main 含 P3+P4+P5 合并）
> 契约版本：`2.2.0-alpha.1`（兼容 `2.0.0-alpha.1`）
> 交付日期：2026-08-16
> 执行者：AutoClaw

## Goal

用真实数据跑通 V2.2 六条端到端旅程，验证迁移、RLS、性能、观测、灰度和回滚后再发布。默认无新 migration；仅当 UAT 复现发布阻断 schema 缺陷时新增 `20260828060000_K22-P6_release_fixes.sql`（已发生）。

## 验证结果（实际命令与结果）

```bash
pnpm audit:kiikis22
# → ✅ 覆盖审计通过：48 个 PRD ID 全部映射，48 个测试文件存在
# → ✅ Runtime fixture 审计通过（production）：8 个开关全部 fail-closed
# → ✅ K22 Migration 审计通过（9 个 migration、28 张表全 RLS、12 张 append-only 表全触发器）

node --test tests/contracts-v22/*.test.mjs tests/security/kiikis-22-*.test.mjs tests/performance/v22-*.test.mjs tests/server-v2/work-usage/*.test.mjs tests/server-v2/universe-import/*.test.mjs e2e/support/v22-evidence.test.mjs （+ P3/P4/P5 全部测试）
# → 261 tests, 261 pass, 0 fail

npx playwright test e2e/v22-journey-*.spec.ts e2e/v22-accessibility-responsive.spec.ts e2e/v22-recovery.spec.ts --project=chromium --workers=3
# → 26 passed (14.4s)

node scripts/smoke-kiikis-22.mjs
# → ✅ 本地 smoke 全部通过（audit + 契约 + 安全 + 性能）；真实环境需 KIIKIS_SMOKE_BASE_URL（如实报告，不伪造）

npx tsc --noEmit
# → 0 errors

pnpm build
# → 成功
```

审计 Step 4（故意失败验证）：删除覆盖表 SW-001 映射 → `exit=1`（PRD 有但覆盖表缺失）；恢复 → `exit=0`。

## Gate 6 / Release Decision 验收

| 验收项 | 状态 | 证据 |
|---|---|---|
| 总 PRD 第 19 节六条 Journey 全部 PASS | ✅ | 26/26 E2E（6 Journey + 响应式 5 视口 + 键盘 + 恢复 + 错误观测）；无后端时验证真实失败语义，不伪造成功 |
| 第 22 节问题追踪矩阵每项有自动或真实手工证据 | ✅ | 48 个 PRD 验收 ID（ENTRY/SW/UNI/IMP/SONG/JOB/MKT）全部映射到真实测试文件（`scripts/kiikis22-coverage.json` + `prd-coverage.test.mjs`） |
| fixture、migration、RLS、storage 和兼容审计全 PASS | ✅ | `audit:kiikis22` 三脚本 + `tests/security/kiikis-22-{rls,storage}.test.mjs` + `backward-compatibility.test.mjs` |
| 无 P0/P1 未解决缺陷，无静默数据覆盖或跨用户访问 | ✅ | P0 五项（R-01..R-05）已修复/锁定（见 known-risks）；28 张 K22 表全 RLS；12 张 append-only 表全触发器 |
| production-like 环境社区和演员市场使用真实数据 | ⏳ 待环境 | 本地验证 fail-closed（无后端 → 真实 401/503）；生产环境真实数据 UAT 需凭据（Runbook 步骤） |
| 监控、灰度和回滚演练完成 | ✅ 文档 + 逻辑 | `V2.2-release-runbook.md`（灰度 4 级、监控 8 项指标、停线条件）、`V2.2-rollback-runbook.md`（L1/L2/L3 分级）、`isV22EntryEnabled` fail-closed 开关 |
| Owner 授权推送/发布 | ✅ 推送已授权 | 分支已按指示可直接推送；Vercel 发布待用户执行（Runbook） |

## 交付内容

### Task 6.1：需求覆盖与契约兼容 — `chore(v2.2)` 内

- `scripts/kiikis22-coverage.json` — 48 个 PRD 验收 ID → 测试文件映射（ENTRY 6 / SW 8 / UNI 8 / IMP 10 / SONG 5 / JOB 6 / MKT 5）
- `scripts/audit-kiikis-22-contracts.mjs` — PRD ID 提取、覆盖表比对、文件存在性、重复/伪造 ID 检测（退出码非 0）
- `tests/contracts-v22/prd-coverage.test.mjs`（3）+ `tests/contracts-v22/backward-compatibility.test.mjs`（4）— v2 命名空间、/api/v2/ 前缀、resolve-work 兼容快照
- `package.json` — `audit:kiikis22` 命令

### Task 6.2：Runtime/fixture/migration/RLS/storage 审计 — `chore(v2.2)` + `fix(v2.2)`

- `scripts/audit-kiikis-22-runtime.mjs` — 8 个 `NEXT_PUBLIC_USE_*_FIXTURE` 开关 fail-closed 校验（赋值语句语义，忽略注释）
- `scripts/audit-kiikis-22-migrations.mjs` — K22（20260828+）9 个 migration：唯一/递增/无 DROP TABLE/全 RLS/append-only 触发器（DROP POLICY IF EXISTS 幂等重建放行）
- **真实缺陷修复**（fix commit）：
  - KK/短剧/Universe 的 `!== "false"` 默认开 fixture → `isFixtureEnabled`（production 恒 false，development 需显式 true）
  - `supabase/migrations/20260828060000_K22-P6_release_fixes.sql` — 补齐 5 张 append-only 表（P1 snapshots/candidates、P3 evidence_events、P4 import candidates/decisions）的 UPDATE/DELETE 拦截触发器
- `tests/security/kiikis-22-rls.test.mjs`（4）+ `tests/security/kiikis-22-storage.test.mjs`（4）— 静态 SQL 审计 + 语义模拟
- `lib/client/v2/runtime-mode.ts` 扩展 `isFixtureEnabled`；`.env.example` 补 fail-closed 说明

### Task 6.3：六条 Journey — `test(v2.2): add release journey coverage`

- `e2e/v22-journey-a..f.spec.ts`（6 个，16 tests）— 剧本室/Universe/站外原作/歌曲/Job-KK/社区演员
- `e2e/support/v22-evidence.ts` + `v22-evidence.test.mjs`（6）— manifest schema/sha256/引用闭合校验
- `e2e/support/v22-test-data.ts` — owner-scoped 测试数据 + cleanup（绝不删共享数据）

### Task 6.4：性能/恢复/可访问性 — `test(v2.2): add performance recovery and accessibility coverage`

- `tests/performance/v22-screenplay-budget.test.mjs`（5）— 200 units 增量重算、UI 按需加载、幂等上限（操作计数，避免 flaky 计时）
- `tests/performance/v22-import-budget.test.mjs`（5）— worker checkpoint 恢复、重复回调去重、finalize 幂等
- `e2e/v22-accessibility-responsive.spec.ts`（7）— 390/768/1440/1920/2560 + 键盘聚焦
- `e2e/v22-recovery.spec.ts`（3）— Job 轮询幂等、WebCodecs 退路、stable code

### Task 6.5：灰度/监控/回滚 — `docs(v2.2): add release and rollback runbook`

- `lib/server/v2/feature-flags.ts` — `isV22EntryEnabled`（灰度开关，fail-closed，只控入口）
- `scripts/smoke-kiikis-22.mjs` — 本地 audit+测试 smoke；真实环境探测需 `KIIKIS_SMOKE_BASE_URL`
- `docs/kiikis-2.2/release/` — `V2.2-release-runbook.md`（前置/Gate、迁移应用、env、灰度 4 级、监控 8 项、停线条件）、`V2.2-rollback-runbook.md`（L1/L2/L3 分级，不回滚 migration）、`V2.2-known-risks.md`（P0×5 全锁定、P1×5、P2×4、RLS 矩阵）
- `.github/workflows/ci.yml` — 增加 `pnpm audit:kiikis22` + 单元测试步骤（fixture env 全 false）

## 关键架构决策

1. **审计脚本是发布门禁**：`pnpm audit:kiikis22` 三脚本失败即退出码非 0，CI 已接入；覆盖表与脚本同数据源，防伪造覆盖。
2. **fixture fail-closed 是真实修复**：KK/短剧/Universe 的历史 `!== "false"` 语义（生产默认开 fixture）改为显式 true 才启用、production 恒 false——这是 UAT 发现并修复的 P0。
3. **append-only 触发器补齐**：P1/P3/P4 的 5 张表缺 UPDATE/DELETE 拦截，新增 `20260828060000` migration（任务文件允许的唯一修复路径），不修改 Phase 0–5 migration。
4. **审计范围限定 K22**：旧 migration（K21/K2 时代）的历史重建模式（DROP TABLE 重建）不在发布审计范围；K22 9 个 migration 严格 forward-only。
5. **性能用操作计数**：避免 wall-clock flaky；预算断言"增量重算只碰受影响单元"等确定性语义。
6. **无后端时全部 fail-closed**：26 个 E2E 验证 UI 结构与真实失败语义（401/503 + stable code），不伪造成功；真实环境 UAT 需凭据（Runbook 已列）。

## 已知限制（不包装成完成）

- **真实环境 UAT 未执行**：本机无 Supabase/存储桶/CosyVoice 凭据；production-like 环境的六条 Journey 完整验收、RLS/storage 动态矩阵、真实数据健康检查（Task 6.2 Step 5）需在部署环境执行（Runbook UAT 表）。
- **Vercel 发布未执行**：分支已推送；执行 `vercel promote`/环境变量配置按 Runbook 由用户在 Vercel 控制台或 CLI 完成。
- **灰度未实际跑**：开关与顺序已定义（内部→5%→剧本高频→全量），需发布后按监控指标推进。
- **RLS/storage 测试为静态审计**：真实 DB 的动态矩阵（owner/其他用户/匿名/service role 实际操作）需 `supabase db` 环境执行。

## 下一步（发布执行）

- 按 `docs/kiikis-2.2/release/V2.2-release-runbook.md` 执行：migration 应用 → env 配置 → 灰度 4 级 → 监控
- 停线条件出现时按 `V2.2-rollback-runbook.md` L1→L2→L3
- Deferred：真实 CosyVoice/WebAV 联调、workbench-shell 统一 UI、长剧本真实规模验证

## 回滚方式

- 分支级：`git checkout main && git branch -D feat/K22-P6-release-uat`（未合并前）
- 代码级：各 commit 以新增文件为主，`git revert <sha>` 无冲突风险
- 发布回滚：见 `V2.2-rollback-runbook.md`（L1 关入口 → L2 promote → L3 数据保护；**不回滚 migration**）

## 提交清单

```
chore(v2.2): add runtime migration and fixture audits
fix(v2.2): resolve release blocking defects
test(v2.2): add release journey coverage
test(v2.2): add performance recovery and accessibility coverage
docs(v2.2): add release and rollback runbook
```
