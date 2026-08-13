# KIIKIS 2.1 总 PRD

> 版本：v1.0
> 日期：2026-08-13
> 状态：已批准设计，待分阶段实施与验证
> 首批真实用户：Kiikis 自有创作团队
> 长期用户：个人创作者（To C）
> 执行：TRAE
> 独立验证：COZE

## 0. 文档目的

本 PRD 定义 Kiikis 2.1 的完整产品边界、核心契约、阶段依赖和上线门槛。它不是单个开发任务。实现与验证必须分别使用同目录下 `TRAE/` 和 `COZE/` 的阶段文件。

需求优先级：

- `P0`：阻断核心旅程、数据安全、权限、支付或发布；未完成不得进入下一阶段。
- `P1`：2.1 对外承诺所必需；必须在 Phase 7 前完成。
- `P2`：改善体验但不阻断 2.1；只能在不影响 P0/P1 时实施。

## 1. 产品定义

### 1.1 一句话定位

Kiikis 是由 KK 协助运行、以 Universe 和 Canon 为根、让个人创作者持续创建、连接、分享、使用和演化 AIGC 世界与 IP 资产的 To C 平台。

### 1.2 2.1 版本主题

> 把真实剧本生产、持续 AI 交互、资源权利与 IP 社区连接成同一条可验证的 AIGC 元宇宙基础链。

### 1.3 核心主链

```text
创建个人资源
→ 立即拥有/邀请/分享/授权
→ 结构化剧本定稿
→ 不可变导演交接
→ 动态 4/6/9/12 宫格分镜
→ 生产结果与确定性导出
→ KK 实时展示任务、错误、确认与结果
→ 发布真实 Universe / Actor / Work / 生产里程碑
→ 发现、关注、评论、收藏、使用、改编、授权
→ 归因与里程碑回流持续世界和 KK
```

### 1.4 AIGC 元宇宙的含义

2.1 不建设孤立的 3D 大厅。元宇宙首先是持续存在、相互连接且有权利边界的资源网络：User、KK、Universe、Canon、Actor、Project、Episode、Scene、Shot、Work、Asset、版本、邀请、授权、使用和衍生关系。未来 3D 空间和 AI 角色生活必须读取同一事实图谱。

## 2. 目标用户与使用场景

### 2.1 内部创作团队

- 用真实六集批次验证剧本、分镜、资产、审阅、任务恢复和导出。
- 在项目、单集和资产范围内邀请成员、分派角色、评论、审核和批准。
- 产生第一批可公开或邀请访问的 Universe、Actor、Work 和生产日志。

### 2.2 个人创作者

- 无需理解企业组织结构即可从想法、剧本或项目开始。
- 个人账号始终是所有权根；协作只附着在具体资源上。
- 通过 KK 理解下一步、任务进度、失败原因和可执行动作。
- 选择公开、邀请、免费分享、使用或授权自己的资源。

### 2.3 社区访问者与潜在使用者

- 发现真实创作对象，而不是无关生活内容。
- 进入 Universe、Actor 或 Work，理解来源、权利和允许的下一步。
- 关注、反应、收藏、评论、申请使用、改编或授权。

## 3. 2.1 目标与非目标

### 3.1 必须达成

| ID | 目标 | 优先级 |
|---|---|---|
| K21-G-001 | 修复工作台视觉压缩与项目/任务不可达问题 | P0 |
| K21-G-002 | 剧本到动态宫格分镜无人工复制粘贴 | P0 |
| K21-G-003 | KK 成为全站真实任务交互层，而非静态装饰 | P0 |
| K21-G-004 | 资源从创建时即可邀请、分享、使用和授权 | P0 |
| K21-G-005 | 上线可治理的 IP 资产社区 | P1 |
| K21-G-006 | 支持个人所有权根上的项目级轻协作 | P1 |
| K21-G-007 | Stripe 订阅进入真实 webhook 生命周期 | P0 |
| K21-G-008 | 免费、邀请制、人工审核的交易内测可审计 | P1 |
| K21-G-009 | 建立未来 KK 皮肤/抽卡经济兼容的权益账本 | P1 |

