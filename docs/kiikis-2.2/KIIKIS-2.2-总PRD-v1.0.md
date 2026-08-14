# KIIKIS 2.2 总 PRD

> 版本：v1.0
> 日期：2026-08-14
> 状态：待用户审阅
> 产品版本：KIIKIS V2.2
> contract_version：`2.2.0-alpha.1`
> 优先级：P0 / P1
> 核心主题：最好用的剧本创作台、Universe 原生继承、站外原作导入、真实工作流闭环

## 0. 文档目的

本 PRD 定义 KIIKIS V2.2 的产品边界、核心对象、用户旅程、状态机、数据契约、验收标准和发布 Gate。

TRAE 分阶段执行入口：[`TRAE/README.md`](./TRAE/README.md)。实施必须按 Phase 0 → 6 逐 Gate 推进，不得把本 PRD 作为一个超长上下文一次性执行。

V2.2 不是 V2.1 的小修补。V2.1 已完成大量 API、权利、社区、账本、事件和生产基础，但真实使用中出现了工作台割裂、静态交互、上下文丢失、Universe 隐身和严格门禁损害创作体验等问题。V2.2 以真实可用性和 Universe 原生创作为版本主线，对冲突规则进行明确替代。

### 0.1 与 V2.1 的关系

V2.2 继承以下 V2.1 能力：

- Project、Work、Universe、Canon、Actor、Asset 和版本基础对象。
- Resource Grant、Usage Grant、授权、撤销保留历史和权利条款快照。
- Asset Version、谱系、持久化对象存储和 Usage 查询。
- Creative Event、Evidence Event、账本、订单、人工结算和审计基础。
- 动态 4/6/9/12 宫格、结构化分镜、导演交接和确定性导出基础。
- IP 资产社区、演员市场、订阅、交易内测和内容治理基础。
- v2 API 已发布的 `2.0.0-alpha.1` 契约保持兼容；V2.2 新增或改变语义的契约使用 `2.2.0-alpha.1`，不得静默改变旧响应。

V2.2 在以下冲突范围内覆盖 V2.1：

- 当前创作范围移除小说，只保留剧本。
- 删除严格的“上一步定稿后才能进入下一步”线性门禁。
- 删除独立“动态分镜”顶级页面，合并到单一分镜阶段。
- 删除工作流入口顶部自由输入框，只保留整齐的模块方格。
- Universe 继承不再以 Markdown 文本复制为事实源。
- 站外原作可以直接建立 Universe，不再要求先有 Kiikis 项目。
- 定稿、导出和 Evidence 不再是末端步骤，而是所有 Work 的横向能力。

## 1. 产品定义

### 1.1 一句话定位

KIIKIS 是以 Universe 为长期 IP 身份、以剧本创作为核心入口、由 KK 协助用户持续创作、继承、制作、追溯和演化作品的 AIGC 创作平台。

### 1.2 V2.2 版本主题

> 让每一次创作都能开始得自由、延续得清楚、修改得安全、来源可追溯，并自然成为 Universe 的一部分。

### 1.3 核心原则

1. **Universe-first，不是 Video-first**：KIIKIS 不能退化成单一视频制作平台。剧本、歌曲、美术、配音、分镜、视频和剪辑都是 Universe 中可持续演化的 Work。
2. **剧本优先**：剧本创作台是 V2.2 第一核心产品，必须适合高频、长时间和长篇幅创作。
3. **Work 即 Universe 入口**：Work 可以独立开始，但每个工作台始终提供创建、绑定、打开、同步 Universe 的入口。
4. **允许探索，正式节点稳定**：草稿可以跨阶段试做；正式制作、发布、授权和正式交付读取明确的不可变版本。
5. **不静默覆盖**：AI、上游修改、Universe 更新和第三方工具都不能静默覆盖已有内容、Canon 或历史版本。
6. **真实交互**：所有看起来可点击的卡片和按钮必须有真实目标或明确禁用原因；禁止“展示型假交互”。
7. **完整留痕**：会话、生成、选择、版本、来源、授权和导出形成可下载的事实链，但系统不宣称自动完成法律裁定。

## 2. 目标用户与核心场景

### 2.1 高频剧本创作者

- 从一个想法、参考资料或已有 Universe 开始创作剧本。
- 在世界观、角色、大纲、分集和正文之间自由切换。
- 与 KK 持续沟通，并在重开项目后恢复完整记录。
- 对当前集、当前场或选中文字提出修改要求。
- 在不正式定稿整部作品的情况下试做美术、分镜和配音。
- 将正式版本交接到制作链，并保留所有历史版本。

### 2.2 Universe 与 IP 创作者

- 从现有 Work 建立 Universe。
- 从已有 Universe 创建续作、前传、衍生、平行分支或改编。
- 选择继承世界规则、角色、关系、时间线和资产版本。
- 查看 Universe 更新对当前作品的影响，并决定是否升级。
- 把作品中新产生的事实作为候选提交回 Universe。

### 2.3 站外原作持有者

- 上传一份完整剧本建立 Universe。
- 或同时上传世界观、角色圣经、剧情大纲三份文件建立 Universe。
- 保留原作文件、来源哈希和只读 Source Work。
- 审核 AI 提取的角色、规则、关系和时间线后生成 Universe U1。
- 基于原作 Universe 在 KIIKIS 上继续二创。

### 2.4 跨工作流创作者

- 保留现有歌曲创作流程和完整对话。
- 在美术中统一管理角色、场景和道具。
- 在单一分镜阶段完成镜头表、动态宫格、运动预览和视频提示词。
- 使用轻量配音与剪辑能力完成作品。
- 在任何工作流下载成果与创作留痕。

## 3. V2.2 目标与非目标

### 3.1 必须达成

