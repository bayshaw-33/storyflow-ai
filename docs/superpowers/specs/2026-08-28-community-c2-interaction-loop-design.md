# Kiikis C2 社区互动与创作回流闭环设计

日期：2026-08-28  
基线：`main` 合并提交 `ad23e99b`  
状态：已获用户确认，待进入开发计划

## 1. 背景与问题

C0/C1 已经完成社区发现页、统一 publication 卡片、Universe 详情、搜索、分页以及真实的关注/反应/收藏动作。后端也已有评论、通知、授权和治理的基础服务，但用户侧仍缺少一条完整可用的闭环：

1. 用户能看到作品，却不能在 publication 详情页自然地评论、回复和继续回访。
2. 评论、关注、反应、使用申请等事件即使已经写入 `creative_events`，用户也没有稳定的通知入口和已读状态反馈。
3. 卡片上“继续创作”的价值没有被明确呈现。使用、改编、授权必须进入真实的 grant/marketplace 流程，不能用假成功或空跳转代替。

C2 的目标是让“发现一个真实创作对象 → 互动 → 收到反馈 → 回到源对象继续创作/使用”成为可验证的产品路径。

## 2. 目标

### 2.1 本期目标

- 建立 publication 详情页的评论与回复体验。
- 建立社区通知 API 和通知中心入口，支持单条/全部标记已读。
- 将社区卡片和详情页的继续创作动作与真实 source、grant、marketplace 能力对齐。
- 所有动作由服务端权限和 `allowedActions` 驱动；失败必须展示可理解的错误，不能静默成功。
- 用契约测试和关键 E2E 路径证明闭环可用。

### 2.2 不在本期

- 不新增自由帖、私信、群聊或通用社交小组。
- 不重做已有的举报、屏蔽、审核、申诉流程；治理能力作为现有边界继续工作，放入后续 C3 做体验完善。
- 不把社区 publication 当作 Project、Universe、Work 或 Canon 的所有权事实源。
- 不重放历史 Supabase 迁移；如 C2 确需数据库变更，只允许新增 forward migration，并单独验证生产迁移链。

## 3. 核心用户流程

### 3.1 详情页互动

`/community/[publicationId]` 继续使用真实 publication 详情和 `allowedActions`。页面新增评论区：

1. 首屏加载评论列表，按时间升序展示根评论和回复关系。
2. 登录用户可发表评论；点击“回复”后将评论锚定为 `parentCommentId`。
3. 提交按钮在请求期间禁用；客户端生成并保留 `idempotencyKey`，网络重试不会重复发评论。
4. 评论创建成功后只追加服务端返回的评论，不用本地伪造作者、时间或计数。
5. 作者可软删除自己的评论；删除后保留位置，显示“评论已删除”，不再显示正文。
6. 评论加载失败提供局部重试，不影响 publication 主体和来源对象跳转。

### 3.2 通知中心

新增社区通知入口，默认展示未读数量。通知来源包括已有的社区事件：关注、评论、反应、使用申请和审核结果。

1. 通过 `/api/v2/community/notifications` 获取当前登录用户通知；服务端从认证态注入 recipient，不接受客户端指定其他用户。
2. 通知保留 `resourceType/resourceId/linkUrl/sourceUrl`，优先跳到 publication 详情，必要时继续跳到真实源对象。
3. 点击单条通知先标记已读，再按 `linkUrl` 跳转；标记失败时保留可重试提示，不阻断查看。
4. 支持“全部标记已读”，操作幂等。
5. 未登录显示登录入口；网络错误显示明确重试状态；空列表显示真实空状态，不注入演示通知。

### 3.3 创作回流动作

详情页和卡片展示“继续创作”区域，但动作必须由真实能力决定：

- `apply_use`：调用现有使用申请/grant 入口，提交目标 Project 前要求用户选择或创建真实 Project。
- `remix`：只有源对象和当前权限明确允许衍生创作时展示；否则不显示可点击按钮，给出权利原因。
- `license`：只有存在真实 license offer 或可进入资产授权页面时展示；不得把“申请使用”伪装成授权完成。
- 其他暂未具备后端闭环的动作返回 disabled 状态和原因，不创建假记录。

动作完成后回到 publication 详情或通知中心，展示服务端返回的状态与下一步，而不是前端本地猜测。

## 4. API 与数据契约

### 4.1 评论

沿用已有接口：

