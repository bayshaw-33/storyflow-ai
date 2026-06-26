# Kiikis 小说创作模块 PRD

## 1. 背景

Kiikis 当前核心工作流以短剧创作为主，并已扩展歌曲创作、爆款创作和 Universe Engine。小说创作模块的目标不是把小说硬塞进短剧流程，而是新增独立的 `novel` workflow type，同时复用 Kiikis 的项目列表、AI 任务系统、版本记录、Universe canon 能力和后续短剧改编能力。

小说创作模块需要支持长篇连载、章节持续生产、人物和伏笔连续性管理，并为“小说 → 短剧创作”和“短剧 / Universe → 小说创作”提供产品闭环。

## 2. 目标用户

- 网文作者：需要从创意、角色、卷纲到章节正文的连续生产工具。
- 短剧编剧：希望把短剧 IP 扩展成小说，或用小说长线结构沉淀 IP。
- 内容工作室：需要同时管理小说、短剧和 Universe canon，形成可复用内容资产。
- 海外内容创作者：面向 WebNovel、Dreame、GoodNovel、Radish 等平台生产英文或多语言连载内容。

## 3. 产品目标

1. 新增“小说创作”入口，与“短剧创作”“歌曲创作”“爆款创作”命名一致。
2. 建立独立小说工作流，覆盖创意、Bible、角色、卷纲、章节大纲、章节正文、修订和导出。
3. 小说项目能进入项目列表，并可作为 Universe 来源项目。
4. 小说项目可以从 Universe 继承世界观、角色、关系、时间线和 locked canon。
5. AI 从小说中提取的角色、地点、关系、事件、设定规则和伏笔必须先进入 Universe Inbox，不能直接写入 canon。
6. 支持后续“小说改编短剧”：把小说 Bible、角色、章节和长线结构转换成短剧项目输入。

## 4. 非目标

- 第一版不做在线多人协作。
- 第一版不做完整出版排版系统。
- 第一版不做 AI 自动发布到第三方小说平台。
- 第一版不做无限长上下文全书重写，优先做章节级、卷级、Bible 级结构化生成。

## 5. 工作流设计

### 5.1 Workflow Type

新增：

```ts
workflowType: "novel"
```

小说项目不复用短剧的 14 步流程，新增小说专用 workflow phases。

### 5.2 阶段

1. 项目设定
   - 标题
   - 小说类型
   - 目标平台
   - 目标语言
   - 目标字数
   - 连载频率
   - 目标读者
   - 付费爽点 / 留存钩子

2. 故事内核
   - 一句话梗概
   - 核心卖点
   - 主角欲望
   - 主冲突
   - 情感线
   - 金手指 / 身份秘密 / 反转设定
   - 前 3 章爆点

3. 小说 Bible
   - 世界观
   - 角色卡
   - 关系网
   - 设定规则
   - 伏笔清单
   - 禁止改写 canon
   - 语言风格
   - 节奏规则

4. 卷纲与长线结构
   - 全书结构
   - 分卷目标
   - 每卷核心矛盾
   - 阶段性爽点 / 虐点
   - 关键反转
   - 情感线推进
   - 结局方向

5. 章节生产
   - 章节大纲
   - 章节正文
   - 章节结尾钩子
   - 上章回顾
   - 伏笔埋设与回收
   - 角色状态更新

6. 修订与交付
   - 风格统一
   - 人设一致性检查
   - 伏笔检查
   - 平台适配
   - 导出 TXT / Markdown / DOCX
   - 转短剧 Brief

## 6. MVP Scope

第一版建议实现以下任务：

| Task Type | 名称 | 输出 |
| --- | --- | --- |
| `novel_brief` | 小说创意 Brief | 卖点、受众、主冲突、开篇钩子 |
| `novel_bible` | 小说 Bible | 世界观、规则、风格、伏笔 |
| `novel_characters` | 小说角色卡 | 主角、反派、关系、成长线 |
| `novel_volume_outline` | 分卷大纲 | 卷目标、关键反转、情感推进 |
| `novel_chapter_outline` | 章节大纲 | 本章目标、场景、冲突、结尾钩子 |
| `novel_chapter_draft` | 章节正文 | 正文、钩子、连续性备注 |
| `novel_revision` | 章节修改 | 按指令重写当前章 |
| `novel_export` | 导出包 | Bible、角色、卷纲、章节正文 |