### 3.2 明确不做

- 通用自由发帖、无关生活内容、私信、群聊、通用群组。
- 企业组织层级、部门、席位采购、SSO、员工账号所有权和复杂算力预算。
- 公共自动分账、提现、二级交易。
- 付费概率抽卡、保底、宠物货币和可交易稀缺皮肤。
- 为追求数量接入大量不稳定模型。
- 与现有 Universe/Actor/权利图谱分离的 3D 大厅或虚拟土地。

## 4. Phase 0：P0 产品基线

### 4.1 工作台布局

| ID | 需求 | 验收摘要 |
|---|---|---|
| K21-P0-UI-001 | Dashboard/工作台主内容必须与全局侧栏共享同一安全区契约 | 769px 以上不被侧栏遮挡，768px 以下侧栏折叠且内容恢复全宽 |
| K21-P0-UI-002 | “继续创作”等列表链接必须占满卡片可用宽度 | 不再出现只有窄竖条有背景/边框、文字溢出链接盒的现象 |
| K21-P0-UI-003 | 桌面与移动响应式不得产生水平滚动或内容裁切 | 390、768、1024、1440、1920、2560 视口通过 |
| K21-P0-UI-004 | 键盘焦点、hover、触摸热区与视觉卡片一致 | 整张卡可点击，焦点轮廓完整可见 |

现有事实：`components/v2/dashboard/dashboard.module.css` 的 `.row` 没有建立块级满宽盒；根布局始终挂载 `GlobalSideNav`，但 Dashboard/任务中心未统一使用 `--workspace-nav-offset`。TRAE 必须以浏览器实际盒模型确认根因，不能只扩大 padding。

### 4.2 项目与任务跳转

| ID | 需求 | 验收摘要 |
|---|---|---|
| K21-P0-NAV-001 | “继续创作”卡进入正确项目和工作台 | URL 含正确 `projectId`，页面实际加载该项目 |
| K21-P0-NAV-002 | Dashboard 运行中任务卡直接进入所属项目目标 | 不再只跳到 `/job-center` |
| K21-P0-NAV-003 | 全局任务中心“查看详情”始终有明确结果 | 有目标则跳转；无合法目标则禁用并解释，禁止点击无响应 |
| K21-P0-NAV-004 | 全站使用单一任务/项目目标解析器 | Dashboard 与 Task Center 不再各自硬编码 |
| K21-P0-NAV-005 | 内部详情路由、外部结果 URL 和无效旧路由分流 | 外部 URL 只用于“查看结果”，同源应用路由规范化，无开放重定向 |
| K21-P0-NAV-006 | fixture 中每个可点击任务必须指向存在的本地路由 | 演示数据不得把用户送到 404 |

目标解析契约：

```ts
export type NavigableTaskTarget = {
  projectId?: string | null;
  sourceUnitId?: string | null;
  workbenchType?: string | null;
  resultUrl?: string | null;
};

export function resolveProjectTarget(target: NavigableTaskTarget): string | null;
export function resolveResultTarget(target: NavigableTaskTarget): string | null;
```

规则：详情优先进入可信同源业务路由，否则按 `projectId + workbenchType` 回退；外部 CDN/Provider URL 不得作为详情路由；没有 `projectId`、`sourceUnitId` 或合法结果时不得伪造目标。

## 5. 剧本到动态宫格分镜黄金路径

### 5.1 导演交接

| ID | 需求 | 优先级 |
|---|---|---|
| K21-HO-001 | 剧本“定稿并进入分镜”生成不可变快照 `kiikis.screenplay-handoff/1` | P0 |
| K21-HO-002 | 稳定记录 Project、Universe、Episode、Scene、Actor/Character、Location、Prop 和 Canon 版本 | P0 |
| K21-HO-003 | 上游修改创建新 handoff，不静默覆盖旧版本 | P0 |
| K21-HO-004 | 显示 source hash、版本差异、影响场景与确认人 | P1 |