| ID | 目标 | 优先级 |
|---|---|---|
| K22-G-001 | 建立可自由导航、可长时间使用的剧本创作台 | P0 |
| K22-G-002 | 建立对象级、版本级 Universe 继承与显式升级 | P0 |
| K22-G-003 | 支持站外完整剧本或三件套上传建立 Universe | P0 |
| K22-G-004 | 所有工作流共用真实 Project、Work、Universe 和版本身份 | P0 |
| K22-G-005 | 完整恢复歌曲和剧本的结构化沟通记录 | P0 |
| K22-G-006 | Dashboard、任务中心、KK 和待确认项全部可达真实目标 | P0 |
| K22-G-007 | 合并创作与制作链，删除重复分镜概念 | P0 |
| K22-G-008 | 所有 Work 都能一键导出成果和创作留痕 | P1 |
| K22-G-009 | 修复 IP 资产社区和演员市场真实服务链 | P0 |
| K22-G-010 | 接入可替换的轻量配音与剪辑能力 | P1 |

### 3.2 明确不做

- 当前版本不提供小说工作流。
- 不把角色、场景、道具拆成独立顶级工作流，统一纳入美术。
- 不强制用户在进入工作台前选择或创建 Universe。
- 不自动创建空 Universe。
- 不自动把作品内容写入 Canon。
- 不自动升级项目使用的 Universe 快照。
- 不让 AI 直接覆盖已存在的正式版本。
- 不把整套 Universe 无差别注入每一次 AI 请求。
- 不宣称上传声明等同于完成著作权或改编权法律审查。
- 不宣称已实现自动跨境分账。
- 不使用没有书面确认的 Twick。
- 不依赖尚未稳定的 OpenCut Editor API；稳定后再评估。
- 不建立与 KIIKIS Project、Work、Asset、Universe 平行的第三方项目体系。

## 4. 核心对象与唯一事实源

### 4.1 对象关系

```text
User
 ├─ Universe
 │   ├─ Universe Version
 │   ├─ Canon Fact / Entity / Relationship / Timeline Event
 │   ├─ Asset / Asset Version
 │   └─ Work Links
 └─ Project
     ├─ Work
     │   ├─ Work Version / Checkpoint / Final
     │   ├─ Conversation Thread / Message
     │   ├─ Generation Job / Candidate
     │   ├─ Evidence Event
     │   └─ Inheritance Manifest
     └─ Downstream Work Links
```

### 4.2 Project 与 Work

- Project 是用户完成一个创作目标的容器，负责成员、工作流、任务和交付。
- Work 是可被版本化、发布、继承和授权的创作身份，例如剧本、歌曲、角色资产、分镜、视频或剪辑工程。
- 用户点击工作流模块后，系统必须一次性创建真实 Project 与 primary Work。
- 同一 Project 的下游阶段复用相同项目身份，并通过 Work Link 记录来源，不得另建“未命名草稿”孤岛。

### 4.3 事实源规则

| 领域 | 唯一事实源 |
|---|---|
| 项目身份 | 服务端 Project 记录 |
| 创作身份 | Work 及其版本 |
| Universe 身份 | Universe + Universe Version |
| Canon | 已审核的结构化 Canon 对象 |
| Universe 继承 | Inheritance Manifest + Immutable Snapshot |
| AI 沟通 | append-only Conversation Message |
| AI 生成 | Generation Request Snapshot + Candidate Version |
| 任务状态 | 服务端 Job + Job Event |
| 资产 | Asset + Asset Version |
| 剪辑 | `kiikis.timeline/1` |
| 权利 | Resource Grant / Usage Grant / terms snapshot |
| 留痕 | Evidence Event + manifest + hash |

## 5. 工作流入口与项目创建

### 5.1 入口布局

工作流选择器删除顶部自由输入区，不分组，使用同尺寸、同间距、整齐排列的模块方格。

V2.2 顶级创作模块：

- 剧本
- 歌曲
- 美术
- 分镜
- 视频
- 配音
- 剪辑

Universe、演员库、社区、任务中心是全局资源或管理入口，不作为同层创作模块混入方格。

### 5.2 创建行为

| ID | 需求 | 验收 |
|---|---|---|
| K22-ENTRY-001 | Dashboard“新建项目”打开工作流方格 | 不直接进入任一工作台 |
| K22-ENTRY-002 | 点击模块立即创建真实 Project + Work | 返回稳定 projectId/workId |
| K22-ENTRY-003 | 创建成功后直接进入目标工作台 | 无第二层创建向导 |
| K22-ENTRY-004 | 标题和 Universe 在工作台内补充 | 不阻塞首次进入 |
| K22-ENTRY-005 | 从 Universe 创建 Work 时预绑定该 Universe | 进入后显示继承设置 |
| K22-ENTRY-006 | 创建失败显示可重试错误 | 不留下无身份的本地草稿 |

## 6. Dashboard、任务中心与 KK

### 6.1 Dashboard

- “继续创作”整卡进入对应 Project、Work 和最后活动视图。
- “运行中任务”进入稳定 Job 详情页。
- “等待确认”进入具体候选、审核或冲突页面。
- Universe 卡进入真实 Universe 工作台。
- 卡片无合法目标时必须禁用并解释，不能表现为可点击。

### 6.2 Job 契约

每个 Job 必须记录：

- jobId
- userId
- projectId
- workId
- workbenchType
- targetType / targetId
- status
- progress unit
- result target
- error code / message
- cancellable / retryable
- createdAt / updatedAt

状态机：

```text
Queued → Running → Awaiting Confirmation → Completed
   └──────────────→ Failed
Queued/Running ───→ Cancelled
Failed/Cancelled ─→ Retried（新 Job，保留 parentJobId）
```

### 6.3 任务操作

| ID | 需求 | 优先级 |
|---|---|---|
| K22-JOB-001 | 每个真实 Job 有稳定详情页 | P0 |
| K22-JOB-002 | “查看结果”与“查看详情”分离 | P0 |
| K22-JOB-003 | 取消和重试为服务端授权动作 | P0 |
| K22-JOB-004 | staging/production 默认关闭 fixture | P0 |
| K22-JOB-005 | 取消不伪造成功，重试创建新 Job | P0 |
| K22-JOB-006 | Dashboard、Task Center、KK 共用目标解析器 | P0 |

### 6.4 KK

