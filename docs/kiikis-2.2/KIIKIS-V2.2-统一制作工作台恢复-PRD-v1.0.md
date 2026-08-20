# KIIKIS V2.2 统一制作工作台恢复 PRD

> 版本：v1.0
> 日期：2026-08-20
> 状态：已确认，进入实施规划
> contract_version：`2.2.0-alpha.1`
> 优先级：P0
> 设计基线：`docs/superpowers/specs/2026-08-20-unified-production-workbench-recovery-design.md`

## 0. 执行摘要

KIIKIS 当前同时存在独立剧本室与旧制作工作台，两套页面分别维护路由、项目身份、鉴权和界面状态，导致用户在“剧本—美术—分镜—视频”之间反复跳页、上下文割裂，并出现生产数据库缺表、鉴权不一致和服务不可用等问题。

本专项恢复一个统一制作工作台：同一 Project 内固定显示“剧本、美术、分镜、视频”四个顶级阶段；AI 对话型剧本室嵌入“剧本”阶段；“动态分镜”并入“分镜”；Universe、版本、成果和留痕贯穿四个阶段。恢复过程中不得删除任何现有项目、剧本、版本、资产、分镜、视频或 Universe 数据。

## 1. 产品目标

### 1.1 必须达成

| ID | 目标 | 优先级 |
|---|---|---|
| K22-UW-G01 | 一个项目只进入一个统一制作工作台 | P0 |
| K22-UW-G02 | 顶部固定“剧本—美术—分镜—视频”四阶段 | P0 |
| K22-UW-G03 | 剧本阶段为真正两栏，右侧大型 AI 对话主导 | P0 |
| K22-UW-G04 | 旧剧本项目和生产数据完整保留并可继续创作 | P0 |
| K22-UW-G05 | Cookie/Bearer、旧项目解析和 API 鉴权统一 | P0 |
| K22-UW-G06 | 动态宫格、运动预览和视频提示词并入单一分镜阶段 | P0 |
| K22-UW-G07 | Universe、版本、Evidence 和导出贯穿四阶段 | P0 |
| K22-UW-G08 | 使用真实长剧本完成端到端线上核验 | P0 |

### 1.2 明确不做

- 不恢复小说入口、小说配置或小说数据展示。
- 不把歌曲、配音或剪辑强行塞进四阶段顶栏。
- 不重做歌曲工作台、配音工作台或剪辑工作台。
- 不恢复独立“动态分镜”顶级页面。
- 不建立第二套 Project、Work、Universe 或 Asset 身份。
- 不创建名为 `kiikis-staging` 的新 Supabase 项目。
- 不通过删除生产数据解决 schema、路由或兼容问题。
- 不宣称 Evidence 等同于法律裁定。

## 2. 核心用户旅程

### 2.1 新剧本项目

```text
首页开始创作 / 工作台新建项目
→ 八模块入口选择“剧本”
→ 原子创建 Project + primary Script Work
→ /production?projectId=...&workId=...&tab=script
→ 与 KK 完成世界观、角色圣经、剧情及大纲
→ 分集计划与剧本正文
→ 同页切换美术、分镜、视频
```

### 2.2 旧剧本项目

```text
项目管理 / Universe / 旧链接打开项目
→ 解析 projectId 对应 primary Script Work
→ 保留原项目和原内容
→ 进入统一制作工作台“剧本”阶段
→ 恢复历史对话、当前节点、版本与 Universe
```

无法解析 Work 的项目不得消失，必须显示“需要修复关联”并提供重试或人工修复入口。

### 2.3 跨阶段制作

```text
已确认剧本版本
→ 美术读取角色、场景、道具和 Universe 身份
→ 分镜读取明确的剧本/美术版本
→ 视频读取明确的镜头和提示词版本
→ 任一产物可反查来源版本
```

阶段切换不重新创建 Project，不丢失当前集、场、输入内容或未提交候选。

## 3. 唯一事实源与身份模型

### 3.1 Project 与 Work

- Project 是统一制作工作台的容器身份。
- Script、Art、Storyboard、Video 分别是同一 Project 下的专业 Work。
- 一个阶段没有 Work 时，页面仍可切换并显示真实空状态；第一次开始该阶段时，通过幂等服务创建 Work。
- 阶段 Work 创建不得复制整个项目或伪造本地 ID。
- 下游正式产物通过 `storyflow_work_usage_links` 锁定来源 Work Version。

### 3.2 统一上下文契约

新增统一上下文契约：

