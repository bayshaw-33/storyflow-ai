---
AIGC:
    Label: "1"
    ContentProducer: 001191110102MACQD9K64018705
    ProduceID: 7641530842627719470-data_volume/files/所有对话/主对话/StoryFlow-AI-MVP-PRD-v1.0.md
    ReservedCode1: ""
    ContentPropagator: 001191110102MACQD9K64028705
    PropagateID: 181835004384484#1780231486743
    ReservedCode2: ""
---
# StoryFlow AI MVP PRD v1.0

## 项目名称

StoryFlow AI

## 产品定位

**一句话：** 从创意到海外短剧剧本的 AI 创作工作台。

**投资人版描述：** StoryFlow AI 是一个面向海外短剧创作者的 AI 内容生产平台。平台通过市场定位、竞品分析、创意生成、角色设计、剧情规划、剧本创作、翻译和本土化能力，帮助创作者快速完成海外短剧研发流程。

## MVP目标

**本版本目标：** 投资人Demo版本

**要求：**
- 真实调用AI生成
- 真实可部署
- 真实可演示
- 不追求完整功能
- 优先保证主流程跑通

## 用户画像

| 用户 | 描述 |
|------|------|
| 用户1 | 海外短剧制作公司 |
| 用户2 | 短剧编剧 |
| 用户3 | AI短剧创业团队 |

## 产品核心价值

### 传统流程

```
选题 → 分析市场 → 拆竞品 → 设计角色 → 写大纲 → 写剧本 → 翻译 → 本土化
周期：1-4周
```

### StoryFlow AI

**10分钟完成**

## MVP功能范围

### 只做

- 项目管理
- 市场定位
- 竞品分析
- 故事创意
- 角色设定
- 剧情大纲
- 前3集剧本
- 翻译
- 本土化

### 不做

- 支付
- 社区
- 博客
- 教程
- 模板市场
- RAG
- 多人协作
- 复杂权限

## 系统流程

### Step 1 市场定位

**字段：目标市场**

| 选项 |
|------|
| 中国大陆 |
| 北美 |
| 欧洲 |
| 东南亚 |
| 中东 |
| 其他 |

**字段：题材**

| 选项 |
|------|
| Billionaire Romance |
| Hidden Heiress |
| Revenge Romance |
| Fake Marriage |
| Secret Baby |
| Mafia Love |
| Werewolf Alpha |
| Fantasy Romance |
| Urban Drama |
| Other |

- Other：支持手填

---

### Step 2 竞品分析

**模块名称：** Benchmark Analysis

**字段：**
- 作品名称
- 作品链接（支持：TikTok / YouTube / DramaBox / ReelShort / ShortMax / GoodShort / WebNovel / Wattpad）

**AI输出：**
- 题材分析
- 人物结构
- 核心卖点
- 情绪曲线
- 节奏分析
- 成功因子

---

### Step 3 故事创意

**模式1：一句话创意**

> 例如：重生后发现未婚妻嫁给仇人

**模式2：关键词生成**

> 例如：重生 复仇 豪门 隐藏身份

**AI输出：项目Brief**

| 内容 |
|------|
| 故事定位 |
| 一句话卖点 |
| 核心冲突 |
| 主角目标 |
| 反派阻力 |
| 情绪基调 |
| 目标受众 |
| 视觉风格 |

---

### Step 4 市场预判

**AI生成：**
- 市场匹配度
- 推荐标签
- 潜在风险
- 优化建议

**示例：**

| 项目 | 内容 |
|------|------|
| 北美适配度 | 8.8 |
| 推荐 | Revenge Romance / Hidden Identity / CEO Drama |
| 风险 | 前3集冲突不足 |

---

### Step 5 角色设定

**输出：** 主角 / 反派 / 女主 / 关键配角

**字段：**
- 身份
- 目标
- 弱点
- 秘密
- 成长弧线

---

### Step 6 全剧大纲

**输出：** Act 1 / Act 2 / Act 3

**同时生成：12集大纲**

| 格式 |
|------|
| 第X集 |
| 核心事件 |
| 冲突 |
| 钩子 |

---

### Step 7 前3集试生产

**生成：** Episode 1 / Episode 2 / Episode 3

**格式：**
- 场景
- 人物
- 动作
- 对白
- 分镜提示

---

### Step 8 AI质量评估

**输出：**
- Hook强度
- 情绪密度
- 反转频率
- 市场适配度
- 完播率预测

---

### Step 9 翻译

**支持语言：**

| 语言 |
|------|
| 英语 |
| 西班牙语 |
| 葡萄牙语 |
| 法语 |
| 德语 |
| 日语 |
| 韩语 |
| 泰语 |
| 印度尼西亚语 |
| 越南语 |

---

### Step 10 本土化

**检查项：**
- 文化表达
- 称谓
- 职业
- 法律
- 宗教
- 习惯用语

**输出：**
- 发现问题
- 修改建议
- 自动修正

## 页面结构

### 页面1：项目列表

**显示：** 项目名称 / 市场 / 题材 / 更新时间

**按钮：** 新建项目

### 页面2：创作工作台

**三栏布局：**

| 左侧 | 中间 | 右侧 |
|------|------|------|
| 流程导航 | 编辑器 | AI助手 |

**AI助手按钮：** 根据阶段变化，统一包含：
- 重新生成
- 优化内容
- 继续下一步

## 技术架构

| 层级 | 技术选型 |
|------|----------|
| Frontend | Next.js + React + TypeScript |
| Backend | Next.js API Routes |
| AI | DeepSeek (`DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL=deepseek-chat`) |
| Deployment | Vercel |

## 数据结构

```
Project {
  id
  title
  market
  genre
  benchmark
  idea
  brief
  characters
  outline
  episodes
  script
  translation
  localization
  createdAt
}
```

## MVP成功标准

**投资人现场演示流程：**

```
选择市场 → 输入竞品 → 输入创意 → 生成Brief → 生成角色 → 生成大纲 → 生成前3集 → 翻译 → 本土化
```

**标准：**
- 整个流程 **5分钟以内** 完成
- 每一步 **真实调用 DeepSeek API**

---

> 本内容由 Coze AI 生成，请遵循相关法律法规及《人工智能生成合成内容标识办法》使用与传播。