- KK 读取同一 Job、Project、Work、Universe 和待确认事实。
- 每条任务消息必须提供真实目标或明确说明暂无目标。
- KK 可以解释下一步，但不能替用户确认 Canon、发布、授权、付费或删除。
- KK 的进度、失败、待确认和结果消息都能跳转到具体对象。
- `/kk`、工作台侧栏和全局任务中心不得维护互相矛盾的独立 fixture 状态。

### 6.5 KK 验收

| ID | 验收 |
|---|---|
| K22-KK-001 | KK 显示的 Job 状态、进度和动作与任务中心一致 |
| K22-KK-002 | 每个可见动作进入真实 Job、Work、Candidate、Review 或 Asset |
| K22-KK-003 | 无合法目标时动作明确禁用并解释，不出现点击无响应 |

## 7. 统一 Workbench Shell

所有核心工作台使用同一身份与状态外壳。

### 7.1 顶部常驻信息

- Project / Work 标题
- 保存状态
- 当前 Work 版本
- Universe 名称、版本和绑定状态
- 创建 Universe / 绑定已有 Universe / 打开 Universe
- Checkpoint / 正式定稿
- 留痕与导出
- 任务状态

### 7.2 Universe 状态

未绑定时显示：

- 以当前 Work 创建 Universe
- 绑定已有 Universe

已绑定时显示：

- Universe 名称
- 继承版本
- 继承对象数量
- 时间线锚点
- 更新可用数量
- 冲突数量
- 打开 / 查看继承 / 同步

### 7.3 工作台统一但专业能力不合并

统一 Shell 只负责身份、Universe、版本、任务、保存、Evidence 和导航。剧本、歌曲、美术、分镜、视频、配音和剪辑继续保留各自专业界面，不强行变成同一编辑器。

## 8. 剧本室：V2.2 第一核心工作台

### 8.1 产品形态

剧本创作台从线性向导升级为“AI 剧本室”。世界观、角色、剧情结构、分集规划和正文是可自由进入、相互引用的创作视图，不再同时承担导航门禁和定稿状态。

### 8.2 三栏布局

左侧：

- 故事总览
- 世界与设定
- 角色
- 剧情结构
- 分集规划
- 集 / 场目录
- 伏笔与连续性
- 版本记录

中间：

- 当前对象编辑器
- 整集连续编辑
- 单场编辑
- 标准剧本结构
- 搜索替换
- 格式检查
- 专注写作
- AI 候选 Diff

右侧 KK：

- 完整创作对话
- 当前 AI 作用范围
- 本次 Context Packet
- “聊一聊”与“生成修改方案”两个明确动作
- 候选应用与拒绝记录

### 8.3 自由导航与软门禁

| 行为 | 是否需要上一步定稿 |
|---|---|
| 打开世界观、角色、大纲、分集、正文 | 否 |
| 与 KK 讨论 | 否 |
| 生成草稿或修改候选 | 否 |
| 从草稿试做美术、分镜、配音 | 否，自动冻结本次来源快照 |
| 正式批量制作 | 是，读取正式版本 |
| 公开发布或商业授权 | 是，读取正式版本与权利状态 |
| 正式交付包 | 是 |

内容状态：

```text
Editing Draft → Checkpoint → Finalized
```

- Checkpoint 是不可变、可被下游引用的版本。
- Finalized 是正式交接、发布、授权和正式交付使用的版本。
- 已定稿内容如需修改，创建新的 Editing Draft 子版本，不执行“取消定稿后覆盖原版本”。
- `stale` 是依赖状态，不是删除或降级操作。

### 8.4 上游变化

修改世界观、角色或大纲时：

- 保留所有已有分集、场次和版本。
- 计算可能受影响的集、场、角色、关系和制作资产。
- 将受影响的下游版本标记为 stale。
- 提供保持旧版本、查看差异、局部更新、重新生成候选或基于新版本重置。
- 禁止批量把下游内容降回草稿或清空。

### 8.5 AI 操作语义

“聊一聊”：

- 保存用户消息。
- 返回分析、追问或建议。
- 不修改文档。

“生成修改方案”：

- 当前输入必须作为本次任务首要指令。
- 保存用户消息与不可变 Generation Request Snapshot。
- 明确作用范围：项目、当前阶段、当前集、当前场、选中文字。
- 生成候选，不直接覆盖正文。
- 展示原文、候选、修改理由和影响范围。
- 支持全部应用、选择性应用或放弃。

### 8.6 剧本会话

每条消息至少记录：

- messageId
- threadId
- projectId / workId
- role
- content
- scopeType / scopeId
- parentMessageId
- generationJobId
- createdAt

重开项目后必须按原顺序恢复真实 user/assistant 消息，不得把整段历史压成一条合成 assistant 消息。

### 8.7 Context Packet

每次 AI 请求只加载高信号上下文：

1. 当前用户指令。
2. 当前场 / 集 / 选区。
3. 当前 Work 的角色状态与剧情目标。
4. 继承的锁定 Canon。
5. 与当前内容相关的 Universe 实体、关系和时间线。
6. 必要的前序连续性摘要。
7. 相关会话摘要与最近原始消息。

界面显示“本次引用”清单，用户可查看来源对象和版本。禁止默认拼接整个 Universe、全部长剧本和全部会话历史。

### 8.8 长剧本辅助

- 角色目标、关系和情绪变化。
- 伏笔埋设、推进和回收。
- 时间线与事件顺序。
- 人物是否知道某信息。
- 地点、道具和称谓连续性。
- 每集冲突、悬念和结尾钩子。
- 问题必须定位到具体集、场、台词或来源对象。

### 8.9 剧本验收

| ID | 验收 |
|---|---|
| K22-SW-001 | 无需定稿上一步即可打开和试做下一视图 |
| K22-SW-002 | 上游修改不删除、不覆盖、不批量降级下游 |
| K22-SW-003 | 重开项目恢复完整对话和当前视图 |
| K22-SW-004 | 最新输入必定进入本次生成请求 |
| K22-SW-005 | AI 修改默认先进入候选 Diff |
| K22-SW-006 | 任一场可从草稿 Checkpoint 试做分镜 |
| K22-SW-007 | 正式交接读取不可变 Finalized Version |
| K22-SW-008 | Universe 继承范围和来源版本持续可见 |

