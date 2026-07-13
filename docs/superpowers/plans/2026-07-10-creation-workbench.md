# 创作工作台升级实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将小说工作台升级为小说/剧本共用的双栏创作工作台，并打通美术与分镜/视频交接。

**Architecture:** 保留现有 `DramaProject`、AI 路由和 Universe 服务，新建纯函数交接模块作为三个工作台之间的边界。页面仅重排状态和控件，第一版使用 localStorage 暂存交接包。

**Tech Stack:** Next.js 15、React 19、TypeScript、Supabase、CSS、Node test runner

## Global Constraints

- 入口保持 `/novel-workbench`。
- 旧 `/script-workbench` 不修改。
- 第一版不新增 Supabase migration，不重写 AI API。
- 所有成果支持 Markdown 直接编辑。
- 完成后更新 `docs/DEV_HANDOFF_LOG.md` 并 push `main`。

---

### Task 1: 创作交接包

**Files:** `lib/creative-handoff.ts`、`lib/creative-handoff.test.ts`

- [ ] 先写测试，验证三件套、正文和 Universe 被打包，错误来源不会被读取。
- [ ] 运行 `node --experimental-strip-types --test lib/creative-handoff.test.ts`，确认测试因模块缺失而失败。
- [ ] 实现 `buildCreativeHandoffPackage`、`writeCreativeHandoff`、`readCreativeHandoff`。
- [ ] 重跑测试并确认通过。

### Task 2: 双栏创作工作台

**Files:** `app/novel-workbench/page.tsx`、`app/globals.css`

- [ ] 将页面标题改为“创作工作台”，桌面布局改为 38/62 双栏。
- [ ] 移除流程侧栏与重复工具；右侧加入阶段标签和单一生成操作。
- [ ] 加入资料上传、文件状态与解析文本上下文。
- [ ] 加入小说/剧本正文模式与 Markdown 编辑。
- [ ] 修复 Markdown 下载文件名与 URL 释放时机。

### Task 3: 工作台交接消费

**Files:** `components/art/ArtWorkbench.tsx`、`components/production/ProductionWorkbench.tsx`

- [ ] 美术工作台读取 creative handoff 并生成美术资料上下文。
- [ ] 制片工作台读取 creative handoff 并生成策划状态。
- [ ] 创作工作台的两个入口保存项目、写交接包并跳转。

### Task 4: 验证与发布

**Files:** `docs/DEV_HANDOFF_LOG.md`

- [ ] 运行交接包测试、`npx tsc --noEmit` 和 `npm run build`。
- [ ] 启动本地站点并用浏览器检查关键布局和跳转。
- [ ] 更新 handoff，检查 diff，不提交 `.DS_Store`。
- [ ] 提交并 push `main`。
