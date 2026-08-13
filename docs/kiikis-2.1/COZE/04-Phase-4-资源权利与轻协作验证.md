# Phase 4 验证：资源权利与项目级轻协作

> 验证需求：`K21-RG-001..006`、`K21-CO-001..008`
> 输入：TRAE Phase 4 commit，owner/editor/reviewer/viewer/operator/普通/匿名账号

## 1. 资源出生权利

分别创建 Universe、Project、Actor、Asset：

- 创建响应和数据库 owner 等于认证用户，不接受伪造 ownerId。
- 资源与 owner/manage grant、audit、Creative Event 同时存在。
- 强制 owner grant 失败时资源整体回滚，无孤儿。
- 默认 private，不因创建自动进入社区。

## 2. 邀请、分享、使用、改编、授权

对四类资源至少执行一次：

- 邀请 editor/reviewer/viewer。
- 限时分享链接。
- 免费 use grant。
- adaptation 或 license 申请/批准。

验证 token 只显示一次、数据库只存 hash、过期/撤销/重放失败、接受后绑定账号。链接访问不得获得 owner/manage。

## 3. 权限矩阵

逐项核验 read/edit/comment/review/use/adapt/license/manage：

| 身份 | 允许 | 必须拒绝 |
|---|---|---|
| owner | 全部 | 绕过双方确认转移 |
| editor | read/edit/comment | manage owner/payment |
| reviewer | read/comment/review | edit/manage |
| viewer | read | edit/comment/manage |
| asset_operator | 明确资产操作 | Universe/owner 管理 |
| 普通登录 | public/获 grant | private 资源 |
| 匿名 | public only | private/invite 内容 |

UI 隐藏但 API 可越权仍为 P0 FAIL。

## 4. 评论、审阅与版本锚点

- 评论绑定 resource ID + version + field/frame。
- 上游新增版本后旧评论仍指向旧版本。
- reviewer approve/reject/request changes 能写审计但不能改内容。
- 删除当前内容不删除审计和评论事实。

## 5. 撤销与所有权转移

- 撤销阻止未来访问/使用，但历史 usage、provenance、event 仍存在。
- 转移需双方确认；过期 challenge 失败。
- 转移前后 owner 和旧 owner 新权限符合策略。
- 并发接受/撤销使用 CAS，无双 owner。

## 6. 自动化复跑

```bash
node --test tests/kiikis-21-resource-grants.test.mjs tests/kiikis-21-grant-migration.test.mjs tests/kiikis-21-resource-bootstrap.test.mjs tests/kiikis-21-invitations.test.mjs tests/kiikis-21-authorization-matrix.test.mjs tests/kiikis-21-collaboration.test.mjs tests/kiikis-21-ownership-transfer.test.mjs
npx playwright test e2e/resource-grants-collaboration.spec.ts --project=chromium
npx tsc --noEmit
pnpm build
```

## 7. PASS 门槛

四类资源、五类关系、七身份矩阵、撤销和转移全部通过，无孤儿或越权。任何前端可信 owner/scope、跨用户读取或历史事实被删除均为 P0 FAIL。
