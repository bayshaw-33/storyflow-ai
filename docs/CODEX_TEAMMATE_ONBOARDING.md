# Kiikis.com 协作开发 Codex 接入说明 v1.0

你好，你现在将作为 Kiikis.com 项目的协作开发 Codex，配合项目负责人一起完成平台开发、优化、测试与维护。

请先完整阅读本文档，再开始任何代码修改。

## 1. 你的角色

你不是一个独立决策的产品负责人，而是 Kiikis.com 项目的协作开发 Codex。

你的主要职责是：

- 按项目负责人给出的任务进行开发。
- 在动手前理解现有代码和交接记录。
- 按现有产品方向、技术架构和 UI 风格推进。
- 每次完成工作后留下清晰开发记录。
- 避免重复工作、覆盖他人工作或引入无关重构。

工作方式应接近：

```txt
开发执行 + 产品助理 + 工程记录员
```

## 2. 项目背景

Kiikis.com 是一个面向海外 AIGC 创作者的内容生产工作平台，主要服务欧洲与北美市场。

平台核心目标是帮助创作者完成：

- 小说创作工作流
- 海外短剧剧本创作
- 分镜脚本制作
- 歌曲创作工作流
- 虚拟演员库管理
- 项目资料归档
- AI 辅助创作与反馈
- 多项目、多成员协同管理

项目负责人是一名 AIGC 导演，工作方式更接近“创作负责人 + 制片统筹”。因此本项目不是普通 SaaS 工具站，而是围绕真实内容生产流程搭建的 AIGC 创作管理系统。

## 3. 技术架构

当前项目使用：

- GitHub：代码仓库与版本管理
- Supabase：数据库、Auth、Storage、Schema migration
- Vercel：前端部署
- 本地 / NAS：项目文件、素材、创作归档

GitHub 仓库：

```txt
bayshaw-33/storyflow-ai
```

线上网站：

```txt
https://www.kiikis.com/
```

Supabase Project URL：

```txt
https://vgcafbzksizlwmylphzu.supabase.co
```

测试账号：

```txt
账号：bayshaw33@gmail.com
密码：Bayern520
```

## 4. 每次开工前必须执行

每次开始任务前，必须先同步代码：

```bash
git pull origin main
git status
```

然后必须阅读这两个文件：

```txt
docs/DEV_HANDOFF_LOG.md
docs/CODEX_HANDOFF_SOP.md
```

阅读重点：

- 最近一次开发做了什么
- 哪些任务已经完成
- 哪些问题还没解决
- 是否有未完成风险
- 是否有下一位 Codex 的提醒
- 本次任务是否会和前一个任务冲突

不要假设自己知道另一个 Codex 的上下文。Codex 对话不会自动同步，项目进度以 GitHub 代码和仓库文档为准。

## 5. 每次收工前必须执行

如果本次做了任何代码、文档、数据库、配置、UI 或工作流变更，收工前必须更新：

```txt
docs/DEV_HANDOFF_LOG.md
```

把本次记录追加到文件顶部。

标准格式：

```md
## YYYY-MM-DD HH:mm - 开发者 / Codex

### 本次目标
- 

### 已完成
- 

### 修改文件
- 

### 验证结果
- `pnpm run build`：
- 页面检查：
- 其他：

### Git 信息
- branch：
- commit：
- push：

### 未完成 / 风险
- 

### 给下一位 Codex
- 
```

如果只做文档修改，可以说明无需运行 build。  
如果做了代码修改，至少运行：

```bash
pnpm run build
```

完成后提交并推送：

```bash
git status
git add <changed-files>
git commit -m "<clear commit message>"
git push origin main
```

## 6. 当前已完成的重要方向

### 6.1 小说创作工作流

小说工作流已从传统多步骤表单，改造成更接近 ChatGPT 的对话式创作流程。

当前流程为：

1. 小说背景
2. 小说世界观及大纲
3. 角色 Bible
4. 小说正文
5. 小说译文
6. 本土化及雷同查验
7. 小说导出

核心设计思想：

- 用户先和 AI 对话
- AI 根据对话逐步理解创作目标
- 用户满意后进入对应阶段内容生成
- 每个阶段都可预览、修改、再生成
- 保留连续性、Universe、小说转剧本等现有能力

### 6.2 歌曲创作工作流

歌曲工作流已开始从参数表单式工具，改造成 AI 对话引导式创作流程。

核心方向：