核心类型：

```ts
type ScreenplayHandoffV1 = {
  schemaVersion: "kiikis.screenplay-handoff/1";
  id: string;
  projectId: string;
  universeId: string | null;
  episodeId: string;
  sourceVersionId: string;
  sourceHash: string;
  canonSnapshotVersion: string | null;
  aspectRatio: "9:16";
  scenes: HandoffSceneV1[];
  createdBy: string;
  confirmedBy: string;
  createdAt: string;
};
```

### 5.2 动态宫格

| ID | 需求 | 优先级 |
|---|---|---|
| K21-SB-001 | 每场按叙事密度选择 4/6/9/12 格并记录理由 | P0 |
| K21-SB-002 | `NEW` 场首格必须是无人空镜、有明确运镜；人物从第 2 格出现 | P0 |
| K21-SB-003 | `CONTINUOUS` 场承接动作/物件/视线，不强制空镜 | P0 |
| K21-SB-004 | 每格独立严格 9:16，保护头、手、动作、道具和运动方向 | P0 |
| K21-SB-005 | 固定空间、轴线、人物位置、身份、服装、道具、光线和时间连续性 | P0 |
| K21-SB-006 | 宫格纯画面不烧录编号、台词或可读文字 | P0 |
| K21-SB-007 | 人工编辑、锁定和 CAS 冲突不得被重分析覆盖 | P0 |
| K21-SB-008 | 确定性导出 Markdown、JSON、CSV 和生产包 | P0 |
| K21-SB-009 | 每镜头输出可直接给视频模型的完整摄影提示词 | P1 |

团队 Markdown 的字段顺序固定为：镜头编号、时间点、人物名、台词、情绪、动作、运镜说明。结构化数据是事实源，Markdown 是确定性渲染结果。

## 6. KK：全站 AI 交互与宠物系统

### 6.1 三层顺序

1. 实时任务控制：状态、进度单位、错误、待确认、结果和下一步。
2. 交互陪伴智能体：用户、Project、Universe 上下文和持续关系。
3. 外观与收藏：账号级档案、皮肤、卡牌、库存、装备和未来经济兼容。

### 6.2 任务层需求

| ID | 需求 | 优先级 |
|---|---|---|
| K21-KK-001 | 单一 KK runtime 全站挂载，`/kk` 与 `/companions` 使用同一事实 | P0 |
| K21-KK-002 | staging/prod 默认禁用 KK fixture | P0 |
| K21-KK-003 | 任务事件在正常网络下 p95 3 秒内可见 | P0 |
| K21-KK-004 | 断线显示状态和最后同步时间，重连后 10 秒内补拉 | P0 |
| K21-KK-005 | 只显示服务端可验证的真实进度；不可量化任务只显示阶段 | P0 |
| K21-KK-006 | KK 的任务操作复用统一目标解析器和服务端 action | P0 |
| K21-KK-007 | 重复事件不重复通知、奖励或执行动作 | P0 |

### 6.3 陪伴层需求

- `K21-KK-010`：记住用户明确选择、最近项目、Universe 和已授权上下文。
- `K21-KK-011`：读取私有内容前做服务端权限检查。
- `K21-KK-012`：任何会发布、授权、付费、删除、覆盖 Canon 的动作必须二次确认。
- `K21-KK-013`：能解释为什么建议下一步，并链接到真实对象。
- `K21-KK-014`：删除或导出用户记忆有明确入口。

### 6.4 外观与经济基础

- `K21-KK-020`：账号级 `kk_profile`，不是浏览器 localStorage 真相。
- `K21-KK-021`：append-only entitlement/inventory ledger 记录来源、版本、授予和撤销。
- `K21-KK-022`：装备历史、当前外观和社区展示隐私可审计。
- `K21-KK-023`：成长只来自有意义且防刷的创作里程碑。
- `K21-KK-024`：2.1 不存在付费抽卡、二级交易、创作能力 pay-to-win。

