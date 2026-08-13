# Phase 1 验证：数据、事件、权限与迁移地基

> 验证需求：`K21-EV-001..005`、`K21-DB-001..003`、`K21-FF-001..003`
> 输入：TRAE Phase 1 commit、migration ledger、隔离数据库、测试输出

## 1. Migration 完整性

- 对空数据库从历史 migrations 前滚到最新。
- 对 Phase 0 数据库只应用新增 migration。
- `git diff` 确认历史 migrations 未被改写。
- 重复应用有明确失败/幂等策略，不产生重复表或 policy。
- 执行 `audit_kiikis_21_foundation.sql`，保存原始零异常输出。

## 2. Creative Event 契约

正例：task progress、handoff created、grant accepted。负例：空 owner/resource、非法 visibility/version、payload 含 apiKey/secret/private storage path/full prompt。

验证：

- sequence 单调可补拉。
- `(owner_id,idempotency_key)` 并发写入只保留一个事实。
- 普通客户端不能 UPDATE/DELETE event。
- owner、协作者、匿名用户可见性符合矩阵。
- 重放相同 event 不重复执行消费者 side effect。

## 3. 事务性

在测试事务中强制 event 写入失败，业务对象也必须回滚；强制业务写入失败时不能留下孤立 event。若实现仍是两个独立 HTTP fetch，本阶段 FAIL。

## 4. 补拉与分页

- 写入至少 30 个事件，使用 limit/cursor 全量拉取，无重复/遗漏。
- 断点 sequence 后补拉顺序稳定。
- 伪造 ownerId 查询不能跨用户读取。

## 5. Feature flag 与 fixture

在 production-like env 验证：

- 未显式启用的 2.1 功能 fail closed。
- 任一 `NEXT_PUBLIC_USE_*_FIXTURE=true` 触发 release audit 失败。
- 开发 fixture 页面有显眼演示标记。
- 缺服务端配置不会静默切换 demo。

## 6. 自动化复跑

```bash
node --test tests/kiikis-21-creative-events.test.mjs tests/kiikis-21-foundation-contract.test.mjs tests/kiikis-21-events-api.test.mjs tests/kiikis-21-runtime-mode.test.mjs tests/kiikis-21-event-consumer.test.mjs
pnpm audit:kiikis21
npx tsc --noEmit
pnpm build
```

## 7. PASS 门槛

事务、幂等、RLS、敏感字段和 fixture gate 全通过；任何跨用户读取、孤立业务/event 或 production demo 降级均为 P0，结论 FAIL。
