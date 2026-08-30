# Kiikis P0 白模到视频闭环设计

日期：2026-08-30  
状态：待用户确认后实施  
基线：`origin/main@cd58559d`

## 1. 目标

本轮只完成复评报告中的三项 P0：

1. 白模采用版本真正进入视频生成请求，输入和结果均可回溯。
2. 在现有制作工作台中打通剧本、资产、分镜、白模、视频和导出，并支持中断恢复。
3. 任务状态明确区分排队、已受理、执行、结果转存、成功、失败和提交状态未知，并提供安全恢复动作。

P1 在 P0 验收后另行设计和实施；P2 通用节点画布不进入本轮。

## 2. 不可破坏约束：冻结现有工作台布局

用户已明确确认现有工作台框架和布局良好。本轮采用“零布局改造”，以下内容视为发布阻断条件：

- 不增加或删除顶层制作阶段，不改变现有阶段顺序。
- 不增加侧栏、列、固定面板或新的顶层页面入口。
- 不调整 `ProductionWorkbench` 顶栏、阶段栏、内容区和任务区的宽高、栅格或响应式断点。
- 不调整白模导演台现有 `主视口 + 250px 检查器` 双栏比例、时间轴位置或画布尺寸。
- 不压缩剧本、资产、分镜、白模、视频或导出区域。
- 不修改 `ProductionWorkbench.module.css`、`WhiteModelPrevis.module.css`、工作台壳 CSS 或 `app/globals.css` 的布局规则。
- 不把状态详情常驻堆进页面；需要展开的信息使用现有 Modal/Popover 覆盖层。

允许的界面变化仅限：

- 复用白模工具栏现有“导出视频交付包”按钮位置，将其升级为“保存并送视频”；按钮数量和工具栏结构不变。
- 复用现有视频卡片的“生成视频”按钮；点击后用既有 Modal 展示本次采用条件并确认提交。
- 复用现有状态徽标、错误区和任务栏展示更准确的状态文案与恢复动作。

## 3. 方案选择

### 方案 A：浏览器本地桥接

视频页读取当前 `localStorage` handoff。实现最快，但无法跨设备恢复、无法保证 adopted version，也无法可靠追溯结果。拒绝。

### 方案 B：复用通用版本库和现有视频 Job（采用）

白模版本作为 `storyflow_versions` 中的不可变 `previs_scene` 快照保存；视频请求继续使用现有 `storyflow_generation_jobs` 和视频 Provider/Gateway。无需新建数据库表，也不改变工作台结构。

### 方案 C：新建白模表和独立工作流引擎

审计能力最强，但需要迁移、双写和新 UI，改动面过大，容易破坏当前已稳定框架。P0 不采用。

## 4. 核心数据契约

### 4.1 白模版本

每次用户点击“保存并送视频”创建一个不可变版本：

```ts
type PrevisVersionSnapshotV1 = {
  schemaVersion: 1;
  kind: "kiikis.previs.version";
  projectId: string;
  workId: string;
  sourceUnitId: string;
  storyboardRevision: number;
  sceneId: string;
  shotId: string;
  shotLabel: string;
  previs: PrevisScene;
  adoptedInput: {
    firstframeJobId: string;
    firstframeUrlAtSave: string;
    prompt: string;
    promptInputHash: string | null;
    referenceVersionIds: string[];
    durationSeconds: 5 | 10;
    aspectRatio: "9:16";
  };
  capabilityTranslation: {
    mode: "firstframe_prompt" | "native_motion_reference";
    preserved: string[];
    lossy: string[];
  };
  snapshotHash: string;
  createdAt: string;
};
```

存储位置：

- `storyflow_versions.entity_type = 'previs_scene'`
- `entity_id = shotId`
- `project_id = projectId`
- `step_key = 'storyboard'`
- `snapshot_json = PrevisVersionSnapshotV1`
- `source = 'manual'`

该表和索引已经存在，本轮不增加 Supabase 迁移。

### 4.2 首帧与提示词的真实性

- 浏览器不得自行决定或伪造首帧 URL。
- 保存白模版本时，服务端按 owner、project、shot 校验已确认分镜，并记录生成该首帧的真实 image job ID。
- 提交视频时，服务端用该 job ID 重新解析首帧，不静默换成“最新一张图”。
- 若原首帧已不可访问或与项目、镜头不匹配，阻止提交并要求重新保存白模版本。
- 提示词、引用版本和白模快照一并计算 `snapshotHash`；提交时再次校验。

### 4.3 视频 Job 追溯

沿用 `storyflow_generation_jobs`，在 `input_params` / `result_metadata` 中增加：

```ts
{
  previsVersionId,
  previsSnapshotHash,
  firstframeJobId,
  capabilityTranslation,
  adoptedAt
}
```

生成结果由 job ID 反查 adopted version；旧结果不会因局部重试被删除或覆盖。