## 7. 资源出生即具备权利

### 7.1 权利原则

Universe、Project、Actor、Asset 创建时立即具有 owner、visibility 和 grants。社区 publication 只影响发现，不创造所有权。

```ts
type GrantRelation =
  | "collaboration"
  | "share"
  | "use"
  | "adaptation"
  | "license";

type ResourceGrant = {
  id: string;
  resourceType: "universe" | "project" | "actor" | "asset";
  resourceId: string;
  relation: GrantRelation;
  granteeType: "user" | "link";
  granteeId: string | null;
  scope: string[];
  status: "pending" | "active" | "revoked" | "expired";
  expiresAt: string | null;
};
```

### 7.2 需求

- `K21-RG-001`：owner 只由服务端认证与创建事实决定。
- `K21-RG-002`：邀请 token 单次/限时、不可写日志、接受后绑定账号。
- `K21-RG-003`：所有读取和操作执行 grant + RLS 双重校验。
- `K21-RG-004`：撤销不删除历史使用、来源和审计事实。
- `K21-RG-005`：已生成衍生物的后续权利遵循创建时条款，不由前端猜测。
- `K21-RG-006`：所有权转移必须双方确认并记录前后 owner。

## 8. 项目级轻协作

- 邀请项目、Universe、单集或资产范围成员。
- 角色至少包含 owner、editor、reviewer、viewer；需要时增加 asset_operator。
- 支持任务指派、评论、审阅、批准/驳回和活动轨迹。
- 评论锚定稳定资源 ID 和版本，不锚定数组下标或页面坐标。
- 个人账号保持所有权根；不引入企业组织层级。

需求 ID：`K21-CO-001` 至 `K21-CO-008`，详见 TRAE/COZE Phase 4。

## 9. IP 资产社区

### 9.1 一级对象

- Work
- Universe
- Actor/Asset
- 生产日志或真实创作里程碑
- 用户主动公开的 KK 成就/外观

不允许脱离上述对象的自由灌水贴。

### 9.2 核心闭环

```text
真实对象发布
→ 发现/搜索/进入
→ 关注创作者或 Universe
→ 反应/收藏/评论
→ 查看来源与权利
→ 申请使用/改编/授权
→ 归因和里程碑回流
```

### 9.3 功能需求

- `K21-CM-001`：publication 与源资源分离，保存对象版本、发布者和可见性。
- `K21-CM-002`：发现页只读取允许公开/邀请访问的投影。
- `K21-CM-003`：关注、反应、收藏唯一且幂等。
- `K21-CM-004`：评论支持回复、软删除、冻结和审核证据。
- `K21-CM-005`：对象页明确来源、owner、许可状态和允许动作。
- `K21-CM-006`：通知由事实事件生成，可读、已读和去重。
- `K21-CM-007`：举报、屏蔽、moderation queue、隐藏、恢复、申诉同时上线。
- `K21-CM-008`：隐藏 publication 不删除私有源 Project/Universe/Asset。
- `K21-CM-009`：匿名、普通用户、被屏蔽用户和审核员权限矩阵自动化。
- `K21-CM-010`：Gate 未通过前 `/community` 受 invite/feature flag 保护。

## 10. 订阅与交易内测

### 10.1 Stripe 订阅

| ID | 需求 | 优先级 |
|---|---|---|
| K21-BI-001 | Stripe customer 与 Kiikis user 由服务端一一映射 | P0 |
| K21-BI-002 | Checkout 只创建允许列表内 price 的会话 | P0 |
| K21-BI-003 | success URL 只显示确认中，不授予权益 | P0 |
| K21-BI-004 | webhook 使用原始 body 和 secret 验签 | P0 |
| K21-BI-005 | 按 Stripe event ID 幂等处理重复事件 | P0 |
| K21-BI-006 | 拒绝用较旧事件覆盖较新的订阅状态 | P0 |
| K21-BI-007 | 同步 checkout、subscription、invoice 和 refund 生命周期 | P0 |
| K21-BI-008 | plan entitlement 只由服务器读取 webhook 同步状态 | P0 |
| K21-BI-009 | 提供 Customer Portal 或等价取消/支付方式入口 | P1 |
| K21-BI-010 | 账单状态变化写入 Creative Event、审计和观测 | P1 |

