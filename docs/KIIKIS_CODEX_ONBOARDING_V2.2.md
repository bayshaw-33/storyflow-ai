# KIIKIS Codex 入职与开发交接说明（V2.2）

> 文档用途：交给新的 Codex 作为 Kiikis.com 的项目入职说明、产品背景、工程边界和当前工作入口。
>
> 更新时间：2026-08-22
>
> 当前产品版本：KIIKIS V2.2
>
> 当前契约版本：`2.2.0-alpha.1`（兼容既有 `2.0.0-alpha.1`）
>
> 线上地址：[https://www.kiikis.com/](https://www.kiikis.com/)

---

## 0. 你接手的是什么项目

Kiikis.com 不是一个单纯的 AI 视频生成器，也不是把多个 AI 工具简单拼在一起的工作流页面。

KIIKIS 的长期目标是：让创作者围绕一个持续演化的 Universe，完成剧本、歌曲、美术、分镜、视频、配音、剪辑和改编，并且让每一次沟通、选择、生成、修改、授权和导出都留下可追溯的创作证据。

一句话定位：

> KIIKIS 是以 Universe 为长期 IP 身份、以剧本创作为核心入口、由 KK 协助用户持续创作、继承、制作、追溯和演化作品的 AIGC 创作平台。

最重要的产品判断是：

**KIIKIS 的核心是 Universe 和创作过程，不是视频成片。**

剧本是当前最高频、最重要的创作入口，但 KIIKIS 不能因此退化为视频制作平台。所有下游工作都应当回到 Work、Universe、资产谱系、版本和创作留痕这套长期身份体系中。

---

## 1. 产品开发背景

### 1.1 初始阶段：从单点 AIGC 工作台开始

早期 KIIKIS 主要提供若干创作工作台，包括：

- 小说/剧本类文字创作
- 歌曲与歌词创作
- 角色和视觉资产生成
- 分镜、视频和制作相关能力
- 演员库、Universe 和项目管理

早期实现大量依赖页面级状态、演示数据、不同工作台各自维护的对象和不一致的跳转。页面看起来有很多入口，但真实数据身份、项目关系、任务状态和历史会话没有完全贯通。

因此真实使用中暴露了几类问题：

1. 工作流入口、项目管理、制作工作台和创作工作台互相割裂。
2. 很多卡片、任务和按钮只是展示效果，没有真实目标或动作。
3. 歌曲和剧本重开后只能看到结果，之前的对话记录丢失。
4. 剧本创作被严格的线性定稿门禁限制，探索成本很高。
5. Universe 在很多工作台中不可见，无法自然继承世界观和角色。
6. 资产社区、演员市场和任务中心在真实环境中可能显示 `service_unavailable` 或无法打开。
7. 作品、资产、版本、授权和导出之间缺乏统一的来源链。
8. 生产环境、staging、fixture 和本地数据库之间曾经发生过目标混淆。

### 1.2 V2.0 / V2.1：建立平台基础

V2.0 和 V2.1 逐步建立了平台型基础能力：

- Project、Work、Universe、Canon、Actor、Asset 等核心对象。
- Asset Version、资产主版本、谱系和使用关系。
- Resource Grant、Usage Grant、License Offer、订单、账本和人工结算。
- Creative Event、Evidence Event、审计和导出基础。
- 结构化分镜、动态宫格、视频提示词和制作交接基础。
- IP 资产社区、演员市场、演员使用留痕和真人肖像权边界。
- Supabase Auth、RLS、Storage、Vercel 部署和服务端 API。

V2.1 的主要问题不是缺少对象，而是对象没有始终被统一工作流真实使用。很多基础能力存在于 API 或 migration 中，但页面仍然使用旧路由、静态数据或独立状态。

### 1.3 V2.2：从“功能集合”转向“真实创作系统”

V2.2 是一次产品方向修正，不是简单的视觉换皮。

V2.2 的主线是：

- 打造最好用的 AI 主导剧本创作台。
- 让每个 Work 都能成为 Universe 的入口。
- 允许用户从已有 Universe 创建新作品并继承结构化事实。
- 支持站外原作直接上传并建立 Universe。
- 把创作与制作放到同一套 Project/Work/Version 身份体系中。
- 让歌曲、任务、社区、演员市场和所有工作台回到真实服务链。
- 让定稿、导出和 Evidence 变成贯穿所有 Work 的横向能力。

V2.2 明确覆盖 V2.1 的冲突规则：

- 当前不再提供小说新建入口；新代码不得继续产生 `novel` Work。
- 删除“上一步定稿后才能进入下一步”的硬性线性门禁。
- “动态分镜”不再作为独立顶级页面，统一归入分镜阶段。
- 工作流入口只保留整齐的模块方格，去掉顶部自由输入框。
- Universe 继承以结构化对象、Manifest 和 Snapshot 为事实源，不以 Markdown 复制为事实源。
- 定稿、导出和 Evidence 不再是末端独立阶段，而是所有 Work 都可以调用的能力。

---

## 2. 用户真正重视的产品原则

以下原则是用户明确反复确认过的产品约束。新 Codex 不应为了“更现代”“更统一”或“更工程化”而绕开它们。

### 2.1 Universe-first，不是 Video-first

Universe 是 KIIKIS 最核心的长期能力。

一个 Universe 可以包含：

- 世界规则
- 角色和角色关系
- 场景、道具和视觉资产
- 时间线和历史事件
- 作品、续作、前传、衍生和改编
- 资产版本、使用关系和来源谱系

剧本、歌曲、美术、分镜、视频、配音、剪辑和改编都是 Universe 中可以持续演化的 Work，而不是一次性孤立的输出。

任何新功能都应回答：

1. 它属于哪个 Project 或 Work？
2. 它是否需要关联 Universe？
3. 它产生的内容以后能否被版本化、继承、追溯和导出？
4. 它是否会破坏原有 Universe 或历史版本？

如果一个设计只能把用户带到视频生成，却没有长期作品身份、来源、版本和 Universe 关系，它就偏离了 KIIKIS 的方向。

### 2.2 剧本优先，但不能吞掉其他工作流

用户当前使用最多的是剧本创作，因此剧本台是 V2.2 的第一核心产品。剧本台需要适合：

- 高频使用
- 长时间使用
- 多轮对话
- 长篇剧本
- 反复修改
- 任意阶段返回
- 试做下游内容
- 重开后恢复上下文

但剧本台不是整个 KIIKIS。美术、歌曲、分镜、视频、配音、剪辑和改编仍然有独立价值，而且都要通过真实 Project/Work 身份与剧本和 Universe 关联。

### 2.3 允许探索，正式节点稳定

草稿阶段允许用户：

- 从任意节点进入。
- 先试做某个场景的美术或分镜。
- 先讨论正文，再回头补世界观。
- 让 KK 解释问题，而不是立刻改稿。
- 对多个候选方案进行比较。

正式制作、发布、授权和正式交付必须读取明确的不可变版本。草稿试做不能被误认为正式定稿。

### 2.4 不静默覆盖

以下内容都不能被静默覆盖：

- 用户历史对话
- 用户输入
- 已保存的 Work Version
- Finalized Version
- Universe Canon
- Universe Snapshot
- Asset Version
- 旧的合法作品
- 已产生的 Evidence Event

修改应当创建新版本、Candidate、Diff 或新的 Snapshot。并发修改应通过 CAS/版本检查返回冲突，而不是覆盖他人的结果。

### 2.5 所有“看起来能点”的控件必须真实可用

禁止继续出现：

- 卡片看起来可点击但没有目标。
- “取消”按钮没有动作。
- “查看详情”按钮没有路由。
- 任务中心只展示状态、不连接真实 Job。
- 空数据时用演示任务冒充真实数据。
- 服务失败时用静态假成功掩盖问题。

如果功能暂时没有后端能力，必须明确显示禁用状态和原因，而不是伪造可用。

---

## 3. 当前工作流入口

### 3.1 顶级创作模块

当前用户确认的入口为 8 个模块，整齐方格排列，不分组、不再显示顶部自由输入框：

1. 剧本
2. 歌曲
3. 美术
4. 分镜
5. 视频
6. 配音
7. 剪辑
8. 改编

如果旧版 V2.2 PRD 仍只列出 7 个入口，以本交接文档记录的最新用户确认和线上目标为准；后续整理 PRD 时应把“改编”补齐，不能因为旧表格漏列而删除该入口。

小说不再是新建入口。角色、场景、道具统一纳入美术，不再拆成独立顶级模块。

Universe、演员库、社区和任务中心属于全局资源或管理入口，不应与上述创作模块混成另一套重复入口。

### 3.2 新建行为

点击模块后，系统应一次性创建真实的：

- Project
- Primary Work
- 对应的 Work Type
- 稳定的 `projectId` / `workId`

然后直接进入目标工作台。不得再出现“先创建一层空项目，再点击一次入口，再跳另一个工作台”的重复链路。

从首页 Hero 的“开始创作”进入工作台入口；点击已有项目的“打开项目”进入该项目对应的工作台。不要把首页入口和项目入口实现成两套互不相干的创建系统。

### 3.3 旧小说数据

旧小说项目属于废弃数据，不再进入新的产品流程和入口。处理小说数据时必须遵守：

- 不删除其他类型 Project、Work、Universe、Asset 或用户数据。
- 不因为隐藏小说入口而清空整个项目表。
- 任何数据库清理都必须先列出精确目标和影响范围。
- 没有明确授权时，不执行 destructive SQL。
- 新代码不得把旧小说重新显示为可继续创作项目。

---

## 4. 剧本创作台：最重要的业务流程

### 4.1 体验目标

剧本工作台应当是“以 AI 对话为主导”的创作环境，而不是大表单或传统编辑器。

用户应该可以先把想法告诉 KK，经过多轮讨论后，再按三部曲顺序生成正式的项目背景文件，而不是被迫先点击左侧“新建单元”才能开始。

工作台要保持简洁：

- 两栏式布局。
- 左侧是清晰、紧凑的工作流导航和结构节点。
- 右侧是主要创作区域。
- 右侧使用足够大的 AI 对话框。
- 对话内容、输入框和生成动作在同一主区域内完成。
- 不使用三栏式剧本室。
- 不在页面顶部堆叠大量介绍性废话。
- 不用大面积空白挤压真正的输入和生成按钮。
- 生成按钮必须在常见屏幕高度内可见，或使用稳定的 sticky composer。

全局侧边导航不能被工作台隐藏。用户必须能从工作台回到首页、工作台入口、Universe、演员库、社区、任务中心和设置。

### 4.2 三部曲顺序

剧本创作必须按以下顺序生成：

#### 第一步：世界观 / 项目背景

用户与 KK 多轮沟通，KK 帮助整理：

- 项目背景
- 世界观
- 类型和主题
- 核心冲突
- 世界规则
- 叙事边界

用户确认“这是可用版本”后，才把它作为第一阶段的正式可用检查点。用户随时可以回到这一步修改，修改不直接覆盖旧版本。

#### 第二步：角色圣经

第二阶段必须读取已确认可用的世界观内容，并在对话中生成角色圣经，包括：

- 主要角色
- 角色目标和动机
- 人物关系
- 角色弧线
- 角色限制和连续性要求
- 与 Universe 中已有角色的继承或新建关系

角色圣经同样采用“用户确认可用版本”的完成规则，不要求永远锁死。用户可以回到前面修改，并由系统提示下游内容可能变 stale。

#### 第三步：剧情及大纲

第三阶段读取世界观和角色圣经，生成：

- 核心剧情
- 主线与支线
- 冲突推进
- 关键转折
- 结局方向
- 分集或章节结构建议

“雷同审查”应该在这类早期结构阶段参与，而不是等正文已经写完后才首次出现。它是辅助核验，不是法律裁定，也不能把用户卡死在一个不可解释的“待审查”步骤。

三部曲完成的含义是：

> 用户确认当前版本可用；不是系统永久锁定，也不是用户不能返回修改。

### 4.3 对话与生成语义

必须区分以下动作：

- **聊一聊**：只讨论，不修改正文，不创建正式内容版本。
- **生成项目背景 / 生成角色圣经 / 生成剧情大纲**：读取当前阶段和完整对话上下文，生成候选或草稿版本。
- **确认可用**：创建不可变可用版本或检查点，保留确认事实。
- **生成修改方案**：生成可逐块审阅的 Candidate Diff。
- **采用修改**：只写入用户明确采用的块，并创建新版本。

用户在对话框中新增文字后，点击生成/更新必须基于这次最新输入生成。不能只读取上一次快照，也不能只更新“歌词和提示词”等结果字段而丢弃对话。

### 4.4 当前剧本相关实现入口

在当前代码中，优先从这些文件和路由开始阅读：

```text
components/v2/screenplay-studio/ScreenplayStudio.tsx
components/v2/screenplay-studio/KkScreenplayRoom.tsx
components/v2/screenplay-studio/ScreenplayEditor.tsx
components/v2/screenplay-studio/UnitNavigator.tsx
components/v2/screenplay-studio/CandidateDiffPanel.tsx
components/v2/screenplay-studio/StudioRightPanel.tsx
components/v2/screenplay-studio/ContinuityPanel.tsx
components/v2/screenplay-studio/ScreenplayStudio.module.css

lib/client/v2/screenplay-studio/api.ts
lib/client/v2/screenplay-studio/auth.ts
lib/server/v2/screenplays/trilogy.ts
lib/server/v2/screenplays/generation.ts
lib/server/v2/screenplays/units.ts
lib/server/v2/screenplays/document.ts
lib/server/v2/screenplays/continuity.ts
lib/server/v2/screenplays/dependencies.ts

app/api/v2/works/[workId]/screenplay/trilogy/route.ts
app/api/v2/works/[workId]/screenplay/discuss/route.ts
app/api/v2/works/[workId]/screenplay/propose-change/route.ts
app/api/v2/works/[workId]/screenplay/units/route.ts
```

最新剧本 AI-first 逻辑的核心要求：

- 三部曲由对话生成，不能让 UI 再次要求手动新建前三个单元。
- 对话消息是 append-only 的真实记录。
- 正式内容是 immutable version。
- 修改采用 Candidate/Diff + 明确采用，不原地覆盖。
- 旧项目可以通过 legacy adapter 进入新工作台，但不能破坏已有内容。
- 认证失败必须显示真实、可恢复的状态；不能出现页面无声崩溃或反复弹出“未登录”。

### 4.5 最近修复过的高风险问题

2026-08-21 的线上白屏由浏览器原生 `Window.fetch` 被当成未绑定函数传递引起。当前 `lib/client/v2/screenplay-studio/auth.ts` 使用 `globalThis.fetch(...)` 保留正确 receiver，并有回归测试。

如果修改请求认证、Supabase session、自动刷新或 fetch 封装，必须重新运行：

```bash
node --test tests/ui-v2/screenplay-studio/auth.test.mjs
```

不要把 `fetch` 直接作为对象属性传入后再以 `deps.fetcher(...)` 方式调用。

---

## 5. Universe：KIIKIS 的核心差异化能力

### 5.1 从 Universe 创建新作品

用户可以在 Universe 中创建新 Work，例如：

- 续作
- 前传
- 衍生剧
- 平行分支
- 改编作品
- 同一世界观中的歌曲、短片或视觉作品

创建新 Work 时，系统应让用户选择要继承的结构化对象：

- 世界规则
- 角色
- 角色关系
- 时间线
- 场景和资产
- 已确认的 Canon 事实

继承必须记录为 Inheritance Manifest 和 Immutable Snapshot。不能只把一段 Markdown 拼到 prompt 里，也不能把整个 Universe 无差别注入每一次 AI 请求。

### 5.2 站外原作建立 Universe

这是 KIIKIS V2.2 的重要能力。

用户可以通过两种方式建立新 Universe：

#### 方式 A：上传完整剧本

系统保留原文件、来源哈希和 Source Work，然后提取候选角色、世界规则、关系、时间线和剧情结构，交给用户审核。

#### 方式 B：同时上传三份文件

必须同时提供：

1. 世界观
2. 角色圣经
3. 剧情大纲

三份文件通过导入审核台生成 Universe U1。审核完成前，提取结果只能是 candidate，不得直接写入 Canon。

### 5.3 Universe 继承的安全规则

- Universe 可以被绑定，也可以暂时不绑定。
- 绑定不应阻塞用户首次进入工作台。
- 使用 Universe 快照后，Universe 后续更新不会静默覆盖作品。
- 上游变化应标记 stale，并提供查看差异、保留旧版本、生成候选或采用更新等明确动作。
- 新作品不能修改原 Universe 中的原始演员或资产身份。
- 任何写回 Canon 的动作都必须是显式用户行为。
- 站外原作的上传声明不能被系统包装成已完成法律权利裁定。

### 5.4 Universe 相关代码入口

```text
app/universes/page.tsx
app/universes/[universeId]/page.tsx
app/universes/import/[sessionId]/page.tsx

components/v2/universe/UniverseWorkbenchClient.tsx
components/v2/universe/OverviewPanel.tsx
components/v2/universe/BiblePanel.tsx
components/v2/universe/WorksPanel.tsx
components/v2/universe/CanonPanel.tsx
components/v2/universe/AssetsPanel.tsx
components/v2/universe/InboxPanel.tsx
components/v2/universe/ImpactAnalysisPanel.tsx
components/v2/universe-import/UniverseImportWizard.tsx
components/v2/universe-import/UniverseImportReview.tsx

lib/server/v2/universe/
lib/client/v2/universe/
lib/client/v2/universe-import/
```

---

## 6. 统一制作工作台

### 6.1 用户确认的主链

制作工作台应保留一个统一界面，允许在这些阶段之间无缝切换：

```text
剧本 → 美术 → 分镜 → 视频 → 剪辑
```

其中：

- 角色、场景、道具统一在美术管理。
- 分镜是唯一分镜顶级入口，镜头表、宫格、运动预览和视频提示词在同一阶段内组织。
- 视频不是 KIIKIS 的终点。
- 视频之后是剪辑。
- 留痕与导出不是末端页面，而是所有 Work 都能调用的横向能力。

### 6.2 工作台导航

用户偏好的导航形态是：

- 保留全局左侧导航，能够回主页、工作台入口、Universe、演员库、社区、任务中心和设置。
- 制作工作台右上方使用一排紧凑的小导航图标切换阶段。
- 不再使用占据整行的大型顶部阶段导航。
- 不再在工作台中重复一套全局导航。
- 不隐藏用户离开工作台的路径。

规范生产路由是：

```text
/production?projectId=<projectId>&workId=<optionalWorkId>&tab=<script|art|storyboard|video>
```

旧入口可能仍存在兼容页面，例如 `/production-workbench`、`/script-workbench`、`/storyboard-workbench`、`/video-workbench`。修改路由时必须确认它们最终是否解析到统一入口，不能重新创建第二套事实源。

### 6.3 跨工作流来源链

下游 Work 必须知道它来自哪里：

- 来源 Project
- 来源 Work
- 来源 Version 或 Checkpoint
- 来源场景、镜头或资产
- 使用的模型、Provider、生成任务
- 人工选择或修改说明

撤销授权不能破坏已有合法作品和历史 Evidence。临时 Provider URL 只能用于接收和转存，正式 Asset Version 必须保存持久化对象存储引用。

---

## 7. 其他工作流边界

### 7.1 歌曲

歌曲流程用户已经认可，不要因为剧本台改造而重新设计一套复杂流程。

必须保留：

- 历史完整对话。
- 用户每次新增输入。
- 生成时使用最新一条用户输入。
- 生成失败时保留输入、歌词、提示词和旧候选。
- 歌词、风格提示词和参考文件的现有使用方式。
- 重新打开歌曲项目时能够恢复真实对话，而不是只显示最终歌词和 prompt。

优先阅读：

```text
lib/client/v2/song-workbench/session.ts
lib/client/v2/song-workbench/generation.ts
lib/song/prompt.ts
lib/song/universe-links.ts
app/song-workbench/page.tsx
```

不要用“摘要字段”代替真实会话；摘要只能是派生展示。

### 7.2 配音

配音应作为轻量、可替换的 Provider 适配层，不要把第三方工具身份写入 KIIKIS 的 Project、Work 或 Asset 身份。

当前代码已有 Voice Provider 契约和 CosyVoice 适配层，但真实服务是否可用必须通过环境变量和健康检查确认。未配置真实服务时，应显示可执行的不可用状态，不能使用 fixture 冒充成功。

真人声音必须经过权利检查：没有明确授权时只能允许受限的私有试用，不能公开发布或商业授权。

### 7.3 剪辑

剪辑使用 KIIKIS 自己的 `kiikis.timeline/1` 作为持久事实源。第三方时间线编辑器只能编辑 projection。

当前方案使用：

- `@xzdarcy/react-timeline-editor@1.0.0`
- `@webav/av-cliper@1.2.8`

如果浏览器不支持 WebCodecs，必须提供 EDL、FCPXML 或服务端导出的退路，不能让历史时间线丢失。不要引入没有稳定 API 或没有书面确认的 Twick；OpenCut 只有在 API 稳定且经过评估后才可重新讨论。

### 7.4 美术、演员库和演员市场

角色、场景、道具属于美术资产体系。演员库还涉及：

- Actor 身份
- Portrayal / Asset Version
- 使用留痕
- 真人肖像权
- 共享和授权状态
- 购买、订单和创作者收益

其他用户可以使用被授权的演员，但不能修改原始演员身份。真人照片没有确认肖像授权时，不能公开共享或商业授权。

演员市场和 IP 资产社区必须连接真实服务。没有真实 Feed 时显示真实 empty/error 状态，不得显示演示数据。

---

## 8. 项目、Work、版本和证据模型

### 8.1 核心对象关系

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

### 8.2 唯一事实源

| 领域 | 事实源 |
|---|---|
| 项目身份 | 服务端 Project |
| 创作身份 | Work 及其版本 |
| Universe 身份 | Universe + Universe Version |
| Canon | 已审核的结构化 Canon |
| Universe 继承 | Inheritance Manifest + Immutable Snapshot |
| AI 沟通 | append-only Conversation Message |
| AI 生成 | Generation Request Snapshot + Candidate Version |
| 任务状态 | 服务端 Job + Job Event |
| 资产 | Asset + Asset Version |
| 剪辑 | `kiikis.timeline/1` |
| 权利 | Resource Grant / Usage Grant + terms snapshot |
| 留痕 | Evidence Event + manifest + hash |

### 8.3 Evidence 和导出

所有 Work 都应该能够导出两类内容：

1. 成果或定稿包。
2. 创作留痕证据包。

证据包可以记录：

- 创建时间
- 用户输入
- AI 对话和生成请求的引用
- 用户选择
- 版本链
- 来源 Work / Universe / Asset Version
- 发布、授权、导出事件
- 使用的 Provider、模型和任务 ID
- 权利声明和人工确认
- manifest hash / sha256

Evidence 只记录可核验事实，不做法律裁定，也不能让用户误以为下载包自动等同于完整版权证明。

---

## 9. 技术栈和代码结构

### 9.1 技术栈

- Next.js App Router
- React 19
- TypeScript 5.8
- Node.js test runner
- Playwright
- pnpm
- Supabase Auth / Postgres / RLS / Storage
- Vercel
- GitHub：`bayshaw-33/storyflow-ai`

### 9.2 主要目录

```text
app/                         Next.js 页面和 API 路由
components/                  页面组件和工作台 UI
lib/client/                  浏览器端 API、session、view model
lib/server/                  服务端领域逻辑
lib/contracts/               共享契约和 schema
lib/supabase/                Supabase client、queries、auth 辅助
supabase/migrations/         forward-only 数据库迁移
tests/                       Node 契约、服务和 UI 结构测试
e2e/                         Playwright 端到端测试
scripts/                     审计、smoke、构建和目标库门禁
docs/                        PRD、handoff、runbook 和开发规则
```

### 9.3 API 约定

新 API 先阅读同目录现有模式。通常遵守：

- 服务端路由使用 `runtime = "nodejs"` 和 `dynamic = "force-dynamic"`（如场景需要）。
- 服务端必须使用统一认证和 owner / grant / rights 校验。
- 客户端不能直接决定支付成功、Grant Active、公开授权或真人肖像已授权。
- 错误返回包含稳定 `code`，必要时包含安全的 request/correlation ID。
- 日志不得记录 token、secret、私有正文、完整 prompt、Provider 临时 URL 或敏感个人信息。
- V2.2 新接口使用 `contract_version: "2.2.0-alpha.1"`。
- 既有 `2.0.0-alpha.1` 字段不得静默删除、改名或改变语义。

### 9.4 数据库约定

- 不修改已有 migration。
- 新 migration 必须 forward-only、幂等，并使用明确的 V2.2 编号。
- 不执行未经授权的 `DROP TABLE`、大范围 DELETE 或全库清理。
- 迁移前先确认目标库，不要根据 `.env.example` 猜目标。
- 真实生产数据和 staging 数据必须分开核验。
- append-only 数据不得提供普通 UPDATE/DELETE 路径。

---

## 10. 当前代码、分支和部署事实

### 10.1 当前交接基线

本交接文档是在当前恢复工作副本中生成的。当前代码基线：

```text
branch: codex/v22-unified-workbench-recovery
origin/main: b3ba9c1a
latest commit: fix(screenplay): preserve browser fetch context
```

新的 Codex 默认应从最新 `origin/main` 创建干净 worktree，不要直接复用一个存在未提交改动的目录。

当前提交之后，剧本相关关键验证已经实际通过：

- 剧本相关测试：95/95
- `npx tsc --noEmit`：通过
- `pnpm build`：通过
- 线上首页：HTTP 200
- 未登录剧本 API：正确返回 401，而不是伪造成功

### 10.2 生产与 staging

生产 Supabase：

```text
project name: StoryFlow
project ref: vgcafbzksizlwmylphzu
用途：kiikis.com 实际生产数据库
```

历史演练库：

```text
project name: kiikis-staging
project ref: cwpyolxitkcpitqizgtq
用途：隔离演练和 migration 验证
```

不要因为看到 `kiikis-staging` 就创建一个同名新项目。也不要在没有确认目标的情况下把生产迁移推到 staging，或把本地 `.env.local` 当成生产事实。

每次涉及 Supabase 写操作前执行：

```bash
node scripts/verify-supabase-target.mjs --status
node scripts/verify-supabase-target.mjs production
```

只有输出“门禁通过”后，才允许对生产执行 migration 或其他写操作。需要操作 staging 时明确执行 `staging` 检查，并在 handoff 中记录。

### 10.3 Vercel

生产通常由 GitHub `main` push 触发 Vercel 自动部署。不要只在本地运行 build 后就声称线上已更新。

上线后至少核验：

```bash
curl -sSIL --max-time 20 https://www.kiikis.com/
```

再根据本次改动检查对应页面和 API。若 Vercel CLI 报 `Not authorized`，优先检查 GitHub → Vercel 集成和 main 的部署状态，不要反复猜 token。

### 10.4 当前权威工作区的注意事项

历史文档中曾经要求以 NAS 作为权威开发目录，但当前长期协作约定已经调整为：

- `/Users/kiikis000/Documents/Kiikis/storyflow-ai` 是本机 canonical checkout。
- NAS 只作为备份/恢复来源，除非当前任务明确要求读取或恢复。
- 不要在 NAS 副本直接安装依赖、构建、写代码或提交。
- 每次接手先检查 canonical checkout 是否干净、是否落后于 `origin/main`。

如果某份旧 handoff、NAS 文档或本地副本与 GitHub `origin/main` 冲突，先停止修改，列出冲突，再以当前用户指示和最新 GitHub 代码为准。

---

## 11. 开工标准流程

### 11.1 阅读顺序

每次接手新任务，建议按以下顺序读取：

1. 本文件 `docs/KIIKIS_CODEX_ONBOARDING_V2.2.md`。
2. `docs/kiikis-2.2/KIIKIS-2.2-总PRD-v1.0.md`。
3. `docs/kiikis-2.2/KIIKIS-V2.2-统一制作工作台恢复-PRD-v1.0.md`。
4. `docs/kiikis-2.2/TRAE/README.md`。
5. 当前任务对应的 Phase 文件。
6. 最新 `docs/DEV_HANDOFF_LOG.md` 和相关 `handoffs/`。
7. 目标页面、组件、client API、server service、route 和测试。

不要一次性把所有 Phase、所有旧 PRD 和所有历史日志都读入上下文。按任务范围渐进读取。

### 11.2 开工前命令

```bash
git fetch origin
git status --short --branch
git rev-parse origin/main
git log -8 --oneline --decorate origin/main
```

在干净 worktree 中从 `origin/main` 建立任务分支。记录：

- base commit
- 当前分支
- 未提交改动
- 是否涉及 migration
- 是否涉及 production 数据
- 验收标准

### 11.3 先测试再实现

对于 bug：

1. 先阅读完整错误信息。
2. 确认是否能够稳定复现。
3. 检查最近提交和数据流。
4. 写最小失败测试。
5. 只做一个根因修复。
6. 再跑 focused test、相关回归、类型检查和 build。

对于新功能：

1. 先写契约或行为测试。
2. 再写 server/domain 逻辑。
3. 再接 client/UI。
4. 最后补 E2E、handoff 和部署核验。

不要为了快速通过测试而打开 fixture、降低断言或把真实服务错误变成 200。

### 11.4 常用验证

```bash
# 资产和构建
pnpm validate-assets
npx tsc --noEmit
pnpm build

# 全量旧测试
pnpm test:unit

# V2.2 审计
pnpm audit:kiikis22
pnpm smoke:kiikis22

# 浏览器 E2E
pnpm test:e2e:chromium
```

如果 `package.json` 中没有某个用户要求的 script，不要假装它存在。直接使用仓库已有的命令，例如：

```bash
node --test tests/server-v2/screenplays/*.test.mjs
```

### 11.5 收工标准

每次变更结束时：

- `git diff --check`
- 运行与变更范围匹配的测试
- 运行 `npx tsc --noEmit`
- 运行 `pnpm build`
- 检查 `git diff`，确认没有误改共享文件或敏感信息
- 更新 `docs/DEV_HANDOFF_LOG.md`
- 记录 branch、commit、验证、部署和未完成风险

只有用户明确授权时才做生产 migration、生产数据清理、合并和全量发布。发布前需要明确的 `RELEASE APPROVED`。

---

## 12. 绝对不能做的事情

### 产品层禁区

- 不要把 KIIKIS 改成视频制作平台。
- 不要恢复小说新建入口或继续产生小说 Work。
- 不要把角色、场景、道具拆成新的顶级入口。
- 不要重新引入三栏剧本室。
- 不要用大而空的顶部导航覆盖创作区域。
- 不要隐藏全局左侧导航。
- 不要用展示型卡片冒充真实功能。
- 不要让用户必须先定稿才能探索下一阶段。
- 不要把雷同审查放成一进页面就卡住的强制门禁。
- 不要让 AI 默认静默改正文。
- 不要把 Universe 做成一个只能查看的装饰页面。

### 数据和安全禁区

- 不要删除其他项目来清理小说数据。
- 不要在没有目标库门禁的情况下执行 `supabase db push`。
- 不要修改历史 migration。
- 不要把 production key、Supabase service role key、用户密码或 session token 写入 Markdown、日志或提交。
- 不要在客户端判断支付成功、授权有效、真人肖像已确认或 Grant Active。
- 不要让 Provider 临时 URL 成为正式资产版本的唯一地址。
- 不要让 revoked grant 删除已有合法作品或历史 Evidence。
- 不要用 service role 绕过服务层权利校验。
- 不要将私有正文、prompt、token 或 secret 写入公开错误响应。

### 协作禁区

- 不要直接在 dirty worktree 上覆盖别人改动。
- 不要把过时分支当作当前主线。
- 不要只读旧 handoff 就声称当前线上已完成。
- 不要在用户没有明确授权时合并、推生产或应用生产 migration。
- 不要把本地测试通过写成真实生产 UAT 通过。
- 不要隐藏失败；失败要记录稳定错误码、证据和下一步。

---

## 13. 给下一位 Codex 的第一轮任务清单

开始具体开发前，先完成以下检查：

### 基线

- [ ] 确认当前使用的是 canonical checkout 或干净 worktree。
- [ ] `git fetch origin` 后确认 `origin/main`。
- [ ] 阅读本文件、V2.2 总 PRD、统一制作工作台 PRD 和最新 handoff。
- [ ] 确认线上最新部署对应的 commit。
- [ ] 运行 `node scripts/verify-supabase-target.mjs --status`。

### 产品

- [ ] 确认 8 个入口仍是：剧本、歌曲、美术、分镜、视频、配音、剪辑、改编。
- [ ] 确认小说不出现在新建入口和项目继续创作列表。
- [ ] 确认剧本台是两栏 + 大 AI 对话框，而不是三栏。
- [ ] 确认剧本三部曲按世界观 → 角色圣经 → 剧情大纲生成。
- [ ] 确认第一步进入后不会要求手动点击新建单元。
- [ ] 确认工作台仍可看到 Universe 创建/绑定入口和全局导航。
- [ ] 确认制作链能在剧本、美术、分镜、视频之间统一切换，并能进入剪辑。

### 工程

- [ ] 确认对话重开后消息没有丢失。
- [ ] 确认最新用户输入进入生成 Snapshot。
- [ ] 确认生成失败不会覆盖输入、旧候选或旧版本。
- [ ] 确认版本保存是 immutable + CAS，而不是原地 UPDATE。
- [ ] 确认真实 API 错误不会被 fixture 掩盖。
- [ ] 确认 Evidence 和成果导出都有真实目标。
- [ ] 确认修改认证请求时覆盖 `Window.fetch` receiver 回归测试。

### 交接

- [ ] 写清 Task ID、Branch、Base commit、Changed files、Tests、Known risks。
- [ ] 在 `docs/DEV_HANDOFF_LOG.md` 记录变更。
- [ ] 若涉及发布或生产数据库，单独记录授权、目标、时间和核验结果。

---

## 14. 相关文档索引

### 产品与版本

- [`docs/kiikis-2.2/KIIKIS-2.2-总PRD-v1.0.md`](./kiikis-2.2/KIIKIS-2.2-总PRD-v1.0.md)
- [`docs/kiikis-2.2/KIIKIS-V2.2-统一制作工作台恢复-PRD-v1.0.md`](./kiikis-2.2/KIIKIS-V2.2-统一制作工作台恢复-PRD-v1.0.md)
- [`docs/kiikis-2.2/TRAE/README.md`](./kiikis-2.2/TRAE/README.md)

### 剧本与工作台

- [`docs/kiikis-2.2/TRAE/03-Phase-3-最好用的剧本室.md`](./kiikis-2.2/TRAE/03-Phase-3-最好用的剧本室.md)
- [`docs/kiikis-2.2/TRAE/05-Phase-5-全工作流融合与横向导出.md`](./kiikis-2.2/TRAE/05-Phase-5-全工作流融合与横向导出.md)
- [`docs/DEV_HANDOFF_LOG.md`](./DEV_HANDOFF_LOG.md)
- [`docs/CODEX_HANDOFF_SOP.md`](./CODEX_HANDOFF_SOP.md)

### 发布与环境

- [`docs/kiikis-2.2/release/V2.2-release-runbook.md`](./kiikis-2.2/release/V2.2-release-runbook.md)
- [`docs/kiikis-2.2/release/V2.2-rollback-runbook.md`](./kiikis-2.2/release/V2.2-rollback-runbook.md)
- [`docs/kiikis-2.2/release/V2.2-known-risks.md`](./kiikis-2.2/release/V2.2-known-risks.md)
- [`scripts/verify-supabase-target.mjs`](../scripts/verify-supabase-target.mjs)

### 旧文档说明

仓库中的 `docs/CODEX_TEAMMATE_ONBOARDING.md` 是早期协作说明，包含过时的小说流程和不应继续传播的敏感信息。新 Codex 应以本文件、最新代码、最新 `origin/main` 和最新 handoff 为准，不要复制旧文档中的账号、密码或其他凭证。

---

## 15. 最后给接手者的一句话

先保护 KIIKIS 的长期身份，再增加短期功能；先让真实创作链路可用，再扩展边角能力；先让用户能与 KK 顺畅地创作和回到自己的 Universe，再谈更多 AI 工具。

**每一次实现都应该让 KIIKIS 更像一个可持续演化的创作宇宙，而不是更多按钮的集合。**
