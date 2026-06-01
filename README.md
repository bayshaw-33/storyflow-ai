# StoryFlow AI

从创意到海外漫剧剧本与分镜交付的 AI 创作工作台 MVP，可部署到 Vercel。

## 产品规范

后续开发以 [docs/PRD-v1.0.md](docs/PRD-v1.0.md) 为产品规范；如实现与 PRD 冲突，先列差异再决策。

## MVP 流程

1. 市场
2. 创意
3. 角色
4. 大纲
5. 中文剧本
6. 翻译
7. 本土化
8. 测试剧本
9. 评估
10. 最终剧本
11. 分镜
12. 最终交付

## API

```text
POST /api/ai/generate
POST /api/files/parse
```

支持 `taskType`：

```text
market_analysis
brief
characters
series_outline
chinese_script
translation
localization
test_script
quality_evaluation
final_script
storyboard_script
final_delivery
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
