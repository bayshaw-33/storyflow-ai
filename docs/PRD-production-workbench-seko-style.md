# Kiikis 分镜视频一体化制片工作台 PRD / MVP v1.0

版本：v1.0  
日期：2026-07-09  
负责人：Kiikis 项目负责人 / 主 Codex  
协作定位：主 Codex 负责架构与功能，同事 Codex 后续负责视觉美化与前端精修。

## 1. 项目目标

将 Kiikis.com 现有的分镜工作流与视频工作流，升级为一个类似 Seko 体验的“一体化制片工作台”。

该工作台应支持用户通过左侧 AI 对话完成剧本理解、资料分析、分镜生成、单镜头修改、图片生成、视频生成、镜头顺序管理与轻量时间线预览。

第一版目标不是做剪映级剪辑软件，而是先完成从“剧本 / 背景资料 → 分镜 → 图片 → 视频 → 时间线 → 导出 / Universe 沉淀”的真实闭环。

## 2. 产品定位

Kiikis 的制片工作台不是单纯的视频生成器。

Seko 更偏“AI 视频生成工具”，Kiikis 必须在此基础上保留自己的核心优势：

- AIGC 创作项目管理
- Universe 世界观 / 角色 / 资产继承
- 创作过程留痕
- 多工作流联动
- 项目资产沉淀
- 面向短剧生产的制片统筹能力

因此本工作台的定位是：

```txt
AI 对话驱动的短剧 / MV 分镜视频制片工作台
```

## 3. 服务场景

### 3.1 优先场景：海外短剧

主要服务 TikTok / Reels / Shorts 传播型短剧，包括：

- 单集短剧
- 多集短剧片段
- 小说转短剧
- 剧本转分镜
- 分镜转视频
- 角色统一与场景统一
- 竖屏 9:16 优先

### 3.2 兼容场景：MV / 歌曲视频

兼容歌曲工作流后续输出的 MV / 歌曲视频，包括：

- 歌词 MV
- 叙事型 MV
- 氛围型 MV
- 角色主题曲视频
- OST 视觉化片段

## 4. 核心体验参考

参考 Seko 的有效部分：

- 左侧保持 AI 对话区
- 右侧生成并展示分镜文档
- 分镜可独立编辑、删除
- 点击生成分镜后进入同一套工作台
- 左侧根据当前分镜自动展示图片提示词、视频提示词与预览
- 图片生成、视频生成、视频片段管理都在同一页面完成
- 编辑器模式下提供中间预览与底部时间线

Kiikis 不照搬 Seko 的地方：

- 必须保留 Universe
- 必须保留项目保存与创作留痕
- 必须支持上传剧本、背景设定、角色设定等资料
- 必须预留多模型 Provider
- 必须适配短剧生产，而不是只做 MV / 氛围视频

## 5. 信息架构

保留两个入口：

```txt
/storyboard-workbench
/video-workbench
```

但底层逐步统一为一个核心工作台：

```txt
ProductionWorkbench
```

两个入口的区别：

- `/storyboard-workbench` 默认打开“剧本策划”或“分镜画布”
- `/video-workbench` 默认打开“视频编辑”

顶部模式切换：

```txt
剧本策划 / 分镜画布 / 视频编辑
```

## 6. 页面布局

### 6.1 全局布局

采用三层结构：

```txt
顶部：项目标题 / 模式切换 / Universe / 保存 / 一键生成 / 导出
左侧：AI 对话 + 文件上传 + 当前镜头提示词
右侧：根据模式切换文档、画布或编辑器
```

### 6.2 左侧对话区

左侧始终存在，负责 AI 沟通与当前镜头操作。

必须支持：

- 文本输入
- 上传文件
- 展示用户消息
- 展示 AI 回复
- 展示当前分镜的图片提示词
- 展示当前分镜的图片预览
- 展示当前分镜的视频提示词
- 展示当前分镜的视频预览
- 针对当前分镜继续追问或修改

用户可以直接说：

- “帮我把剧本拆成 30 个镜头以内。”
- “第 3 镜改成低机位特写。”
- “把所有镜头改成黑白电影风格。”
- “减少空镜，强化男女主对峙。”
- “根据上传的角色设定统一人物外观。”
- “生成第 5 镜图片。”
- “把这张图片转视频。”

### 6.3 左侧文件上传

左侧对话框必须支持上传资料。

第一版支持：

```txt
.txt
.md
.doc
.docx
.pdf
.json
.csv
```

可选支持：

```txt
image/*
video/*
audio/*
```

第一版优先处理文本型资料：