## 9. Universe 原生继承

### 9.1 三层模型

| 层级 | 内容 | Work 中的行为 |
|---|---|---|
| Universe Canon | 世界规则、角色身份、核心关系、历史事件 | 引用原对象，不复制，不直接修改 |
| Work Local State | 本作年龄、服装、伤势、关系阶段、人物目标 | 仅影响当前 Work |
| Production Asset | 角色形象、声音、场景、道具和版本 | 引用确定的 Asset Version |

### 9.2 从 Universe 创建新 Work

用户确认：

- Work 关系：正史延续、前传、衍生、平行分支、改编、本土化、其他。
- Canon 策略：strict、branch、reference_only。
- 时间线锚点。
- 主要角色。

默认“正史延续”策略：

- 自动包含全部锁定 Canon。
- 用户选择时间线位置和主要角色。
- 系统推荐相关关系、地点、组织、道具和资产。
- 用户可查看并调整推荐结果。
- 创建后固定为不可变快照，后续不自动升级。

### 9.3 Inheritance Manifest

```ts
type InheritanceManifestV1 = {
  schemaVersion: "kiikis.inheritance-manifest/1";
  id: string;
  projectId: string;
  workId: string;
  universeId: string;
  universeVersionId: string;
  universeContentHash: string;
  workRelation: "canon_continuation" | "prequel" | "spin_off" | "parallel_branch" | "adaptation" | "localization" | "other";
  canonPolicy: "strict" | "branch" | "reference_only";
  timelineAnchor: Record<string, unknown>;
  objects: Array<{
    objectType: string;
    objectId: string;
    objectVersionId: string;
    contentHash: string;
    mode: "inherited" | "forked" | "referenced";
    selectedFields?: string[];
  }>;
  createdBy: string;
  createdAt: string;
};
```

Markdown 世界观、角色圣经和摘要是 Manifest 的可重建视图，不是继承事实源。

### 9.4 Universe 更新

项目默认继续使用创建时快照。Universe 发布新版本时：

- 显示旧版与新版对象级差异。
- 显示受影响的集、场、台词、分镜和资产。
- 用户可保持当前版本、逐项采用、全部采用或建立分支。
- 采用更新创建新的 Work Checkpoint 和 Inheritance Manifest。
- 旧 Manifest、旧结果和历史作品永久保留。

### 9.5 Work 回写 Universe

作品中的新角色事实、关系、地点、事件和状态变化默认只属于当前 Work。用户可提交 Change Proposal：

- 带来源 Work、版本、集、场、原文和置信度。
- 显示与当前 Canon 的差异和影响。
- 支持接受、修改后接受、拒绝、延后、仅保留本作或建立分支。
- 接受后生成新 Universe Version 和 Evidence Event。
- 禁止 AI 自动接受提案。

### 9.6 继承验收

| ID | 验收 |
|---|---|
| K22-UNI-001 | 绑定已有 Universe 后创建完整 Manifest 和 Snapshot |
| K22-UNI-002 | Snapshot 包含 Canon、实体、关系、时间线和资产版本，不只含实体摘要 |
| K22-UNI-003 | Universe Version 使用真实版本号和内容哈希，不用当前时间伪装版本 |
| K22-UNI-004 | Work Local State 不修改 Universe 身份 |
| K22-UNI-005 | Universe 更新不自动覆盖 Work |
| K22-UNI-006 | 差异可定位到具体作品内容 |
| K22-UNI-007 | Work 回写必须经过人工审核 |
| K22-UNI-008 | 每个工作台持续显示 Universe 状态和动作 |

## 10. 上传站外原作建立 Universe

### 10.1 Universe 创建入口

Universe 页面“新建 Universe”提供三个整齐入口：

- 从零创建
- 从现有 Kiikis Work 建立
- 上传站外原作建立

没有既有项目时，“新建 Universe”仍然可用。

### 10.2 有效输入

方式 A：上传一份完整剧本。

方式 B：同时上传以下三份文件：

1. 世界观
2. 角色圣经
3. 剧情大纲

三件套缺少任一文件时可保存 Upload Draft，但不能进入正式提取和 U1 建立。

首期支持：PDF、DOCX、DOC、MD、TXT。JSON、HTML、CSV、XLSX 可作为补充资料，不作为完整剧本或三件套主文件。

### 10.3 Imported Source Work

首个有效文件保存后，系统创建：

- Universe Import Session。
- 只读 Imported Source Work。
- Source Work Version。
- 持久化原文件。
- 文件 SHA-256、MIME、大小、上传者和时间。
- 解析文本和来源定位索引。
- owner grant、权利声明和 Evidence Event。

原始文件和原始解析文本永久只读。用户如需整理、校订、重写或改编，必须创建带 parent/source/version/hash 的新可编辑版本或衍生 Work。

### 10.4 导入状态机

```text
Upload Draft
→ Files Persisted
→ Parsing
→ Extracting
→ Review Required
→ Universe U1 Ready
```

异常状态：

- Missing Required Files
- Parse Failed
- Extraction Degraded
- Extraction Failed
- Rights Restricted
- Cancelled

导入启动后立即在 Universe 页面显示可恢复卡片。只有 `Universe U1 Ready` 可以被其他 Work 继承。

### 10.5 长文档提取管线

完整剧本不得截取固定前缀后单次调用模型，必须执行：

1. 持久化和文件哈希。
2. 文档结构识别。
3. 按集、场和段落分块。
4. 分块提取角色、地点、组织、道具、事件和规则。
5. 实体别名与同名消歧。
6. 角色关系和状态变化汇总。
7. 时间线排序。
8. Canon、伏笔和未解决线索候选。
9. 跨块、跨文件冲突检测。
10. 用户审核。

AI 失败时可以保留已完成分块并重试失败阶段。启发式降级结果必须标记 degraded，不能自动生成 U1。