- `GET /api/v2/community/publications/[id]/comments?limit=&offset=`
- `POST /api/v2/community/publications/[id]/comments`
- `DELETE /api/v2/community/comments/[id]`

C2 需要补齐并固定以下行为：

- 评论正文最多 `COMMENT_BODY_MAX`，空正文和越界返回 `validation_failed`。
- `parentCommentId` 必须属于同一 publication，否则拒绝。
- 服务端认证用户是唯一 author 来源。
- POST 需要可重复提交安全的幂等键；重复键返回同一逻辑结果，不增加计数。
- 删除使用现有软删除 RPC；投影不暴露 `deleted_by` 等审核私有字段。

### 4.2 通知

新增：

- `GET /api/v2/community/notifications?limit=&offset=&unreadOnly=`
- `POST /api/v2/community/notifications`，body 为 `{ action: "read", eventId }` 或 `{ action: "read_all" }`

响应统一包含：

```ts
{
  success: true,
  contractVersion: "kiikis.community.notification/1",
  items: CommunityNotification[],
  unreadCount: number
}
```

读状态继续写入 `storyflow_notification_reads`，不修改 append-only 的 `creative_events`。通知列表不得返回其他用户的事件。

### 4.3 回流动作

不新造第二套授权模型。C2 先梳理并接入已有的：

- publication 的 `allowedActions`；
- 真实 Work/Universe/Actor/Asset 路由；
- 资产 license offer、usage grant 相关 API；
- 现有 `creative_events` 通知链。

若某类 source 暂无可安全调用的真实入口，产品显示“暂不可用 + 原因”，并保留来源上下文。

## 5. UI 结构

### 5.1 Publication 详情页

页面分为四块：

1. 对象摘要：标题、类型、封面、创作者、发布时间。
2. 来源与权利：来源工作台、source/version、权利摘要、贡献摘要、真实来源链接。
3. 继续创作：使用/改编/授权动作，按服务端允许动作显示。
4. 社区互动：互动计数、评论树、回复输入、软删除状态。

评论区是局部交互组件，不挤压对象摘要和来源上下文；移动端先展示对象摘要和主要动作，再展示评论。

### 5.2 通知中心

通知中心可作为社区页内面板或独立入口，必须复用现有站点导航和视觉语言。最小 UI 状态：加载中、空、失败可重试、未读、已读、点击跳转中。

## 6. 安全与一致性约束

- 所有写操作继续走认证和服务端权限，不信任客户端传入的 owner、author、recipient。
- 评论、通知已读、回流申请都必须可重试且不重复产生副作用。
- block/hidden/moderation 规则继续由现有服务端约束；前端不能通过隐藏按钮绕过服务端。
- 社区隐藏只隐藏 publication，不删除源 Project、Universe、Work、Actor 或 Asset。
- 不使用 fixture、假通知、假评论、假授权结果；测试数据只存在测试环境或明确测试账号中。

## 7. 验收标准

### C2-API

- 评论列表、创建、回复、软删除均可由真实接口完成。
- 非法 parent、越权删除、空正文、超长正文均得到稳定错误码。
- 通知列表只返回当前用户事件；单条和全部已读幂等。
- notification 的 link 能回到真实 publication/source；缺失 link 时有明确降级。
- 回流动作不存在假成功；无权限或缺少 offer 时能说明原因。

### C2-UI

- publication 详情页不再只有对象说明，评论和回复可用。
- 失败只影响对应区域，并可局部重试。
- 提交期间无重复按钮点击；刷新后状态以服务端为准。
- 通知未读数、已读状态和跳转目标一致。
- 桌面和移动布局不挤压来源信息及主要动作。

### C2-验证

- 新增纯契约/路由测试，先验证失败再实现。
- 关键 E2E：账号 A 发布并打开对象，账号 B 评论/回复，账号 A 收到并阅读通知，B 从对象进入真实回流入口。
- `npx tsc --noEmit`、社区相关单测、生产构建通过。
- 不新增生产迁移则明确记录“无迁移”；若新增迁移，必须在合并后通过 Supabase CLI 应用并验证。

## 8. 交付边界

C2 完成后，交付内容必须包含：

- 设计规格与实现计划；
- API、UI、契约测试和 E2E 的变更清单；
- 真实接口验证结果和失败场景证据；
- commit SHA；
- 如有迁移，迁移文件、Supabase 应用记录和生产验证结果；
- 不自动扩展到 C3 治理体验，除非另行确认。