- 剧本
- 剧情大纲
- 角色设定
- 世界观设定
- 分镜样例
- 拍摄风格要求
- 歌词 / MV 文案

上传后的资料应进入项目上下文，并可被 AI 对话调用。

上传资料需要记录：

```ts
type ProductionSourceFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  textPreview?: string;
  extractedText?: string;
  storagePath?: string;
  uploadedAt: string;
};
```

第一版可以优先使用现有文件解析能力；若现有 `/api/files/parse` 已可复用，应直接接入。

### 6.4 右侧：剧本策划模式

用于 AI 对话期间同步展示结构化策划文档。

内容包括：

- 故事概况
- 目标平台
- 画幅比例
- 视觉风格
- 角色列表
- 场景列表
- 分镜脚本
- 镜头总数
- 预计总时长

分镜脚本在该模式下以文档 / 表格堆叠形式展示。

每条分镜必须支持：

- 编辑
- 删除
- 复制
- 生成图片
- 进入当前镜头

### 6.5 右侧：分镜画布模式

用于查看和管理所有分镜。

展示形式：

- 网格卡片
- 每张卡显示图片缩略图或占位图
- 显示分镜编号
- 显示画面类型
- 显示时长
- 显示图片状态
- 显示视频状态

每张分镜卡支持：

- 选中
- 编辑
- 删除
- 上移 / 下移
- 生成图片
- 图片转视频
- 查看图片提示词
- 查看视频提示词

第一版可先实现上移 / 下移；拖拽排序放到后续。

### 6.6 右侧：视频编辑模式

第一版只做轻量时间线，不做复杂剪辑。

必须包含：

- 中央预览区
- 当前镜头预览
- 底部时间线
- 镜头顺序管理
- 视频片段状态
- 总时长估算
- 单镜头播放
- 已生成视频 URL 管理

暂不做：

- 多轨剪辑
- 转场精修
- 字幕轨
- 音频混音
- 复杂裁切
- 精确帧级编辑

## 7. 核心数据模型

### 7.1 ProductionProjectState

```ts
type ProductionProjectState = {
  id: string;
  projectId?: string;
  title: string;
  workflowType: "storyboard" | "video" | "production";
  contentType: "short_drama" | "mv";
  aspectRatio: "9:16" | "16:9" | "1:1";
  language: "zh" | "en" | "bilingual";
  universeId?: string | null;
  sourceFiles: ProductionSourceFile[];
  sourceSummary: string;
  storyBrief: ProductionStoryBrief;
  visualBible: ProductionVisualBible;
  shots: ProductionShot[];
  selectedShotId?: string;
  mode: "planning" | "canvas" | "editor";
  providers: ProductionProviderSettings;
  history: ProductionHistoryItem[];
  updatedAt: string;
};
```

### 7.2 ProductionShot

```ts
type ProductionShot = {
  id: string;
  index: number;
  sceneTitle: string;
  shotType: "普通画面" | "对口型画面" | "空镜" | "转场" | "动作镜头";
  duration: string;
  description: string;
  composition: string;
  cameraMovement: string;
  imagePrompt: string;
  videoPrompt: string;
  dialogue?: string;
  sound?: string;
  continuity?: string;
  characterRefs?: string[];
  sceneRefs?: string[];
  imageUrl?: string;
  videoUrl?: string;
  imageTaskId?: string;
  videoTaskId?: string;
  imageProvider?: ProductionImageProvider;
  videoProvider?: ProductionVideoProvider;
  status: "draft" | "image_generating" | "image_ready" | "video_generating" | "video_ready" | "error";
  error?: string;
  createdAt: string;
  updatedAt: string;
};
```

### 7.3 Provider 设置

```ts
type ProductionImageProvider = "minimax" | "seedream" | "openai" | "local";
type ProductionVideoProvider = "minimax" | "seedance" | "runway" | "kling";

type ProductionProviderSettings = {
  imageProvider: ProductionImageProvider;
  videoProvider: ProductionVideoProvider;
  imageModel?: string;
  videoModel?: string;
};
```

第一版默认：

```txt
图片：MiniMax
视频：MiniMax
```

但接口和状态层必须预留：

```txt
Seedance / Runway / Kling / 其他视频模型
```

## 8. API 设计

现有接口：

```txt
app/api/ai/concept-image/route.ts
app/api/video/minimax/route.ts
```

第一版建议新增生产级接口，不把业务继续塞进旧接口。

### 8.1 对话与分镜生成

```txt
POST /api/production/storyboard-chat
```

用途：

- 接收用户对话
- 读取已上传资料
- 生成或修改 `ProductionProjectState`
- 返回 AI 回复与结构化 state patch

