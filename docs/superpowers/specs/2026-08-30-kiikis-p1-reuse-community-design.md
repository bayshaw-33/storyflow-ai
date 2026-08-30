# Kiikis P1：Universe 二次创作与社区真实复用设计

## 目标

在不改动现有制作工作台框架、阶段导航、栏宽和布局 CSS 的前提下，完成三个 P1 闭环：

1. Work 可以保留自己的 Universe 局部改写，并由用户明确提交为 Canon Proposal；
2. 社区只展示有真实权利依据的复用入口，并通过现有 Grant、License Offer 和 Work Usage Link 执行；
3. 社区个人内容、评论和通知不再固定只取首批数据，关键复用链路提供中英双语。

P2 通用节点画布不在本轮范围内。

## 不可变边界

- 不修改 `ProductionWorkbench.module.css`、`WhiteModelPrevis.module.css`、`workbench-shell.module.css` 和 `app/globals.css`。
- 不增加制作工作台顶级阶段、常驻侧栏或新列。
- 不让 Work 局部改写直接覆盖 Universe Canon。
- 不用 fixture、假 publication、假 grant 或仅前端成功态冒充复用完成。
- 不为没有真实授权路径的内容显示“申请使用”“改编”或“授权”可用按钮。

## P1-1 Work Local Overlay → Canon Proposal

### 数据与权限

复用现有：

- `storyflow_work_inheritance_manifests`：确认 Work 当前绑定的 Universe；
- `storyflow_work_local_states`：保存 Work 私有 patch，使用 `revision` 做 CAS；
- `storyflow_change_proposals` 与 `create_change_proposal`：提交 Canon 候选。

不新增本地覆盖表。

服务端只允许 Work owner：

- 列出本 Work 的 active local states；
- 为继承快照中真实存在的对象创建或更新 patch；
- 以 `expectedRevision` 更新，版本不一致返回 409；
- 将指定 local state 提交为 Proposal。

提交 Proposal 只创建 `pending_review` 候选，不自动 accept，不直接改 Canon。幂等键由 `localStateId + revision` 固定生成，同一 revision 重试不会重复创建。

### UI

复用现有 Universe 社区页的“世界对象 / 本地覆盖”区域：

- owner 可在现有对象卡片上打开轻量编辑弹层；
- patch 第一版只开放“本 Work 的改写说明”，保存为结构化 `{ note }`，不暴露任意 JSON；
- active overlay 显示 Work、对象、revision 和“提交为 Canon 候选”；
- 提交前明确确认“不会直接修改 Canon”；
- 成功后显示 Proposal ID，继续由现有 Universe Inbox 审核。

这不会改变制作工作台布局。

## P1-2 社区真实授权与复用

### 权利能力解析

社区投影新增服务端计算的 `reuseCapability`，只允许以下状态：

- `owned`：viewer 是源资源 owner；
- `granted`：viewer 对源 Work/资源存在 active `use`、`adaptation` 或 `collaboration` grant；
- `offer`：asset 存在 active License Offer；
- `none`：没有真实依据。

`computeAllowedActions` 不再对所有登录用户无条件加入 `apply_use`。客户端不自行推断权利。

### 执行动作

- Work：`owned` 或 `granted` 时，用户选择自己的目标 Work，服务端调用现有 `WorkUsageService.createLink`；非 owner 必须带 active Grant，最终产生真实 `storyflow_work_usage_links`。
- Asset：只有 active License Offer 时进入现有 Marketplace 授权页；后续仍由已有 Usage Grant / invoke RPC 复制资产。
- Universe：从 Universe 创建新 Work 继续走现有 `startProject + bind`，不伪造授权。
- Actor：只有真实 grant 或其既有市场授权入口可用时开放；否则显示明确不可用原因。

所有动作由服务端再次校验 viewer、source、version、target 和 grant。卡片上的权利摘要仅用于解释，不能作为授权依据。

## P1-3 真实分页与中英双语

### 分页

- 公开 feed/search 继续使用现有 `(created_at, id)` 稳定 cursor；
- `following` 与 `saved` 改为服务端个人 feed cursor，不再一次取 100 条 publication + 200 条关系后在浏览器过滤；
- 评论和通知提供“加载更多”，每次只追加下一页，并保持已加载内容；
- 切换分区或搜索条件时清空旧 cursor，重复 ID 去重。

个人 feed 的数据库查询必须只返回真实 active publication，并按 Follow/Bookmark 关系过滤。

### 双语范围

只覆盖本轮关键链路：

- Universe 二次作品创建、本地覆盖、提交 Canon Proposal；
- 社区复用能力、授权原因、目标 Work 选择与执行结果；
- following/saved、评论、通知的加载、空、失败、重试与加载更多。

统一使用现有 `useI18n`；不为翻译重排页面结构。

## 验收

1. Work owner 可以创建/更新 local overlay；旧 revision 更新返回 409。
2. local overlay 提交后只新增 pending Proposal，Canon 未直接变化；同 revision 重试幂等。
3. 无权用户看不到可用的复用按钮；伪造客户端 action 或 grantId 仍被服务端拒绝。
4. 有 active Grant 的用户可创建真实 Work Usage Link；重复操作幂等。
5. Asset 没有 active Offer 时授权按钮不可用，有 Offer 时进入真实 Marketplace 路径。
6. following/saved 不再使用固定 100/200 条客户端拼接；连续加载无重复、无漏页。
7. 评论与通知可继续加载下一页。
8. 中文和英文下关键状态、动作、错误均可理解。
9. P0 回归、TypeScript、生产构建通过；四个冻结布局文件与 `origin/main` 字节一致。