### 10.6 候选分类

| 类型 | 默认归属 |
|---|---|
| 世界 Canon | 用户确认后进入 Universe |
| 身份 Canon | 用户确认后进入 Universe |
| 关系 / 时间线 Canon | 用户确认后进入 Universe |
| 原作状态 | 保留在 Source Work，可被 U1 时间线引用 |
| 制作细节 | 保留在 Source Work 或 Asset Candidate |
| 冲突 / 不确定信息 | Review Required |

每条候选记录：

- sourceFileId
- page / section / episode / scene / paragraph
- sourceExcerpt
- candidateType
- proposedPayload
- confidence
- extractionJobId
- reviewStatus

### 10.7 导入审核台

左侧：世界、角色、关系、时间线、地点、组织、道具、Canon 分类。

中间：候选、合并建议和冲突。

右侧：原文来源、定位和置信度。

操作：

- 接受为 Canon
- 接受但不锁定
- 修改后接受
- 合并到已有实体
- 标记别名
- 标记为原作局部状态
- 暂不确定
- 忽略

### 10.8 U1 原子建立

用户明确点击“建立 Universe U1”后，同一事务创建：

- Universe Version U1。
- 已确认实体、Canon、关系和时间线。
- Source Work 与 Universe 的来源关系。
- owner grant 和可见性。
- Source Manifest 与文件哈希清单。
- Evidence Events。

任何部分失败都不得留下可被继承的半完成 U1。

### 10.9 修订版原作

上传修订版时：

- 不覆盖 Source Work v1。
- 创建 Source Work v2。
- 比较来源文件和提取对象差异。
- 生成 Universe Upgrade Proposal。
- 用户确认后生成 U2。
- 使用 U1 的 Work 只收到升级提示，不自动改变。

### 10.10 权利边界

上传时记录：

- 我是原作权利人。
- 我已获得导入和改编授权。
- 作品属于公共领域。
- 仅用于有权处理的内部项目。

默认可见性为 private。权利未确认或受限时：

- 可以完成私有解析与审核。
- 不得公开发布。
- 不得进入社区或市场。
- 不得创建商业授权。
- 不得向其他用户开放二创。

KIIKIS 记录声明、来源和事实，不宣称完成法律裁定。

### 10.11 导入验收

| ID | 验收 |
|---|---|
| K22-IMP-001 | 无 Kiikis 项目的用户可启动 Universe 导入 |
| K22-IMP-002 | 完整剧本可覆盖全文，不丢失后半部 |
| K22-IMP-003 | 三件套缺一不可建立 U1 |
| K22-IMP-004 | 原文件和 Source Work 永久只读 |
| K22-IMP-005 | 关闭页面后可继续导入和审核 |
| K22-IMP-006 | 每条候选可回到原文位置 |
| K22-IMP-007 | degraded 提取不能自动建立 U1 |
| K22-IMP-008 | U1 建立原子、幂等、可审计 |
| K22-IMP-009 | 修订版产生 Source Version 和 Upgrade Proposal |
| K22-IMP-010 | 权利受限 Universe 不可公开或商业授权 |

## 11. 歌曲工作台

### 11.1 保持现有流程

歌曲的对话引导、歌词、翻译、风格提示词、参考文件、Universe 关联和留痕工作包保持现有产品方向，不重新设计创作流程。

### 11.2 会话持久化

当前扁平 `songDevelopmentNotes` 只能作为派生摘要，不再作为会话事实源。每条 user/assistant 消息独立保存并在重开项目后按原顺序恢复。

### 11.3 “生成/更新”行为

用户输入文字后点击“生成/更新”：

1. 当前文字先作为可见 user message 持久化。
2. 创建包含当前文字的不可变 Generation Request Snapshot。
3. 请求显式使用该 Snapshot，不依赖前端异步状态更新。
4. 生成期间保留当前歌词和提示词。
5. 成功后产生候选版本。
6. 用户应用候选后创建新的 Work Version。
7. 消息、Job、候选和最终采用版本相互关联。

无输入时，“生成/更新”基于当前对话、现有歌词、提示词、参考资料和 Universe Context。

### 11.4 歌曲验收

| ID | 验收 |
|---|---|
| K22-SONG-001 | 重开项目恢复全部真实沟通记录 |
| K22-SONG-002 | 当前输入必定进入本次生成 |
| K22-SONG-003 | 生成前不清空现有成果 |
| K22-SONG-004 | 每次生成可追溯到消息和版本 |
| K22-SONG-005 | 留痕包重开后仍包含真实消息顺序 |

## 12. 美术、分镜、视频、配音与剪辑

### 12.1 视听主链

```text
剧本 → 美术 → 分镜 → 视频 → 剪辑
```

歌曲和配音是独立 Work，可通过显式使用关系关联剧本、角色、场景或剪辑工程。

所有跨 Work 使用关系统一记录为 `WorkUsageLink`，至少包含：

- sourceWorkId / sourceWorkVersionId
- targetProjectId / targetWorkId / targetWorkVersionId
- targetEntityType / targetEntityId
- usageRole
- assetVersionId / rightsSnapshotId（如适用）
- createdBy / createdAt

歌曲不被强行塞入视频流水线。用户可把歌曲显式关联为 Universe 主题曲、角色主题曲、作品主题曲、集主题曲、场景配乐、剧中歌曲或独立歌曲；同一歌曲版本可被多个场景和剪辑工程引用，更新时由使用方决定是否采用新版本。

配音以角色、旁白或具体台词为连接点。角色配音先建立 Character Identity → Voice Identity 关系，台词配音再绑定 Scene / Dialogue Line / Text Version；剪辑工程消费已选定的 Voice Asset Version。替换配音版本不修改角色身份，也不静默替换已定稿剪辑。

### 12.2 美术

- 角色、场景、道具统一纳入美术。
- 从剧本 Work、Scene 和 Inheritance Manifest 读取结构化身份。
- 角色形象必须绑定 Universe Entity 与 Asset Version。
- 使用者不能修改原始演员或资产身份。
- Work Local Appearance 与 Universe Character Identity 分离。

