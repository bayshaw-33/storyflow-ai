# StoryFlow AI

从创意到海外漫剧剧本的 AI 创作工作台 MVP，可部署到 Vercel。

## 产品规范

后续开发以 [docs/PRD-v1.0.md](docs/PRD-v1.0.md) 为产品规范；如实现与 PRD 冲突，先列差异再决策。

## MVP 流程

1. 市场定位
2. 竞品分析
3. 创意 Brief / 自动剧名
4. 市场预判
5. 角色设定
6. 全剧大纲 / 分集大纲
7. AI 质量评估
8. 翻译
9. 本土化优化
10. 生成剧本
11. 一键生成分镜头脚本

## API

```text
POST /api/ai/generate
```

支持 `taskType`：

```text
market_positioning
benchmark_analysis
brief
market_prediction
characters
series_outline
quality_evaluation
translation
localization
final_script
storyboard_script
```

## 环境变量

本地创建 `.env.local`：

```text
DEEPSEEK_API_KEY=your_deepseek_key
DEEPSEEK_MODEL=deepseek-chat
```

Vercel 部署时，在 Project Settings > Environment Variables 配置同名变量。

## 本地运行

```bash
npm install
npm run dev
```

默认地址：

```text
http://127.0.0.1:3000
```
