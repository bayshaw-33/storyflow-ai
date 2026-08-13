# Phase 5 验证：IP 资产社区与治理

> 验证需求：`K21-CM-001..010`
> 输入：TRAE Phase 5 commit，发布者/访问者/被屏蔽用户/审核员账号

## 1. 社区边界

- Composer 只能选择真实 Work、Universe、Actor/Asset、milestone、公开 KK 内容。
- 无法创建自由文本灌水贴。
- publication 保留 source resource/version、publisher、visibility、rights summary。
- 删除/隐藏 publication 不修改 Canon 或删除源资源。

## 2. 发布与发现

依次发布 Universe、Actor、Work：

- 私有或无 publish grant 的资源失败。
- 发布成功后 feed/search/detail 一致。
- 卡片可进入源对象，并显示 owner、来源、权利和允许动作。
- 分页 3 页无重复/遗漏；并发新发布不会导致 cursor 漂移。
- 未邀请用户在 feature flag 公开前不能进入 beta feed。

## 3. 互动与通知

- follow、reaction、save 重复点击/并发只产生一个事实。
- 评论/回复、软删除、冻结按权限生效。
- 通知由 event 生成，重复 event 不重复通知。
- 取消 follow/reaction/save 后计数与事实可重建一致。

## 4. Use/Remix/License 闭环

从社区卡申请 use/adaptation/license，最终进入 Phase 4 的真实 grant 流程；不能只弹“成功”而无数据库 grant。授权后 source attribution 在新项目可见。

## 5. 举报、屏蔽、审核、申诉、恢复

完整演练：

```text
访问者举报评论/对象
→ 举报立即确认且身份不泄露
→ block 用户后 feed/互动立即隐藏
→ 审核员查看 queue 和证据
→ 隐藏 publication/冻结评论并记录理由
→ 发布者申诉
→ 审核员恢复
→ 源 Universe/Actor/Work 始终存在
```

普通用户不能访问审核队列或伪造 moderator action。

## 6. 隐私与负例

- 匿名只能访问 public publication。
- block 双方不能绕过 API 互动。
- 私有 KK 外观/成就不进入 feed。
- 举报者信息不返回被举报方。
- 管理员操作有审计，不能直接删除源资源。

## 7. 自动化复跑

```bash
node --test tests/kiikis-21-community-*.test.mjs
npx playwright test e2e/community-object-loop.spec.ts e2e/community-moderation.spec.ts --project=chromium
npx tsc --noEmit
pnpm build
```

## 8. PASS 门槛

对象社区闭环和治理闭环全部通过，beta gate 有效，无私有泄漏或源资源破坏。治理任何一环缺失、自由发帖绕过或假 grant 都是 P0/P1，结论 FAIL。