### 12.3 分镜

删除独立“动态分镜”顶级页面。单一分镜阶段包含：

- 结构化镜头表。
- 每镜头 4/6/9/12 宫格。
- 动态运动预览。
- 视频模型提示词。
- 人工修改、锁定、版本 Diff。
- 确定性导出。

已确认分镜直接进入视频，不再经过第二个同义页面。

### 12.4 视频

- 读取确认的镜头与提示词版本。
- 生成 Job 绑定 Shot、Asset Version、Provider、Model 和持久结果。
- 正式结果不得保存 Provider 临时 URL。
- 失败、重试和替换保留历史。

### 12.5 配音

- 使用 CosyVoice 作为首期可替换配音引擎。
- 引擎只负责语音生成，不拥有 KIIKIS Project、Work、Character 或 Asset 身份。
- Voice Identity 与 Character Identity 分离并关联。
- 真人声音克隆必须有明确授权；未确认时不得公开或商业使用。
- 生成结果保存模型、参数、文本、语言、情绪、速度、音量、来源和 Asset Version。

### 12.6 剪辑

- 使用 MIT `@xzdarcy/react-timeline-editor` 提供轻量 Timeline UI。
- 使用 MIT WebAV 提供浏览器预览、组合与导出。
- `kiikis.timeline/1` 是唯一时间线事实源。
- 第三方组件不得另建项目身份或私有时间线真相。
- Chrome / Edge 优先使用 WebCodecs；不支持环境保留 EDL、FCPXML 或服务端导出退路。
- OpenCut 仅在 Editor API 稳定后重新评估。

## 13. 定稿、导出与 Evidence

### 13.1 横向能力

Checkpoint、Finalized、导出和 Evidence 在每个工作台常驻，不作为流程末端单独页面。

### 13.2 导出层级

每个 Work 支持：

- 当前草稿导出。
- 指定 Checkpoint 导出。
- 正式定稿导出。
- 完整创作沟通导出。
- 版本变化导出。
- AI 生成与人工选择记录。
- Universe 继承与来源关系。
- 权利声明与授权快照。
- 完整 Evidence ZIP。

### 13.3 统一 Manifest

```ts
type EvidenceManifestV2 = {
  schemaVersion: "kiikis.evidence-manifest/2";
  projectId: string;
  workId: string;
  workVersionId: string;
  universeId: string | null;
  inheritanceManifestId: string | null;
  sourceWorkIds: string[];
  conversationThreadIds: string[];
  generationJobIds: string[];
  assetVersionIds: string[];
  evidenceEventIds: string[];
  rightsSnapshotIds: string[];
  files: Array<{ path: string; sha256: string; size: number }>;
  generatedAt: string;
};
```

### 13.4 覆盖范围

统一 Evidence 必须覆盖：

- 剧本
- 歌曲
- 演员 / 角色
- 美术资产
- 分镜
- 视频
- 配音
- 剪辑
- Universe 导入与继承

## 14. IP 资产社区与演员市场

### 14.1 社区

- Discovery Feed 必须读取真实已部署 schema 和真实 Publication。
- `service_unavailable` 必须记录服务端原始错误类别和 correlationId，客户端显示可理解信息。
- 线上 migration、查询投影和 RLS 必须在发布 Gate 中验证。
- 禁止以空 fixture 冒充正常 Feed。

### 14.2 演员市场

- 列表组件与集合 API 使用同一已存在路由。
- 详情、购买、License Offer、Usage Grant 和项目调用形成真实闭环。
- 市场调用创建项目级副本或使用关系，不修改原演员身份。
- 真人肖像和声音权利未确认时不得公开或商业授权。

### 14.3 验收

| ID | 验收 |
|---|---|
| K22-MKT-001 | 社区 Feed 在真实 production schema 返回可用数据或真实空状态 |
| K22-MKT-002 | 社区查询失败可定位到缺表、缺列、权限或网络 |
| K22-MKT-003 | 演员市场列表 API 与 UI 路由一致 |
| K22-MKT-004 | 使用演员后进入目标 Project，并保留 Usage Grant 来源 |
| K22-MKT-005 | 真人肖像或声音权利未确认时，服务端拒绝公开和商业调用 |

## 15. 服务端契约与数据需求

### 15.1 新增或升级的逻辑资源

- Work Conversation Thread / Message
- Work Checkpoint / Finalized Version
- Generation Request Snapshot / Candidate
- Universe Version / Content Hash
- Inheritance Manifest / Snapshot Object Reference
- Work Entity Overlay / Local State
- Universe Import Session
- Universe Import File / Source Location Index
- Universe Import Candidate / Review Decision
- Imported Source Work / Source Version

### 15.2 API 能力

至少提供以下服务端能力，具体路由名在实施计划中冻结：

- 创建 Project + Work。
- 读取和更新 Workbench Shell 上下文。
- 创建 / 读取 / 搜索 Conversation Message。
- 创建 Work Checkpoint 和 Finalized Version。
- 创建 / 读取 / Diff Inheritance Manifest。
- 逐项采用 Universe 更新。
- 提交 / 审核 Work → Universe Change Proposal。
- 创建 Universe Import Session。
- 持久化上传文件和来源索引。
- 查询导入 Job 状态并重试失败阶段。
- 审核导入候选。
- 原子建立 Universe U1。
- 创建修订 Source Version 和 Upgrade Proposal。
- Job 取消 / 重试 / 详情 / 结果。
- 统一 Evidence Package 创建与下载。

### 15.3 服务端可信边界

- ownerId、userId、支付成功、授权状态、Finalized 状态和 Canon 接受结果不能信任客户端。
- 上传文件使用持久对象存储，不保存 Provider 临时 URL。
- Job 操作校验所属用户和目标资源权限。
- Universe U1、Checkpoint、Finalized、Grant 和 Evidence 写入使用事务或可证明的幂等补偿。
- 所有 V2.2 新 API 返回 `contract_version: 2.2.0-alpha.1`。既有已返回 `contractVersion` 的 `2.0.0-alpha.1` API 保留旧字段，可追加 `contract_version`，但不得删除或改名旧字段。

