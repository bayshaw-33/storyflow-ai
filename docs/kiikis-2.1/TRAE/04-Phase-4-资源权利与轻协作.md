# Phase 4：资源出生即具备权利与项目级轻协作

> 只执行本阶段。
> 需求：`K21-RG-001..006`、`K21-CO-001..008`
> 前置：Phase 1 COZE PASS
> 完成后交给：`COZE/04-Phase-4-资源权利与轻协作验证.md`

## 1. 目标

Universe、Project、Actor、Asset 创建后立即具备 owner、visibility、邀请、免费分享、使用、改编和授权能力。内部团队获得项目级评论、审阅和批准，不引入企业组织系统。

## 2. Task 4.1：统一 Grant 契约

**Files:**

- Create: `lib/contracts/v2/resource-grants.ts`
- Create: `tests/kiikis-21-resource-grants.test.mjs`

### RED

覆盖 4 种资源、5 类 relation、scope、pending/active/revoked/expired、期限、非法扩大 scope 和状态转换。

```ts
type GrantRelation = "collaboration" | "share" | "use" | "adaptation" | "license";
type GrantStatus = "pending" | "active" | "revoked" | "expired";
```

明确：撤销停止未来访问，不抹除历史来源和已发生使用；具体衍生物后续权利读取 grant 创建时条款快照。

## 3. Task 4.2：数据与 RLS

**Files:**

- Create: `supabase/migrations/20260827040000_kiikis_21_resource_grants.sql`
- Create: `supabase/migrations/audits/audit_kiikis_21_grants.sql`
- Create: `tests/kiikis-21-grant-migration.test.mjs`

新增统一资源 grants、邀请、协作评论/审阅、活动审计表；优先适配现有 Universe share、Actor marketplace、V2 licensing，不平行保留两套事实。

RLS 矩阵至少覆盖 owner、editor、reviewer、viewer、asset_operator、普通登录用户、匿名用户。普通用户不能改 owner、grant relation、scope 或 status。

## 4. Task 4.3：资源创建原子初始化

**Files:**

- Create: `lib/server/v2/grants/bootstrap.ts`
- Modify: Universe/Project/Actor/Asset 的实际服务端创建函数
- Create: `tests/kiikis-21-resource-bootstrap.test.mjs`

创建资源与 owner grant/audit/event 在同一事务：

```ts
await createOwnedResource({
  ownerId,
  resourceType,
  createResource,
  defaultVisibility: "private",
  idempotencyKey,
});
```

创建成功但 owner grant 失败必须整体回滚。

## 5. Task 4.4：邀请与分享

**Files:**

- Create: `lib/server/v2/grants/invitations.ts`
- Create: `app/api/v2/grants/route.ts`
- Create: `app/api/v2/invitations/[token]/route.ts`
- Create: `components/v2/grants/ResourceAccessPanel.tsx`
- Create: `tests/kiikis-21-invitations.test.mjs`

邀请 token 只返回一次，数据库存 hash；限时、可撤销、接受后绑定当前账号，拒绝跨邮箱/账号重放。分享链接只能获得明确 scope，不等于 owner。

## 6. Task 4.5：统一授权校验

**Files:**

- Create: `lib/server/v2/grants/authorize.ts`
- Create: `tests/kiikis-21-authorization-matrix.test.mjs`

```ts
await authorizeResourceAction({
  userId,
  resourceType,
  resourceId,
  action: "read" | "edit" | "comment" | "review" | "use" | "adapt" | "license" | "manage",
});
```

所有新 API 使用此入口；旧 Universe share/licensing 路由逐步适配。禁止只在 UI 隐藏按钮。

## 7. Task 4.6：轻协作

**Files:**

- Create: `app/api/v2/collaboration/comments/route.ts`
- Create: `app/api/v2/collaboration/reviews/route.ts`
- Create: `components/v2/collaboration/CommentsPanel.tsx`
- Create: `components/v2/collaboration/ReviewPanel.tsx`
- Create: `tests/kiikis-21-collaboration.test.mjs`

需求：

- `K21-CO-001` 邀请 owner/editor/reviewer/viewer/asset_operator。
- `K21-CO-002` scope 可到 Universe/Project/Episode/Asset。
- `K21-CO-003` 评论锚定 resource ID + version + 可选 field/frame ID。
- `K21-CO-004` reviewer 可 approve/reject/request_changes，不能改内容。
- `K21-CO-005` editor 可改内容，不能管理 owner 或付款。
- `K21-CO-006` 活动写 Creative Event 和审计。
- `K21-CO-007` 删除当前内容不删除历史评论事实。
- `K21-CO-008` 不创建 organization/department/seat。

## 8. Task 4.7：所有权转移与撤销

**Files:**

- Create: `lib/server/v2/grants/ownership-transfer.ts`
- Create: `tests/kiikis-21-ownership-transfer.test.mjs`

所有权转移使用双方确认 challenge、过期时间和 CAS。转移后旧 owner 权限按明确策略变化；审计保存前后 owner。撤销 grant 不更新历史 event、provenance 和 usage rows。

## 9. E2E 与验证

**Files:**

- Create: `e2e/resource-grants-collaboration.spec.ts`

```bash
node --test tests/kiikis-21-resource-grants.test.mjs tests/kiikis-21-grant-migration.test.mjs tests/kiikis-21-resource-bootstrap.test.mjs tests/kiikis-21-invitations.test.mjs tests/kiikis-21-authorization-matrix.test.mjs tests/kiikis-21-collaboration.test.mjs tests/kiikis-21-ownership-transfer.test.mjs
npx playwright test e2e/resource-grants-collaboration.spec.ts --project=chromium
npx tsc --noEmit
pnpm build
```

## 10. 交付证据

- 四类资源创建后立即分享/邀请/使用的录像。
- 7 种角色/身份的 RLS 正反例矩阵。
- 邀请重放、过期、撤销和跨账号失败证据。
- 撤销后历史 provenance/usage 仍存在。
- commit SHA、migration 与 audit SQL 输出。

## 11. 禁止扩展

- 不做企业组织、部门、座席、SSO、公共邀请目录。
- 不用公开 URL 代替 grant。
- 不让客户端提交 ownerId 作为可信事实。
