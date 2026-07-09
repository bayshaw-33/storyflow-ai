# Kiikis Codex 协作交接 SOP v1.0

本文档用于两台 Mac mini、两个 Codex 账号协作开发 Kiikis.com 时统一工作留痕。

## 核心原则

Codex 对话不会自动同步，项目进度必须通过 GitHub 与仓库文档同步。

每个 Codex 在开工前必须先读交接日志，收工前必须更新交接日志。任何影响代码、数据库、部署、产品流程的工作，都需要留下可追溯记录。

## 开工前流程

1. 拉取最新代码：

```bash
git pull origin main
git status
```

2. 阅读交接日志：

```txt
docs/DEV_HANDOFF_LOG.md
```

3. 明确本次任务：

- 本次要解决什么问题
- 涉及哪个页面、组件或接口
- 是否可能影响 Supabase、Vercel、Auth、Storage
- 验收标准是什么

4. 如存在未完成任务或风险，优先确认是否与本次任务冲突。

## 工作中规则

- 只修改与当前任务直接相关的文件。
- 不擅自重构无关代码。
- 不覆盖另一个开发者未合并或未说明的工作。
- 涉及 UI 时，必须检查深色模式、移动端、宽屏布局、文字可读性。
- 涉及数据库时，必须记录 migration、表结构、RLS、测试数据影响。
- 涉及 AI 调用时，必须记录模型、prompt、任务类型、输出结构变化。

## 收工前流程

1. 运行必要验证：

```bash
pnpm run build
```

2. 提交并推送：

```bash
git status
git add <changed-files>
git commit -m "<clear commit message>"
git push origin main
```

3. 更新交接日志：

```txt
docs/DEV_HANDOFF_LOG.md
```

4. 日志必须包含：

- 日期和开发者
- 本次目标
- 实际完成内容
- 修改文件
- 验证结果
- commit hash
- push 状态
- 未完成事项
- 给下一位 Codex 的提醒

## 标准交接格式

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

## 建议分工

项目负责人 Codex：

- 需求拆解
- 产品方向确认
- 核心工作流设计
- 最终合并与线上验收

协作开发 Codex：

- 独立功能开发
- UI 修复
- 组件整理
- 测试与验证
- 按日志交接进度

## 重要提醒

如果交接日志与代码状态冲突，以 Git 当前状态为准，并在日志中补充说明。

如果不确定上一位开发者的意图，不要直接覆盖，先记录问题并向项目负责人确认。