```ts
export type UnifiedProductionStage = "script" | "art" | "storyboard" | "video";

export interface UnifiedWorkbenchContextV1 {
  contractVersion: "2.2.0-alpha.1";
  project: {
    id: string;
    title: string;
    ownerId: string;
  };
  universe: {
    id: string;
    name: string;
    versionId: string | null;
    hasUpdate: boolean;
  } | null;
  stages: Record<UnifiedProductionStage, {
    workId: string;
    status: "editing_draft" | "checkpoint" | "finalized" | "archived";
    currentVersionId: string | null;
    updatedAt: string;
  } | null>;
  legacy: {
    sourceUnitId: string | null;
    resolvedFromProjectOnly: boolean;
  };
}
```

前端不得自行拼装另一套项目/Work 映射。

### 3.3 Stage Work 幂等创建

首次开始美术、分镜或视频阶段时，调用：

```text
POST /api/v2/projects/:projectId/workbench-stages/:stage/ensure
```

服务端必须：

1. 从认证上下文取得 ownerId。
2. 校验 Project 所有权或有效协作权限。
3. 在事务内查找同 Project、同 WorkType 的当前非 archived Work。
4. 已存在则返回原 Work；不存在才创建。
5. 并发重复请求返回同一个 Work。
6. 客户端不得供应 ownerId。

## 4. 路由与入口

### 4.1 规范路由

```text
/production?projectId=<projectId>&workId=<optionalWorkId>&tab=<script|art|storyboard|video>&unitId=<optionalUnitId>
```

- `projectId` 决定统一工作台容器。
- `workId` 是当前阶段 Work；已有阶段必须携带，尚未开始的空阶段可以暂时省略。
- `unitId` 只定位剧本单元、集、场或旧制作单元，不再是打开整个项目的硬门禁。
- `tab` 刷新后保持。

### 4.2 统一入口要求

| 入口 | 目标 |
|---|---|
| 首页 Hero“开始创作” | `/projects/new-v2` |
| 左侧“工作台” | 项目管理；“新建项目”进入 `/projects/new-v2` |
| 新建剧本 | 统一 `/production?...&tab=script` |
| 项目管理打开剧本 | 统一 `/production?...&tab=script` |
| Universe 打开剧本 | 统一 `/production?...&tab=script` |
| 任务中心查看结果 | 根据 WorkType 进入统一 `/production` 对应阶段 |

### 4.3 旧路由兼容

- `/script-workbench` 解析参数后进入 `tab=script`。
- `/production-workbench` 解析参数后进入统一工作台。
- `/storyboard-workbench` 进入 `tab=storyboard`。
- 旧动态分镜参数进入 `tab=storyboard` 并保留 scene/shot 定位。
- `/art-workbench` 和 `/video-workbench` 在有 Project/Work 身份时进入统一工作台对应阶段；没有项目身份的独立资产或工具模式继续保留原专业页面。

兼容入口至少保留一个完整版本周期。

## 5. 统一工作台界面

### 5.1 顶部项目栏

固定显示：

- 返回项目管理。
- 项目名称和作品类型。
- Universe 状态及版本。
- 自动保存状态。
- 版本。
- 成果与留痕。
- 更多操作。

“更多”可以承载项目设置、分享和辅助操作；不得放置主要阶段导航。

### 5.2 四阶段导航

```text
剧本 | 美术 | 分镜 | 视频
```

- 切换采用客户端状态和规范 URL 同步，不整页刷新。
- 目标阶段尚无 Work 时，先以 `projectId + tab` 显示真实空状态；用户点击“开始本阶段”后幂等创建，并把返回的 `workId` 写回规范 URL。
- 切换过程中保留上一阶段尚未提交的输入，并在离开前提示未保存内容。
- 禁止再次出现“动态分镜”顶级 Tab。

## 6. 剧本阶段

### 6.1 布局

桌面端只允许两栏：

```text
左侧剧本流程栏 | 右侧大型 AI 创作主区
```

进入统一制作工作台后折叠全局大侧栏。当前稿和版本对比只能在右侧主区内切换，不得永久形成第三栏，也不得堆到对话区下方。

### 6.2 剧本流程

左栏固定显示：

1. 世界观。
2. 角色圣经。
3. 剧情及大纲。
4. 分集计划。
5. 剧本正文。

世界观、角色圣经、剧情及大纲构成不可改变的“三部曲”。

节点状态：

- 未开始。
- 创作中。
- 当前可用版本。
- 可能需要同步。
- 存在冲突。

“确认可用”不等于锁死。用户可随时返回修改；上游修改只标记依赖 stale，不删除下游。

### 6.3 AI 对话

右侧主区默认进入“对话”，并提供：

- 对话。
- 当前稿。
- 版本对比。

功能要求：

| ID | 要求 |
|---|---|
| K22-UW-S01 | 重开项目恢复完整真实消息顺序 |
| K22-UW-S02 | 当前输入先持久化，再生成 Context Snapshot |
| K22-UW-S03 | “聊一聊”只追加消息，不修改正文 |
| K22-UW-S04 | “生成修改方案”只创建 Candidate |
| K22-UW-S05 | 用户逐块采用后才创建新 Work Version |
| K22-UW-S06 | 生成失败保留输入和现有成果 |
| K22-UW-S07 | 可指定整部、集、场和文本范围 |
| K22-UW-S08 | 冲突返回 409，不静默覆盖 |