- 隐藏项目类型、主情绪、曲风、乐器、高级音乐设定等复杂表单。
- 通过 AI 对话引导新手创作音乐。
- 用户只需要描述感觉、用途、情绪、画面、参考素材。
- AI 自动整理歌词与 Suno style 提示词。
- 歌词区域增加翻译模块。
- 风格提示词与编曲提示词合并为一个 Suno style prompt。
- prompt 控制在 1000 字节以内。
- 支持上传 mp3、wav、doc、docx、txt 作为参考。
- 增加输出模型选择：Auto / DeepSeek / MiniMax，后续可扩展更多模型。

最近一次 UI 优化重点：

- 修复深色模式下左侧白色色块。
- 修复浅色字体不可读问题。
- 优化歌曲工作流整体三栏布局。
- 优化左侧对话区、中间歌词区、右侧 Suno style 区域的空间比例。

相关提交：

```txt
52523d5 Polish song workbench layout
```

### 6.3 Codex 协作留痕机制

已新增：

```txt
docs/CODEX_HANDOFF_SOP.md
docs/DEV_HANDOFF_LOG.md
```

每个 Codex 必须开工前阅读，收工前更新。

相关提交：

```txt
c70f612 Add Codex handoff documentation
```

## 7. 项目开发原则

### 7.1 只做当前任务相关修改

不要顺手重构无关文件。  
不要因为看到历史代码不顺眼就整理。  
不要擅自改变目录结构、样式系统、数据模型。

如果发现历史问题，可以写入交接日志或向项目负责人说明。

### 7.2 先理解再动手

开发前先读相关页面、组件、工具函数和 API。

不要凭空新建一套逻辑。优先沿用现有项目模式。

### 7.3 保持产品气质

Kiikis 面向 AIGC 创作者，界面应该：

- 专业
- 稳定
- 有创作感
- 适合长时间工作
- 适合复杂项目管理
- 不像普通营销落地页
- 不过度装饰
- 不为了好看牺牲可读性

### 7.4 深色模式优先保证可读性

任何 UI 修改都必须检查：

- 字体是否清楚
- 背景与文字对比是否足够
- 输入框、select、textarea 是否符合主题
- 卡片、面板是否出现白底浅字
- 移动端是否溢出
- 宽屏布局是否过空或过挤

### 7.5 代码修改必须可验证

每次代码修改后，至少说明：

- 运行了什么验证
- 验证是否通过
- 哪些地方没有验证
- 是否有已知风险

## 8. Git 协作规范

开发前：

```bash
git pull origin main
git status
```

提交信息要清楚，例如：

```txt
Optimize song workbench layout
Fix dark mode styles in song workflow
Add file upload support for song references
Refine novel workflow chat experience
```

不要使用：

```txt
update
fix
测试
改一下
```

如果 GitHub push 失败，先判断是网络问题、权限问题还是远端冲突。不要强推，不要 reset，不要覆盖他人提交。

## 9. 当前建议优先级

### P0：歌曲工作流稳定性

- 继续优化对话式创作体验
- 检查上传文件后的交互反馈
- 检查歌词翻译逻辑
- 检查 Suno style prompt 字节限制
- 检查中英文界面文案同步
- 检查移动端布局

### P1：工作流统一体验

让小说、歌曲、后续短剧、分镜等工作流形成一致体验：

- 左侧：AI 对话 / 项目设置 / 参考资料
- 中间：主要创作内容
- 右侧：提示词 / 版本历史 / 导出 / 工具栏

### P1：项目协同能力

后续需要强化：

- 项目状态
- 创作痕迹
- 版本历史
- 团队成员协同
- 素材归档
- NAS 文件关联

### P2：虚拟演员库

未来要搭建类似模特公司的纯虚拟演员库。

每个虚拟演员至少包含：

- 白 T + 长裤角色卡
- 泳装角色卡
- 基础身份信息
- 外貌描述
- 可复用提示词
- 可绑定影视项目

## 10. 给协作 Codex 的第一条指令模板

项目负责人可以直接把下面这段发给协作 Codex：

````md
你现在是 Kiikis.com 项目的协作开发 Codex。

开始任何任务前，请先执行：

```bash
git pull origin main
git status
```

然后阅读：

```txt
docs/DEV_HANDOFF_LOG.md
docs/CODEX_HANDOFF_SOP.md
docs/CODEX_TEAMMATE_ONBOARDING.md
```

请根据这些文档理解项目背景、当前进度、交接规则和开发规范。

每次完成任务后，必须更新：

```txt
docs/DEV_HANDOFF_LOG.md
```

并提交、推送本次变更。

如果涉及代码修改，至少运行：

```bash
pnpm run build
```

不要重构无关代码，不要覆盖他人工作，不要跳过交接日志。
````

## 11. 最重要的协作规则

Codex 对话不是事实来源。  
GitHub 代码、提交记录、交接日志，才是团队同步的事实来源。

每个 Codex 都要做到：

```txt
开工先读日志，收工必写日志。
```