## 5. 用户流程

### 5.1 白模阶段

1. 用户仍在现有“分镜 → 运动预览 → 白模预演”中工作。
2. 用户选择镜头并调整机位、对象和关键帧。
3. 点击现有工具栏位置里的“保存并送视频”。
4. 服务端保存不可变白模版本；成功后切换到现有“视频”阶段，并定位同一 shot。
5. 本地 JSON 导出仍保留为辅助能力，但不再被当作生产交付闭环。

### 5.2 视频阶段

1. 用户点击现有视频卡片中的“生成视频”。
2. 弹出既有样式的确认 Modal，展示：白模版本、首帧、实际提示词、参考版本、模型可接受条件，以及无法原样传递的轨迹信息。
3. 用户确认后提交；不自动消耗额度。
4. Job 记录 adopted version，视频完成后可从详情回看来源。

### 5.3 中断恢复

- URL 继续使用现有 `projectId/workId/unitId/tab` 身份，不另建入口。
- 页面重开后读取该 shot 最新已保存白模版本和持久化视频 Job。
- 若存在未提交白模本地修改，沿用现有未保存提醒；不会静默覆盖云端版本。
- 已完成视频始终保留；重试只创建新 Job，并在成功后允许用户选择新结果。

## 6. Provider 能力边界

本轮不假装所有模型都支持三维轨迹：

- Provider 只支持首帧和文本时，`mode = firstframe_prompt`，明确列出轨迹、走位和精确焦点变化属于有损转译。
- Provider 支持原生 motion/reference 输入时，才传对应条件并标记 `native_motion_reference`。
- UI 展示的是实际采用条件，不展示未传给 Provider 的“假控制项”。

## 7. 任务状态与恢复

数据库主状态继续遵守现有 CHECK 约束；细状态放入 `result_metadata.sub_status`：

| 用户状态 | 主状态 | 子状态 | 恢复动作 |
|---|---|---|---|
| 排队 | queued | queued | 可取消 |
| 已受理 | running | accepted | 自动查询 |
| 生成中 | running | generating | 自动查询、手动刷新 |
| 结果转存 | running | result_ingesting | 自动查询、手动刷新 |
| 已完成 | completed | completed | 查看结果、重新生成 |
| 失败 | failed | failed / provider_timeout | 查看原因、局部重试 |
| 提交状态未知 | queued | submission_unknown | 先检查；无 task ID 时明确警告后确认重提 |

规则：

- Provider 调用前先创建 Job，任何超时都有可查询记录。
- Provider 返回 task ID 后进入“已受理”，首次轮询确认运行后进入“生成中”。
- 网络断开不立即判定 Provider 失败；标记“提交状态未知”。
- 自动重试不得在提交状态未知时盲目再次调用 Provider，避免重复扣费。
- 局部重试保留旧视频和旧 adopted version。

## 8. 代码边界

预计修改：

- `lib/director/previs-integration.ts`：版本契约与能力转译。
- 新增白模版本服务/API：保存、读取、所有权与快照校验。
- `components/production/WhiteModelPrevis.tsx`：复用原工具栏按钮触发保存与跳转；不改 CSS/布局。
- `components/production/UnifiedStoryboardStage.tsx`：仅透传回调，不改变子视图结构。
- `components/production/ProductionWorkbench.tsx`：复用现有阶段切换、视频提交与 Job 恢复。
- `components/production/ShotVideoPanel.tsx`：扩展状态语义并调用确认 Modal；不改卡片几何结构。
- `app/api/storyboard/shots/[shotId]/generate-video/route.ts` 和现有视频 Job 查询：读取 adopted version 并写追溯字段。
- 相关回归测试。

明确禁止修改：

- 工作台布局 CSS、白模布局 CSS、全局布局 CSS。
- 顶层阶段数组和页面框架。
- P1 社区、Universe 复用逻辑和 P2 通用节点画布。

## 9. 验证与发布门槛

### 自动化

- 白模版本保存、读取、所有权和损坏快照拒绝。
- 精确 firstframe job、prompt、reference version 和 snapshot hash 进入视频 Job。
- 提交状态未知不自动重复提交。
- 局部重试保留旧结果。
- 阶段顺序和白模子视图契约保持不变。
- P0 相关测试、TypeScript、生产构建通过。

### 布局冻结验收

- 代码差异不得包含上述布局 CSS 文件。
- 1440×900、1280×800 和窄屏各截取改前/改后同一页面。
- 顶栏高度、内容起点、白模视口、检查器宽度、时间轴位置和视频卡片宽度保持一致。
- 若视觉差异来自常驻新增区域、面板挤压或换列，视为失败，不进入部署。

### 发布

P0 验收通过后才进入 P1。P0 与 P1 全部完成并通过必要检查后，再按既定流程合并 GitHub `main` 并部署 Vercel production。