### 6.4 雷同审查、本土化与正式格式

- 删除翻译入口。
- 雷同审查嵌套在“剧情及大纲”节点内。
- 大纲不存在或没有可用版本时，雷同审查禁用并说明原因。
- 本土化是常驻工具，可以作用于任一剧本节点。
- 正式剧本按用户已确认样本格式导出。
- 雷同审查只做辅助风险提示，不做法律裁定。

## 7. 美术阶段

- 角色、场景和道具统一在美术阶段内分类。
- 嵌入模式隐藏独立项目创建和项目切换能力。
- 草稿键必须按 ownerId/projectId/workId 作用域隔离。
- 每个资产显示 Universe Entity、Asset Identity、Asset Version 和来源 Script Version。
- 切换项目时不得读取其他项目的本地美术草稿。

## 8. 分镜阶段

单一分镜阶段包含：

- 镜头表。
- 4/6/9/12 宫格。
- 动态运动预览。
- 视频提示词。
- 人工修改与锁定。
- 版本 Diff。
- 确定性导出。

旧 `DynamicGridEditor` 作为分镜内部子视图继续复用，但不再拥有顶级 Tab 或独立项目入口。

## 9. 视频阶段

- 只读取明确选定的 Storyboard Version 和 Prompt Version。
- Job 记录 Shot、Provider、Model、参数和来源版本。
- 失败、重试和替换保留历史。
- Provider 临时 URL 只用于 ingestion；正式 Ready 结果必须指向持久化对象存储。
- 视频完成后提供“进入剪辑”。

## 10. Universe、版本和 Evidence

### 10.1 Universe

顶部始终显示：

- 未绑定。
- 已绑定 Universe 与版本。
- 存在可升级版本。
- 当前 Work 产生的 Canon 候选。

系统不得自动创建空 Universe，不得静默升级项目快照，也不得静默写入 Canon。

### 10.2 版本

每个正式产物使用不可变版本。上游更新时，下游已有产物继续保留并标记 stale，用户可选择继续旧版本或创建新候选。

### 10.3 成果与留痕

任一阶段都能导出：

- 当前成果和已确认版本。
- 消息、生成、候选、采用和拒绝记录。
- 版本与来源谱系。
- Universe 引用。
- 模型、任务和时间信息。
- Evidence Event manifest。

## 11. 鉴权、错误与服务恢复

### 11.1 鉴权

- 客户端统一使用现有 `fetchScreenplayStudio` Bearer 适配。
- 服务端统一使用 `authenticateRequest(request)`，并保留 Cookie 兜底。
- 页面不得使用裸 `fetch` 实现第二套认证逻辑。
- ownerId 只能来自服务端认证上下文。

### 11.2 错误映射

| code | HTTP | 用户文案 |
|---|---:|---|
| unauthenticated | 401 | 登录状态已失效，请重新登录后继续。 |
| forbidden | 403 | 你没有访问这个项目的权限。 |
| not_found | 404 | 找不到该项目或作品，可能需要修复旧项目关联。 |
| schema_missing | 503 | 创作数据服务尚未完成升级，当前内容未丢失。 |
| service_unavailable | 503 | 数据服务暂时不可用，请稍后重试。 |
| conflict | 409 | 云端已有更新，请选择加载最新版本或另存为新版本。 |

错误必须携带 correlationId。禁止继续统一显示 `Screenplay service unavailable`。

## 12. 生产数据保护

### 12.1 发布前只读盘点

必须记录：

- Supabase Project Ref、URL host 和 migration history。
- `storyflow_projects` 总量和按 workflow_type 分布。
- `storyflow_works` 总量和按 work_type 分布。
- Script Project、Screenplay Unit、Version、Conversation、Generation Candidate 数量。
- Project 无 Work、Work 无 Project、Unit 无 Work 等孤儿数量。

盘点报告不得包含密码、service role key、JWT 或用户正文。

### 12.2 migration 闸门

- 执行前验证目标数据库 Project Ref 与 Vercel Production 环境一致。
- 执行前生成可恢复备份或平台快照。
- 仅应用仓库中缺失的 canonical migrations。
- migration 只允许 additive 或可兼容修复。
- 不执行 DROP 项目表、TRUNCATE 或无条件 DELETE。
- 不新建 `kiikis-staging` Supabase 项目。

### 12.3 旧数据兼容

- 旧 projectId 只读解析 primary Work。
- 原项目无法解析时显示修复状态，不隐藏项目。
- 不复制正文覆盖新表，不将旧项目误判为小说后删除。
- 任何修复都必须可重复运行且结果幂等。

