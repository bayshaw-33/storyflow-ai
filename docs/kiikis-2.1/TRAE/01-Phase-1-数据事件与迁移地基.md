# Phase 1：数据、事件、权限与迁移地基

> 只执行本阶段。
> 需求：`K21-EV-001..005`、`K21-DB-001..003`、`K21-FF-001..003`
> 前置：Phase 0 COZE PASS
> 完成后交给：`COZE/01-Phase-1-数据事件与迁移验证.md`

## 1. 目标

建立 2.1 其他阶段共享的稳定事实基础：追加式 Creative Event、事务写入接口、feature flag、迁移审计、fixture 防泄漏、RLS 测试工具和观测字段。

## 2. Task 1.1：冻结领域事件契约

**Files:**

- Create: `lib/contracts/v2/creative-events.ts`
- Create: `tests/kiikis-21-creative-events.test.mjs`

### Step 1：RED

测试合法事件、非法 visibility、空 owner/resource/idempotency key、敏感 payload key 和 schema version：

```ts
const event = parseCreativeEvent({
  id: crypto.randomUUID(),
  sequence: 1,
  eventType: "task.progressed",
  schemaVersion: 1,
  actorType: "system",
  actorId: null,
  ownerId: USER_ID,
  resourceType: "project",
  resourceId: PROJECT_ID,
  taskId: TASK_ID,
  idempotencyKey: "task-1:progress:7",
  visibility: "private",
  payload: { completed: 7, total: 12, unit: "frame" },
  occurredAt: NOW,
  createdAt: NOW,
});
assert.equal(event.schemaVersion, 1);
assert.throws(() => parseCreativeEvent({ ...event, payload: { apiKey: "secret" } }), /sensitive/i);
```

### Step 2：GREEN

实现纯函数 validator 和敏感字段 denylist。禁止把完整 prompt、token、secret、storage path 写进事件。

## 3. Task 1.2：forward-only migration 与 RLS

**Files:**

- Create: `supabase/migrations/20260827000000_kiikis_21_foundation.sql`
- Create: `supabase/migrations/audits/audit_kiikis_21_foundation.sql`
- Create: `tests/kiikis-21-foundation-contract.test.mjs`

### Step 1：先写 migration contract 测试

断言新 migration：

- 创建 `storyflow_creative_events`；
- `id`、单调 `sequence`、`event_type`、`schema_version`、actor/owner/resource/task、`idempotency_key`、visibility、payload、occurred/created；
- `(owner_id, idempotency_key)` 唯一；
- events 只 INSERT/SELECT，不允许普通用户 UPDATE/DELETE；
- owner、授权协作者和 public audience 的 SELECT 边界明确；
- payload 默认 `{}`，不是 null；
- 必要的 owner/sequence、resource、task 索引；
- Realtime publication 只添加目标表，不开放无关表。

### Step 2：实现 migration

核心约束示例：

```sql
create table public.storyflow_creative_events (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity,
  event_type text not null,
  schema_version integer not null default 1 check (schema_version > 0),
  actor_type text not null check (actor_type in ('user','system')),
  actor_id uuid null references auth.users(id),
  owner_id uuid not null references auth.users(id),
  resource_type text not null,
  resource_id text not null,
  resource_version text null,
  task_id uuid null,
  idempotency_key text not null,
  visibility text not null check (visibility in ('private','collaborators','public')),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);
```

不得修改 `20260716000000_baseline.sql` 或 deferred migration。

### Step 3：数据库验证

在本地/隔离数据库执行 migration，验证重复 idempotency key、跨用户读取、更新/删除被拒绝。audit SQL 输出零条异常才算通过。

## 4. Task 1.3：事务事件写入服务

**Files:**

- Create: `lib/server/v2/events/index.ts`
- Create: `lib/server/v2/events/http.ts`
- Create: `app/api/v2/events/route.ts`
- Create: `tests/kiikis-21-events-api.test.mjs`

### Step 1：RED

覆盖：认证、owner 伪造、重复写入幂等、`afterSequence` 补拉、visibility 过滤、敏感 payload 拒绝。

### Step 2：GREEN

```ts
export async function appendCreativeEvent(input: AppendCreativeEventInput): Promise<CreativeEventV1>;
export async function listCreativeEvents(input: {
  userId: string;
  afterSequence?: number;
  resourceType?: string;
  resourceId?: string;
  limit?: number;
}): Promise<{ items: CreativeEventV1[]; nextSequence: number | null }>;
```

业务模块不得由浏览器直接 INSERT events。事件写入与业务变更通过 Postgres RPC 或同一服务端事务完成；若当前 REST 封装不能保证事务，新增窄 RPC，不接受“两次 fetch 大概率成功”。

## 5. Task 1.4：环境门禁与 fixture 防泄漏

**Files:**

- Create: `lib/server/v2/feature-flags.ts`
- Create: `lib/client/v2/runtime-mode.ts`
- Create: `scripts/audit-kiikis-21-runtime.mjs`
- Modify: `.env.example`
- Modify: `package.json`
- Create: `tests/kiikis-21-runtime-mode.test.mjs`

### Step 1：契约

```ts
type Kiikis21Flags = {
  kkRealtime: boolean;
  kkAppearance: boolean;
  resourceGrants: boolean;
  communityBeta: boolean;
  billingLifecycle: boolean;
};
```

- production/staging 未显式启用时 fail closed。
- `NEXT_PUBLIC_USE_*_FIXTURE=true` 在 production build audit 中失败。
- UI 显示 fixture 时必须有显眼的“演示数据”标记。

### Step 2：命令

新增：

```json
{
  "scripts": {
    "audit:kiikis21": "node scripts/audit-kiikis-21-runtime.mjs"
  }
}
```

## 6. Task 1.5：事件观测与消费者幂等

**Files:**

- Create: `lib/server/v2/events/consumer.ts`
- Create: `tests/kiikis-21-event-consumer.test.mjs`

实现消费者 checkpoint 或唯一消费键。相同 event ID 重放时，通知、KK 成长、社区计数和授权动作只能发生一次。

```ts
await consumeOnce({ consumer: "kk-projection", eventId, run: async () => { /* projection */ } });
```

先用并发 Promise 测试证明只有一次 side effect。

## 7. 验证

```bash
node --test tests/kiikis-21-creative-events.test.mjs tests/kiikis-21-foundation-contract.test.mjs tests/kiikis-21-events-api.test.mjs tests/kiikis-21-runtime-mode.test.mjs tests/kiikis-21-event-consumer.test.mjs
pnpm audit:kiikis21
npx tsc --noEmit
pnpm build
```

## 8. 交付证据

- migration、RLS 正反例、audit SQL 原始输出。
- 并发幂等测试输出。
- production-like 环境 fixture audit 失败/通过演示。
- 事件补拉 API 示例（去除敏感数据）。
- commit SHA、迁移应用状态和回滚说明。

## 9. 禁止扩展

- 不在本阶段实现 KK UI、社区 feed、授权 UI 或 Stripe。
- 不引入 Kafka/Redis/外部消息代理。
- 不把现有 `storyflow_task_events` 直接重命名或破坏旧消费者。