### 10.2 交易内测边界

| ID | 需求 | 优先级 |
|---|---|---|
| K21-TX-001 | 只开放 free、invite_only、manual_review 三种模式 | P0 |
| K21-TX-002 | 每个批准结果创建真实、可审计 grant | P0 |
| K21-TX-003 | 保存 order、attribution 和创建时条款快照 | P1 |
| K21-TX-004 | 明示费用、争议和 settlement intent | P1 |
| K21-TX-005 | 未移动资金时 paid amount 必须为 0 | P0 |
| K21-TX-006 | UI 明示免费、邀请制、人工审核或人工结算 | P0 |
| K21-TX-007 | staging/prod 默认关闭交易 fixture，演示数据永久标记 | P0 |
| K21-TX-008 | 禁止自动收益、提现、分账或虚假余额暗示 | P0 |

## 11. 数据、事件与事实源

### 11.1 唯一事实源

| 领域 | 事实源 |
|---|---|
| 创作内容 | 结构化资源 + 不可变版本 |
| 任务与业务变化 | 服务端追加式 creative events |
| 权限 | 服务端 grants + RLS |
| 订阅 | Stripe webhook 同步状态 |
| KK 外观/权益 | entitlement ledger |
| 社区发现 | publication 投影 |

### 11.2 Creative Event

```ts
type CreativeEventV1 = {
  id: string;
  sequence: number;
  eventType: string;
  schemaVersion: 1;
  actorType: "user" | "system";
  actorId: string | null;
  ownerId: string;
  resourceType: string;
  resourceId: string;
  resourceVersion?: string | null;
  taskId?: string | null;
  idempotencyKey: string;
  visibility: "private" | "collaborators" | "public";
  payload: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
};
```

业务写入与 outbox/event 写入必须在同一事务。消费者按 event ID 幂等。payload 不包含密钥、完整敏感 prompt、私有 storage path、支付 secret 或多余个人信息。

### 11.3 基础设施需求编号

| ID | 需求 | 优先级 |
|---|---|---|
| K21-EV-001 | 使用版本化 Creative Event 契约 | P0 |
| K21-EV-002 | 业务事实与 event/outbox 在同一事务提交 | P0 |
| K21-EV-003 | 事件拥有单调 sequence，支持断点补拉 | P0 |
| K21-EV-004 | 写入与消费者均按稳定键幂等 | P0 |
| K21-EV-005 | payload 拒绝密钥、完整敏感 prompt 和私有路径 | P0 |
| K21-DB-001 | 2.1 只新增 forward-only migration | P0 |
| K21-DB-002 | owner/grant 与 RLS 建立身份矩阵 | P0 |
| K21-DB-003 | 新表具备索引、audit SQL 和 production-like 查询验证 | P1 |
| K21-FF-001 | staging/prod feature flag 默认 fail closed | P0 |
| K21-FF-002 | fixture 只能在开发/预览显式启用并标记 | P0 |
| K21-FF-003 | release audit 阻止 fixture、缺配置和公开密钥 | P0 |

## 12. 非功能要求

### 12.1 可靠性与恢复

- 所有长任务拥有稳定 job ID、幂等键、阶段、错误码和可恢复输入。
- 失败保留已完成范围，明确是否可重试以及额度处理。
- 上游修改先快照、后 diff；人工锁定内容不自动覆盖。
- Realtime 中断必须降级轮询/补拉，不显示虚假动画进度。

### 12.2 性能

- KK 事件到可见 UI：正常网络 p95 ≤ 3 秒。
- Realtime 重连补拉：≤ 10 秒。
- 社区首屏不等待私有详情和计数全量聚合。
- 列表分页、索引和查询计划在 production-like 数据量验证。