## 7. 数据模型建议

在现有 `DramaProject` 兼容模型上，新增小说结构化字段，后续可迁移到结构化表。

```ts
type NovelProjectData = {
  novelSettings: NovelSettings;
  novelBrief: string;
  novelBible: NovelBible;
  novelCharacters: NovelCharacter[];
  novelVolumeOutline: NovelVolume[];
  novelChapters: NovelChapter[];
  novelContinuityNotes: string;
  novelStyleGuide: string;
};
```

章节结构：

```ts
type NovelChapter = {
  id: string;
  chapterNo: number;
  title: string;
  outline: string;
  draft: string;
  endingHook: string;
  pov: string;
  wordCount: number;
  continuityNotes: string;
  status: "draft" | "reviewed" | "locked";
  createdAt: string;
  updatedAt: string;
};
```

## 8. AI 输出格式

章节生成必须使用稳定结构：

```text
---CHAPTER_TITLE---
...

---CHAPTER_OUTLINE---
...

---CHAPTER_DRAFT---
...

---ENDING_HOOK---
...

---CONTINUITY_NOTES---
...
```

AI 输入必须包含：

- 小说 Bible
- 当前卷目标
- 已有角色状态
- 上一章摘要
- 当前章节目标
- 已埋伏笔
- locked canon
- 目标字数
- 平台风格

## 9. Universe 打通

### 9.1 小说进入 Universe

小说项目可创建 Universe，或关联已有 Universe。AI 从小说中抽取以下内容：

- 角色
- 地点
- 组织
- 关系
- 事件
- 世界规则
- 伏笔
- 角色状态变化

抽取结果必须进入 Inbox，由用户 accept / edit accept / reject 后才能进入 canon。

### 9.2 Universe 创建小说

从 Universe 创建小说时，可选择继承范围：

- 世界观
- 主角色
- 关系
- 时间线
- locked facts
- 风格指南
- 已确认伏笔

继承内容写入小说 Bible，但不能静默覆盖用户正在编辑的内容。

### 9.3 小说改编短剧

小说项目可生成短剧项目输入：

- 小说 Brief → 短剧 Brief
- 小说角色卡 → 短剧角色卡
- 分卷大纲 → 短剧季纲
- 章节 → 分集大纲
- 关键场景 → 短剧高冲突场景

## 10. UI 设计

小说创作页面建议采用生产工具布局：

- 左侧：项目设定、Bible、角色、分卷、章节列表
- 中间：当前编辑器，重点显示章节正文
- 右侧：AI 工具、连续性检查、Universe Inbox、版本历史

核心操作：

- 生成 Novel Brief
- 生成/更新 Bible
- 生成角色卡
- 生成分卷大纲
- 生成章节大纲
- 生成章节正文
- 按指令修改章节
- 检查人设一致性
- 检查伏笔
- 保存到项目列表
- 发送 Universe Inbox
- 转短剧项目

## 11. 权限建议

- Free：可创建本地小说草稿，有限 AI 次数。
- Elite：可生成 Bible、角色、卷纲、章节。
- Pro：可使用连续性检查、章节批量生成、导出。
- Ultra：可接入 Universe、canon 检查、小说转短剧项目。

## 12. 验收标准

第一版完成后应满足：

1. 工作台出现“小说创作”模块。
2. 可创建 `workflowType: "novel"` 项目并进入小说创作页。
3. 可生成 Novel Brief、Bible、角色、卷纲、章节大纲、章节正文。
4. 章节正文可保存版本。
5. 小说项目出现在项目列表。
6. 小说项目可作为 Universe 来源项目。
7. Universe 抽取结果先进入 Inbox，不直接写 canon。
8. 可导出小说项目 Markdown。

## 13. 开发顺序

1. 增加 `workflowType: "novel"` 和小说 workflow steps。
2. 新增小说项目创建入口和项目列表识别。
3. 新建小说创作页 MVP。
4. 增加 AI task types 和 prompts。
5. 增加章节结构和版本记录。
6. 增加导出。
7. 接 Universe Inbox。
8. 增加小说转短剧入口。