返回：

```ts
type StoryboardChatResponse = {
  success: boolean;
  message: string;
  statePatch?: Partial<ProductionProjectState>;
  shots?: ProductionShot[];
  error?: string;
};
```

### 8.2 文件解析

```txt
POST /api/production/source-file
```

用途：

- 接收上传文件
- 解析文本
- 保存文件元数据
- 返回 `ProductionSourceFile`

如现有 `/api/files/parse` 足够，应复用，避免重复实现。

### 8.3 图片生成

```txt
POST /api/production/generate-shot-image
```

用途：

- 根据单条 `ProductionShot.imagePrompt` 生成图片
- 返回 imageUrl
- 更新 shot 状态

第一版内部调用 MiniMax 图片生成能力。

### 8.4 视频生成

```txt
POST /api/production/generate-shot-video
```

用途：

- 根据 `ProductionShot.videoPrompt` 和可选 `imageUrl` 生成视频
- 默认走 MiniMax
- 返回 taskId / status

### 8.5 视频状态查询

```txt
POST /api/production/video-status
```

用途：

- 查询视频任务状态
- 成功后回填 videoUrl

### 8.6 保存状态

```txt
POST /api/production/save-state
```

用途：

- 保存 `ProductionProjectState`
- 同步到现有 `DramaProject`
- 写入版本记录
- 必要时同步 Universe

## 9. Universe 接入

Universe 是 Kiikis 核心，不能降级为可选装饰。

制片工作台必须支持：

- 选择已有 Universe
- 从当前项目创建 Universe
- 将分镜结构同步到 Universe
- 将图片 / 视频资产同步到 Universe
- 继承 Universe 中的角色、场景、世界观

同步内容：

```ts
type ProductionUniverseSnapshot = {
  type: "production_storyboard_video";
  title: string;
  contentType: "short_drama" | "mv";
  aspectRatio: string;
  shotCount: number;
  completedImageCount: number;
  completedVideoCount: number;
  characters: unknown[];
  scenes: unknown[];
  shots: ProductionShot[];
  assets: Array<{
    type: "image" | "video";
    shotId: string;
    title: string;
    url: string;
    provider?: string;
  }>;
};
```

## 10. 创作留痕

每次重要操作都要写入 `history`：

- 上传文件
- AI 生成分镜
- 用户修改分镜
- 删除分镜
- 生成图片
- 图片转视频
- 查询视频状态
- 保存项目
- 同步 Universe
- 导出

```ts
type ProductionHistoryItem = {
  id: string;
  type: "chat" | "upload" | "edit" | "delete" | "image" | "video" | "save" | "universe" | "export";
  title: string;
  detail: string;
  shotId?: string;
  createdAt: string;
};
```

## 11. MVP 功能范围

### 11.1 必须完成

- 统一 `ProductionProjectState`
- 统一 `ProductionShot`
- 左侧 AI 对话区
- 左侧文件上传
- 资料解析并进入对话上下文
- AI 生成分镜
- 分镜文档展示
- 分镜独立编辑
- 分镜独立删除
- 分镜画布网格
- 单镜头图片生成
- 图片预览
- 图片转视频
- MiniMax 视频任务创建
- 视频状态刷新
- 视频 URL 回填
- 视频编辑模式
- 底部时间线预览
- 镜头顺序管理
- 项目保存
- Universe 关联与同步
- 导出 JSON / Markdown

### 11.2 第一版可以简化

- 拖拽排序可先用上移 / 下移代替
- 视频编辑器只做片段顺序和预览，不做多轨
- 图片生成先只接 MiniMax
- 视频生成先只接 MiniMax
- UI 先保证可用，后续由同事 Codex 美化

### 11.3 暂不做

- 剪映级多轨剪辑
- 字幕轨道
- 音频混音
- 高级转场
- 帧级编辑
- 复杂素材库管理
- 自动发布 TikTok

## 12. 旧工作台兼容

现有页面：

```txt
app/storyboard-workbench/page.tsx
app/video-workbench/page.tsx
```

迁移策略：

1. 先抽出共享数据结构与工具函数。
2. 新建 `ProductionWorkbench` 核心组件。
3. 让 `/storyboard-workbench` 和 `/video-workbench` 复用核心组件。
4. 保留旧项目数据读取能力。
5. 旧分镜数据进入时转换为 `ProductionShot[]`。
6. 旧视频队列数据进入时转换为 `ProductionShot[]`。

## 13. 推荐文件结构