### 12.3 安全与隐私

- service role、Stripe secret、Provider key 仅在服务器。
- owner、visibility、grant scope、plan entitlement 不信任客户端。
- 分享/邀请 token 哈希存储、限时、可撤销。
- KK 私有上下文与社区公开投影隔离。
- 关键删除、转移、授权、撤销、发布、审核、支付写审计。
- Provenance 记录事实，不宣称自动裁定法律权利。

### 12.4 可访问性与国际化

- 所有点击卡片具备语义链接或按钮、键盘可达、可见焦点。
- 状态不只依赖颜色；进度和错误有文本。
- 中英文不得混用固定文案；用户内容语言与界面语言分离。
- 触摸目标至少 44×44 CSS px，除紧凑的纯装饰状态标记。

## 13. 指标与观测

核心指标必须来自真实事件，不设虚构增长目标：

- 项目/任务详情跳转成功率和 404 率。
- screenplay handoff 创建率。
- handoff 到已确认动态宫格分镜完成率与耗时。
- 锁定/冲突解决成功率和数据丢失率。
- KK 事件延迟、重连恢复、任务操作成功率。
- 创建资源后邀请、分享、use grant 发生率。
- publication 浏览、收藏、评论、进入 Universe 和申请使用转化。
- Checkout → webhook-confirmed active 转化、取消和退款同步。
- Provider 任务成功率、失败类别、单位成功产出成本。

## 14. 阶段与发布 Gate

### Gate 0：产品基线

- 工作台无压缩/遮挡/横向溢出。
- 项目卡、Dashboard 任务、任务中心详情都进入正确目标。
- 不存在点击无响应或 fixture 404。

### Gate 1：内部团队黄金路径

- 真实六集批次端到端完成。
- 剧本到分镜无复制粘贴。
- Markdown、JSON、CSV、生产包可直接使用。
- 无未解决 P0/P1 数据丢失或覆盖。

### Gate 2：KK 真实实时

- staging/prod fixture 关闭。
- 任务、进度、错误和结果来自服务器。
- 跨页面、刷新、断线恢复满足时延指标。

### Gate 3：资源权利

- Universe、Project、Actor、Asset 创建后即可邀请、分享、使用或授权。
- grant/RLS 权限矩阵通过；撤销保留历史事实。

### Gate 4：社区安全运营

- 发现、关注、互动、通知和授权入口跑通。
- 举报、屏蔽、审核、申诉、恢复跑通。
- 无未解决 P0/P1 安全、隐私或审核缺陷。

### Gate 5：订阅与观测

- Stripe test 完整生命周期通过。
- 内部真实小额订阅完成付款、取消和退款验证。
- 权益只由 webhook 同步状态授予。
- 核心事件、成本和漏斗可观测。

只有 Gate 0–5 全部通过，才能移除 Community 的公开限制并宣布 Kiikis 2.1 全面上线。

## 15. 需求追踪

| 需求域 | TRAE 阶段 | COZE 阶段 |
|---|---|---|
| K21-P0-UI/NAV | Phase 0 | Phase 0 |
| K21-EV/DB/FF | Phase 1 | Phase 1 |
| K21-HO/SB | Phase 2 | Phase 2 |
| K21-KK | Phase 3 | Phase 3 |
| K21-RG/CO | Phase 4 | Phase 4 |
| K21-CM | Phase 5 | Phase 5 |
| K21-BI/TX | Phase 6 | Phase 6 |
| Gate 0–5 | Phase 7 | Phase 7 |

## 16. 版本完成定义

Kiikis 2.1 不是“增加宠物页和社区页”。版本完成必须同时成立：

- 真实创作生产连续且可恢复；
- KK 是全站实时 AI 入口和持续陪伴；
- 资源出生即具备权利和协作能力；
- 社区围绕真实 IP 对象并可安全运营；
- 订阅真实、交易内测诚实；
- 所有关系能成为未来 3D 世界、AI 角色生活和 KK 经济的同一事实基础。