## 16. 错误处理与恢复

### 16.1 通用原则

- 错误必须有 code、message、retryable 和 correlationId。
- UI 不把异常吞成“无反应”。
- 失败不得删除现有成果。
- 重试创建新 Job 或从明确 Checkpoint 继续。
- 后台任务完成后恢复到真实对象，不只显示 Toast。

### 16.2 会话与生成

- 用户消息先持久化，再启动生成。
- AI 请求失败时保留用户消息和旧结果。
- 生成候选解析失败时不覆盖当前版本。
- 用户刷新或关闭页面后可继续读取 Job 状态。

### 16.3 Universe 导入

- 单个文件解析失败不删除其他已上传文件。
- 单个分块提取失败只重试该分块。
- 实体归并冲突进入 Review Required。
- degraded 模式明确可见，禁止建立 U1。

## 17. 非功能要求

### 17.1 可靠性

- 消息、版本、快照、候选和 Evidence 写入幂等。
- staging / production 不使用 fixture 作为默认事实源。
- 任何删除或撤销不删除历史来源、合法使用和 Evidence。
- 页面重开后恢复最后项目、视图、选择对象和滚动位置。

### 17.2 性能

- Dashboard 首个可交互内容 p75 小于 2.5 秒。
- 普通消息持久化 p95 小于 1 秒。
- Job 状态在正常网络下 p95 3 秒内可见。
- 长剧本导入必须后台执行，不阻塞 HTTP 请求到平台超时。
- Context Packet 应按任务选择并压缩，禁止无界增长。

### 17.3 安全与隐私

- 上传原作默认 private。
- 所有私有 Source Work、Conversation 和 Universe Context 服务端鉴权。
- 权利未确认对象禁止公开、商业授权和市场调用。
- 真人肖像与声音单独记录授权状态。
- 下载 URL 短期签名，不暴露持久存储内部路径。

### 17.4 可访问性与国际化

- 中文和英文界面均可完成核心旅程。
- 键盘可操作模块方格、导航、候选 Diff、审核和任务动作。
- 焦点、hover 和触摸热区与视觉范围一致。
- 错误、状态和颜色信息不能只依赖颜色表达。

## 18. 指标与观测

### 18.1 核心漏斗

- 工作流方格打开率。
- 模块点击 → Project + Work 创建成功率。
- 剧本项目次日与七日回访率。
- 会话恢复成功率。
- 输入 → 候选生成成功率。
- 草稿试做分镜率。
- Checkpoint → 正式定稿转化率。
- Universe 绑定率。
- Universe 继承对象采用率。
- Universe 更新逐项采用率。
- 原作导入 → Review Required → U1 完成率。
- Evidence 包下载率。

### 18.2 质量指标

- 点击无响应事件数为 0。
- 项目进入错误工作台事件数为 0。
- 重开后消息丢失事件数为 0。
- 最新输入未进入生成请求事件数为 0。
- AI / Universe 静默覆盖正式版本事件数为 0。
- Source Work 原始内容被修改事件数为 0。
- degraded 导入误生成 U1 事件数为 0。

## 19. 端到端验收旅程

### Journey A：最好用的剧本创作台

1. Dashboard 点击新建项目。
2. 选择剧本模块，创建真实 Project + Work。
3. 不定稿世界观，直接进入角色、大纲和第一场正文。
4. 与 KK 讨论并生成当前场修改候选。
5. 选择性应用并创建 Checkpoint。
6. 重开项目，完整恢复会话、版本和当前场。
7. 从该场试做分镜，不要求整部剧本定稿。
8. 正式交接时选择 Finalized Version。

### Journey B：已有 Universe 的新作品

1. 从 Universe 页面创建新剧本 Work。
2. 选择正史延续、时间线位置和主要角色。
3. 系统推荐关联规则、关系、地点和资产。
4. 用户确认 Manifest，进入剧本室。
5. KK 显示本次引用的 Universe 对象和版本。
6. Universe 更新后项目收到提示但内容不改变。
7. 用户逐项采用更新并创建新 Checkpoint。

### Journey C：上传《契约之家》建立 Universe

1. 无既有 Kiikis 项目进入 Universe 页面。
2. 选择“上传站外原作建立”。
3. 上传完整剧本并填写权利声明。
4. 页面关闭后，Universe 列表仍显示导入进度。
5. 提取覆盖全文，候选可定位到具体集、场和原文。
6. 用户审核角色、规则、关系、时间线和冲突。
7. 原子生成 Universe U1 和只读 Source Work。
8. 从 U1 创建新的二创剧本 Work。
9. 下载包含原作来源、继承和创作过程的 Evidence 包。

### Journey D：歌曲持续创作

1. 打开历史歌曲项目。
2. 恢复全部原始 user/assistant 消息。
3. 输入新的修改要求并点击“生成/更新”。
4. 本次请求明确包含最新输入。
5. 原结果保留，候选生成成功后由用户应用。
6. 下载的留痕包包含真实消息和版本链。

### Journey E：任务、KK 与真实结果

1. 启动分镜、导入或视频 Job。
2. Dashboard、任务中心和 KK 显示同一状态。
3. 查看详情进入稳定 Job 页面。
4. 取消或重试执行真实服务端状态转换。
5. 完成后“查看结果”进入具体 Work / Asset / Scene。

### Journey F：社区与演员市场

1. 社区 Feed 从真实 production schema 返回数据。
2. 点击 Publication 进入源 Universe / Actor / Work。
3. 演员市场列表、详情、购买、Usage Grant 和项目调用完整可用。
4. 权利受限演员不能公开或商业调用。

## 20. 实施阶段与依赖

### Phase 0：真实可用性止血

- 工作流入口删除输入框。
- Dashboard 新建与卡片跳转。
- Job 详情、取消、重试和真实模式。
- KK 真实目标。
- 社区 discovery 和演员市场列表接线。

### Phase 1：统一身份与横向基础

