# Phase 7 验证：全链 UAT 与发布决策

> 验证范围：Gate 0–5
> 输入：TRAE Phase 7 release candidate、staging/prod candidate、所有阶段 PASS 报告

## 1. 证据链完整性

- RC commit 与部署 commit 一致。
- Phase 0–6 每阶段有独立 commit、TRAE 交接和 COZE PASS。
- migration ledger 与实际数据库一致，历史 migration 未改写。
- release audit 无 fixture、缺 env、公开密钥、Community 占位或旧 companions redirect。

## 2. 独立重跑黄金路径

COZE 使用新的测试对象，不复用 TRAE 演示数据：

1. 创建 Universe/Project/Actor/Asset，邀请第二账号。
2. 选取真实剧本完成 handoff 和至少 4/6/9/12 各一场。
3. 编辑锁定，制造上游 diff/CAS 冲突并恢复。
4. 导出 Markdown/JSON/CSV/生产包。
5. KK 观察任务、断线、失败、待确认和结果跳转。
6. 发布对象，第二账号关注/评论/收藏/申请使用。
7. 执行举报/block/隐藏/申诉/恢复。
8. Stripe test 订阅、取消、退款；核对 entitlement。

任何一步依赖手工改数据库或隐藏开关，记 FAIL。

## 3. Gate 复核

### Gate 0

6 档布局、项目卡、Dashboard 任务、任务中心详情无压缩、无 404、无无响应。

### Gate 1

内部团队六集真实批次完成，格式负责人书面确认可直接生产，无 P0/P1 数据覆盖。

### Gate 2

KK production-like fixture false，p95 ≤3 秒，重连 ≤10 秒，任务/进度真实且幂等。

### Gate 3

四类资源创建即具备权利；七身份矩阵、撤销、转移通过。

### Gate 4

对象社区互动与完整治理闭环通过；隐藏不破坏源资源。

### Gate 5

Stripe test 生命周期、内部真实小额订阅验证、观测与运营手册齐全；权益只来自 webhook。

## 4. 安全与恢复抽检

- 跨账号访问、伪造 owner/scope/plan/moderator。
- Realtime 断线、event 重放、任务重复 retry。
- webhook 错签、重放、乱序。
- 邀请 token 泄漏/重放/过期。
- Community block 绕过和私有 KK 泄漏。
- feature flag 关闭与回滚演练。

## 5. 全量命令

```bash
pnpm audit:kiikis21
node scripts/audit-kiikis-21-release.mjs
npx tsc --noEmit
pnpm build
pnpm test:unit
node --test tests/ui-v2/**/*.test.mjs tests/kiikis-21-*.test.mjs
npx playwright test --project=chromium
```

既存测试失败必须用 release base 同命令对比；RC 新增失败一律阻断。

## 6. 发布结论

输出 Gate 0–5 逐项 PASS/FAIL。只有全部 PASS 才可：

- 宣布 Kiikis 2.1 全面上线；
- 移除 Community 公开限制；
- 对外开放个人创作者注册/订阅入口。

任一 Gate FAIL：维持 internal/invite 状态，执行回滚或前滚修复，不对外宣称完成。