## 13. 非功能要求

### 13.1 性能

- 首屏不等待美术、分镜和视频全量数据。
- 当前阶段按需加载；切换后缓存已加载状态。
- 长对话分页或虚拟化，默认只载入最近窗口并可向上加载。
- 10 集 × 20 场长剧本切换节点时不得整部重新序列化。

### 13.2 可访问性

- Tab 使用 `role=tablist/tab/tabpanel`。
- 所有按钮可键盘操作并具有可见焦点。
- 错误使用 `role=alert`，加载状态使用 `aria-busy`。
- 窄屏将流程栏折叠为抽屉或阶段选择器。

### 13.3 安全

- 外部 URL 不得成为应用内跳转目标。
- 所有 projectId/workId/unitId 在服务端验证所有权。
- 正式媒体不得暴露 Provider 临时 URL。
- 导出包不包含 secret、未授权原始声音或私密 Provider 参数。

## 14. 分阶段任务

### Phase 0：生产数据与目标环境闸门

**交付：** 只读盘点报告、数据库目标验证、备份确认、缺失 migration 列表。
**Gate：** 未确认正确生产 Project Ref、备份和缺失 migration 前，禁止数据库写入。

### Phase 1：鉴权与统一上下文服务

**交付：** 统一上下文契约、Project/Stage Work 查询与幂等创建、错误映射、生产缺表恢复。
**Gate：** 真实账号可以读取旧剧本项目；API 不再返回泛化鉴权或缺表错误。

### Phase 2：统一路由与入口

**交付：** `/production` 规范路由、共享 resolver、旧路由兼容、所有入口统一。
**Gate：** 首页、项目管理、Universe、任务中心和旧链接进入同一项目与正确阶段。

### Phase 3：四阶段工作台壳

**交付：** Mockup 对应顶部项目栏、四阶段 Tab、Universe/版本/Evidence 横向能力、未保存保护。
**Gate：** 四阶段切换不整页刷新、不丢状态，动态分镜不再作为顶级 Tab。

### Phase 4：AI 剧本嵌入

**交付：** 两栏剧本布局、持久对话、当前稿/版本对比主区切换、三部曲、雷同审查、本土化。
**Gate：** 真实剧本项目重开恢复消息；候选未经采用不修改正文；长剧本测试通过。

### Phase 5：美术、分镜、视频融合

**交付：** 美术嵌入、单一分镜阶段、视频来源版本、跨 Work Usage Link。
**Gate：** 剧本→美术→分镜→视频使用同一 Project，任一产物可反查来源版本。

### Phase 6：真实项目验收与发布

**交付：** 自动测试、真实长剧本手工验收、Vercel Production 发布、线上回归和回滚记录。
**Gate：** 用户确认工作台可用，且现有朋友创建的剧本项目仍可见、可打开、可继续创作。

## 15. 验证命令

```bash
node --test \
  tests/screenplay-entry-routing.test.mjs \
  tests/ui-v2/navigation/resolver.test.mjs \
  tests/ui-v2/screenplay-studio/*.test.mjs \
  tests/ui-v2/workbench-shell/*.test.mjs \
  tests/server-v2/project-start/*.test.mjs \
  tests/server-v2/project-library/*.test.mjs \
  tests/server-v2/screenplays/*.test.mjs \
  tests/production-scope.test.mjs \
  tests/production-draft-recovery.test.mjs \
  tests/production-e2e-flow.test.mjs \
  tests/art-workbench-production-regressions.test.mjs \
  tests/storyboard-e2e-scenarios.test.mjs

npx playwright test \
  e2e/v22-unified-production-workbench.spec.ts \
  e2e/v22-screenplay-production-recovery.spec.ts \
  --project=chromium

npx tsc --noEmit
pnpm build
```

数据库发布前后执行：

```bash
pnpm verify:supabase-target
pnpm audit:kiikis22
pnpm smoke:kiikis22
```

## 16. 最终验收

1. 线上只存在一个正式制作工作台入口。
2. 顶部只有剧本、美术、分镜、视频四个阶段。
3. 剧本桌面端只有流程栏和大型 AI 主区两列。
4. 世界观、角色圣经、剧情及大纲三部曲保持不变。
5. 翻译不存在；雷同审查位于大纲；本土化可作用于任一节点。
6. 当前稿和版本对比不形成永久第三栏。
7. 动态宫格位于分镜内部。
8. Universe、版本、成果与留痕贯穿四阶段。
9. 旧项目、旧链接和真实长剧本可以恢复并继续创作。
10. 生产数据库未删除任何非小说项目或创作数据。
11. 不再出现无说明的 `Authentication required` 或 `Screenplay service unavailable`。
12. 发布后由真实账号在线完成剧本→美术→分镜→视频路径。