- Project + Work 原子创建。
- Workbench Shell。
- Conversation Ledger。
- Work Version / Checkpoint / Finalized。
- 统一 Evidence Manifest。
- 项目和工作流目标解析器。

### Phase 2：Universe 继承地基

- 真实 Universe Version 和内容哈希。
- Inheritance Manifest。
- Work Local State。
- Context Packet 服务。
- 对象级 Diff、stale 和逐项升级。
- Change Proposal 接入。

### Phase 3：剧本室

- 移除小说双轨和严格导航门禁。
- 三栏剧本室。
- AI 两种操作语义。
- 长剧本连续性与影响分析。
- 草稿试做与正式交接。

### Phase 4：站外原作导入

- Import Session、Source Work 和持久文件。
- 长文档分块提取。
- 候选审核台。
- U1 原子建立。
- 修订版 Source Version 和 Universe Upgrade Proposal。
- 权利与受限状态。

### Phase 5：全工作流融合

- 美术统一角色、场景、道具。
- 单一分镜阶段。
- 视频持久结果。
- CosyVoice 配音。
- React Timeline Editor + WebAV 剪辑。
- 歌曲会话与生成修复。
- 所有 Work 统一 Evidence。

### Phase 6：集成 UAT 与发布

- 六条端到端旅程全部通过。
- production fixture 关闭。
- migration、RLS、存储、Job 恢复和 Evidence 验证。
- 真实长剧本和三件套导入。
- 浏览器与移动端验证。
- 灰度发布和回滚演练。

## 21. 发布 Gate

### Gate 0：无假交互

- 工作流入口正确。
- Dashboard、Task Center、KK 无点击无响应。
- 所有可点击卡片有真实目标。
- staging / production fixture 默认关闭。

### Gate 1：身份与历史稳定

- Project、Work、Version、Conversation 和 Evidence 服务端持久化。
- 重开项目不丢消息和版本。
- 正式版本不可被静默覆盖。

### Gate 2：Universe 原生继承

- Manifest、Snapshot、Local State 和真实 Universe Version 生效。
- Universe 更新不改变已有 Work。
- Work → Universe Proposal 人工审核闭环通过。

### Gate 3：剧本室

- 自由导航、软门禁、候选 Diff 和草稿试做通过。
- 上游修改不删除下游。
- 长剧本连续性定位到集、场和台词。

### Gate 4：原作导入

- 完整剧本和三件套两种输入通过。
- Source Work 只读和来源定位通过。
- 后台恢复、degraded 拦截和 U1 原子建立通过。
- 权利受限状态通过。

### Gate 5：全链融合

- 剧本 → 美术 → 分镜 → 视频 → 剪辑使用同一项目身份。
- 歌曲与配音作为独立 Work 可显式关联。
- 所有 Work 可以下载成果与 Evidence。

### Gate 6：真实运营

- 社区和演员市场 production 数据可用。
- Job、KK、任务中心状态一致。
- 监控、告警、回滚和审计准备完成。

## 22. 原始问题与需求追踪

| 用户问题 / 已确认决策 | V2.2 处理位置 | 关键验收 |
|---|---|---|
| 工作流入口去掉输入框，只保留整齐模块方格 | 5.1 | `K22-ENTRY-001` |
| 新建项目先打开工作流入口；等待确认等卡片可点击 | 5.2、6.1 | `K22-ENTRY-001`、Gate 0 |
| 任务中心取消、详情无响应 | 6.2–6.4 | `K22-JOB-001` 至 `K22-JOB-006` |
| 创作台与制作台割裂；分镜与动态分镜重复 | 4.2、12.1、12.3 | Gate 5 |
| Universe 在各工作台消失 | 7.1–7.2、9 | `K22-UNI-008` |
| IP 资产社区 discovery feed 不可用 | 14.1 | `K22-MKT-001`、`K22-MKT-002` |
| 演员市场不可用 | 14.2 | `K22-MKT-003` 至 `K22-MKT-005` |
| KK 只有进度，没有真实跳转 | 6.5 | `K22-KK-001` 至 `K22-KK-003` |
| 各类创作无法下载成果和创作留痕 | 13 | Gate 5、完成定义 10 |
| 歌曲重开丢会话；最新输入未进入生成 | 11 | `K22-SONG-001` 至 `K22-SONG-005` |
| 剧本严格定稿门禁影响体验 | 8.2–8.4 | `K22-SW-001`、Gate 3 |
| 已有 Universe 的新作品需要继承世界观和角色 | 9 | `K22-UNI-001` 至 `K22-UNI-008` |
| 站外完整剧本或三件套建立 Universe | 10 | `K22-IMP-001` 至 `K22-IMP-010` |
| 不做小说；角色、场景、道具归美术 | 3.2、5.1、12.2 | 工作流入口和 Gate 5 |
| 视频之后是剪辑；歌曲与配音保持独立且可关联 | 12.1、12.5、12.6 | Gate 5 |
| KIIKIS 必须是 Universe-first，不能成为视频制作平台 | 1.3、7、9 | 完成定义 11 |

## 23. V2.2 完成定义

KIIKIS V2.2 完成必须同时满足：

1. 剧本创作者可以自由创作，不再被线性定稿门禁阻断。
2. 重开剧本或歌曲项目时，完整沟通记录、版本和上下文仍然存在。
3. 创作与制作使用同一个 Project、Work、Universe 和来源版本。
4. 每个 Work 都能创建、绑定、进入和演化 Universe。
5. 已有 Universe 的新作品使用对象级、版本级继承，不依赖文本复制。
6. 站外完整剧本或三件套可以建立只读 Source Work 和 Universe U1。
7. Universe、AI 和上游修改都不会静默覆盖历史作品。
8. Dashboard、任务中心和 KK 的任务、确认与结果全部可达。
9. 社区和演员市场连接真实服务，而不是静态展示或 fixture。
10. 剧本、歌曲、演员、美术、分镜、视频、配音和剪辑都能下载成果和完整创作留痕。
11. KIIKIS 保持 Universe-first，明确不是单一视频制作平台。