```txt
lib/production/types.ts
lib/production/state.ts
lib/production/prompts.ts
lib/production/providers.ts
lib/production/universe.ts

components/production/ProductionWorkbench.tsx
components/production/ProductionChatPanel.tsx
components/production/ProductionPlanningDocument.tsx
components/production/ProductionStoryboardCanvas.tsx
components/production/ProductionVideoEditor.tsx
components/production/ProductionTimeline.tsx
components/production/ProductionShotCard.tsx

app/api/production/storyboard-chat/route.ts
app/api/production/source-file/route.ts
app/api/production/generate-shot-image/route.ts
app/api/production/generate-shot-video/route.ts
app/api/production/video-status/route.ts
app/api/production/save-state/route.ts
```

## 14. 开发分工

### 14.1 主 Codex / 当前开发负责人

负责：

- 架构设计
- 数据结构
- 状态管理
- API route
- 文件上传与解析
- 图片生成接入
- 视频生成接入
- Provider 抽象
- Universe 同步
- 项目保存
- 旧数据兼容
- 基础可用 UI
- 基础时间线

### 14.2 同事 Codex

后续负责：

- Seko 风格视觉美化
- 左侧对话区视觉优化
- 分镜卡片精修
- 时间线视觉精修
- 宽屏布局优化
- 移动端适配
- 动效与交互反馈
- 深色模式细节

## 15. 阶段计划

### Phase 1：架构与状态统一

目标：

- 建立 `lib/production/*`
- 定义 `ProductionProjectState`
- 定义 `ProductionShot`
- 完成旧分镜 / 视频数据转换

验收：

- 两个入口都能加载同一类 state
- 能保存和读取 state

### Phase 2：基础一体化页面

目标：

- 搭建 `ProductionWorkbench`
- 完成左侧对话区
- 完成三模式切换
- 完成分镜文档展示
- 完成分镜画布
- 完成视频编辑基础布局

验收：

- 用户可以在一个页面完成策划、画布、编辑器切换
- 分镜可编辑、删除、排序

### Phase 3：文件上传与 AI 分镜

目标：

- 左侧上传剧本 / 设定文件
- 解析文本进入上下文
- AI 根据对话与资料生成分镜
- AI 可根据用户要求修改分镜

验收：

- 上传文本资料后，可通过对话生成分镜
- 分镜数量、风格、时长可通过对话调整

### Phase 4：图片与视频生成

目标：

- 单镜头生成图片
- 图片生成后可转视频
- MiniMax 视频任务创建与刷新
- 预留 Seedance / Runway / Kling provider

验收：

- 单条 shot 可产生 imageUrl
- 单条 shot 可产生 video task
- 完成后可回填 videoUrl

### Phase 5：Universe 与导出

目标：

- 关联 Universe
- 同步分镜结构、图片、视频资产
- 导出 JSON / Markdown
- 更新时间线和历史记录

验收：

- Universe 能看到生产资产摘要
- 项目可导出完整制片包

## 16. 验收标准

第一版上线前必须满足：

- `pnpm run build` 通过
- `/storyboard-workbench` 可进入新工作台
- `/video-workbench` 可进入新工作台
- 上传文件可解析文本
- 对话可生成分镜结构
- 分镜可编辑、删除、排序
- 单镜头可生成图片
- 图片可转视频
- 视频状态可刷新
- 时间线能展示镜头顺序与状态
- 项目能保存
- Universe 能关联或同步
- 深色模式无白底浅字
- 宽屏不空散，移动端不溢出

## 17. 给同事 Codex 的说明

同事 Codex 后续接手前，应先阅读：

```txt
docs/DEV_HANDOFF_LOG.md
docs/CODEX_HANDOFF_SOP.md
docs/CODEX_TEAMMATE_ONBOARDING.md
docs/PRD-production-workbench-seko-style.md
```

同事 Codex 的任务不是重新设计架构，而是在主 Codex 完成基础闭环后，对现有 UI 进行视觉升级。

重点美化范围：

- 左侧对话区
- 右侧文档模式
- 分镜画布卡片
- 视频编辑器
- 时间线
- 操作按钮与状态反馈
- 宽屏 / 移动端

## 18. 关键决策记录

- 分镜和视频不再作为割裂工作流处理，统一为制片工作台。
- 第一版直接接真实图片生成和真实视频生成。
- 视频默认走 MiniMax。
- Provider 层必须预留 Seedance / Runway / Kling。
- Universe 是一级能力，不能丢。
- 视频编辑器第一版只做轻量时间线，不做剪映级复杂剪辑。
- 基础布局由主 Codex 实现，同事 Codex 后续美化。
- 左侧对话框必须支持上传剧本和背景设定资料。
