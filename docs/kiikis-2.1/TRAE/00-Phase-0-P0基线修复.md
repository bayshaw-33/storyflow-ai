# Phase 0：P0 基线修复——工作台布局与任务跳转

> 只执行本阶段。
> 需求：`K21-P0-UI-001..004`、`K21-P0-NAV-001..006`
> 前置：当前 `main`
> 完成后交给：`COZE/00-Phase-0-P0基线验证.md`

## 1. 目标

修复用户截图中的两类阻断：

1. Dashboard/工作台列表被压成窄竖条、文字超出可点击盒，全局侧栏又覆盖内容安全区。
2. Dashboard 项目/任务和全局任务中心“查看详情”不能稳定进入任务所属项目。

## 2. 当前证据与根因假设

- `components/v2/dashboard/DashboardSections.tsx` 的项目使用 `<Link className="row">`；对应 `.row` 没有 `display:block` 和 `width:100%`，inline link 的背景/边框只包裹行内碎片。
- `app/layout.tsx` 对所有页面挂载 `GlobalSideNav`，但 `dashboard.module.css` 和 Task Center 根容器没有统一采用 `--workspace-nav-offset`。
- Dashboard 运行任务的 `RunningJob` 没有 `projectId/workbenchType/resultUrl`，点击被硬编码为 `/job-center`。
- `TaskCenter.handleAction` 仅在 `job.resultUrl` 存在时 `router.push`；无 `resultUrl` 的“查看详情”点击后直接 return。
- 部分 fixture `resultUrl` 指向仓库不存在的 `/projects/:id/...` 路由。

先用浏览器盒模型、当前 URL、控制台和网络记录验证上述假设；若证据不同，记录新根因后再改代码。

## 3. Task 0.1：统一项目/任务目标解析契约

**Files:**

- Create: `lib/navigation/project-target.ts`
- Create: `tests/ui-v2/navigation/project-target.test.mjs`
- Modify: `lib/client/v2/dashboard/types.ts`
- Modify: `lib/client/v2/dashboard/fixture-data.ts`
- Modify: `tests/fixtures/kiikis-v2/dashboard.json`
- Modify: `tests/ui-v2/dashboard/dashboard.test.mjs`

### Step 1：先写失败测试

覆盖所有映射和安全边界：

```ts
assert.equal(resolveProjectTarget({ projectId: "p1", workbenchType: "script" }), "/novel-workbench?projectId=p1&mode=screenplay");
assert.equal(resolveProjectTarget({ projectId: "p1", workbenchType: "storyboard" }), "/production?projectId=p1&mode=planning");
assert.equal(resolveProjectTarget({ projectId: "p1", workbenchType: "video" }), "/production?projectId=p1&mode=editor");
assert.equal(resolveProjectTarget({ projectId: "p1", workbenchType: "art" }), "/production?projectId=p1&mode=art");
assert.equal(resolveProjectTarget({ projectId: "p1", workbenchType: "song" }), "/song-workbench?projectId=p1");
assert.equal(resolveProjectTarget({ projectId: "p1", workbenchType: "viral" }), "/viral-workbench?projectId=p1");
assert.equal(resolveProjectTarget({ projectId: "p1", workbenchType: "production", sourceUnitId: "ep1" }), "/production?projectId=p1&sourceUnitId=ep1");
assert.equal(resolveProjectTarget({ projectId: "", workbenchType: "video" }), null);
assert.equal(resolveResultTarget({ resultUrl: "javascript:alert(1)" }), null);
assert.equal(resolveResultTarget({ resultUrl: "https://cdn.example.com/out.mp4" }), "https://cdn.example.com/out.mp4");
```

运行：

```bash
node --test tests/ui-v2/navigation/project-target.test.mjs
```

预期：模块不存在或行为缺失，测试 RED。

### Step 2：最小实现解析器

```ts
export type ProjectTargetInput = {
  projectId?: string | null;
  sourceUnitId?: string | null;
  workbenchType?: string | null;
  resultUrl?: string | null;
};

export function resolveProjectTarget(input: ProjectTargetInput): string | null {
  const projectId = input.projectId?.trim();
  if (!projectId) return null;
  const id = encodeURIComponent(projectId);
  const unit = input.sourceUnitId?.trim();
  // 使用穷举 switch；未知类型回退 /projects/:id 兼容路由。
}

export function resolveResultTarget(input: ProjectTargetInput): string | null {
  // 只允许 http(s) 或以 / 开头的同源路径；拒绝 //、javascript:、data:。
}
```

不要从任务标题或项目名称猜类型。详情目标与结果目标分开：详情进入 Kiikis 项目；结果可为可信外部资源。

### Step 3：补齐 Dashboard 任务 DTO

```ts
export interface RunningJob {
  id: string;
  projectId: string;
  sourceUnitId?: string;
  workbenchType: string;
  resultUrl?: string;
  // 保留现有字段
}
```

更新 TS/JSON fixture 并保持严格一致；每个任务必须有真实存在的项目目标。

### Step 4：GREEN

```bash
node --test tests/ui-v2/navigation/project-target.test.mjs tests/ui-v2/dashboard/dashboard.test.mjs
```

## 4. Task 0.2：修复 Dashboard 可点击卡片与直接跳转

**Files:**

- Modify: `components/v2/dashboard/DashboardSections.tsx`
- Modify: `components/v2/dashboard/dashboard.module.css`
- Modify: `tests/ui-v2/dashboard/dashboard.test.mjs`
- Create: `e2e/dashboard-task-navigation.spec.ts`

### Step 1：写结构回归测试

断言 Dashboard 复用解析器，运行任务渲染语义 `<Link>`，不再出现：

```ts
router.push("/job-center")
```

并断言 `.row` 具备：

```css
display: block;
width: 100%;
box-sizing: border-box;
```

先运行测试并确认 RED。

### Step 2：最小 UI 修复

- `getWorkbenchPath` 删除或改为调用 `resolveProjectTarget`，不得保留第二套映射。
- “继续创作”整卡使用解析后的 Link；无合法目标时显示不可点击卡和解释。
- 每个运行中任务整卡直接进入所属项目；“前往任务中心”仍保留为总览入口。
- `.row` 对 `<a>`、`<li>` 都是满宽块级盒；加 `min-width:0`，长标题允许省略或换行。
- 增加 `:focus-visible`，焦点轮廓不得被 `overflow` 裁掉。

### Step 3：响应式安全区

桌面根容器使用单一变量而不是魔法数字：

```css
@media (min-width: 769px) {
  .shell {
    padding-left: max(24px, var(--workspace-nav-offset));
  }
}
```

若实际盒模型证明应由通用 app shell 承担，则在 `app/globals.css` 增加可复用类，并让 Dashboard/Task Center 都使用；不得对所有页面重复叠加 offset。

### Step 4：Playwright 测试

在 390、768、1024、1440、1920、2560 宽度断言：

```ts
expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
await expect(page.getByRole("link", { name: /Umbral Pact EP06-EP10/ })).toBeVisible();
await page.getByText("EP06 关键帧生成").click();
await expect(page).toHaveURL(/projectId=proj-umbral-pact/);
```

截图需保留 1440 和 2560 两档，与用户原截图对比。

## 5. Task 0.3：修复任务中心“查看详情”

**Files:**

- Modify: `components/v2/task-center/TaskCenter.tsx`
- Modify: `components/v2/task-center/TaskCard.tsx`
- Modify: `lib/client/v2/jobs/api.ts`
- Modify: `tests/fixtures/kiikis-v2/jobs.json`
- Modify: `tests/ui-v2/task-center/task-center.test.mjs`
- Modify: `tests/ui-v2/task-center/api-adapter.test.mjs`
- Create: `e2e/task-center-navigation.spec.ts`

### Step 1：写失败测试

至少覆盖：

- 有 `resultUrl` 的完成任务，详情进入可信应用目标，“查看结果”单独打开结果。
- 无 `resultUrl` 但有 `projectId/workbenchType` 的运行任务进入项目。
- 无任何合法目标时不渲染可点击“查看详情”，而显示“暂不可查看”。
- `resultReferences` 中的 Provider 外部 URL 不能替代项目详情。
- fixture 所有内部路径路由在仓库中存在。

### Step 2：复用解析器

```ts
const detailTarget = resolveProjectTarget(job);
const resultTarget = resolveResultTarget(job);
```

- `TaskCenter.handleAction(view_detail)` 对 `detailTarget` 导航。
- `TaskCard` 接收或内部计算 `detailTarget`；无目标时按钮禁用并有 `title/aria-describedby`。
- 结果链接只在 `resultTarget` 合法时出现；外部链接使用 `target="_blank" rel="noopener noreferrer"`。
- API 适配器不得伪造空 `projectId` 的项目链接。

### Step 3：GREEN 与集成验证

```bash
node --test tests/ui-v2/navigation/project-target.test.mjs tests/ui-v2/dashboard/dashboard.test.mjs tests/ui-v2/task-center/*.test.mjs
npx playwright test e2e/dashboard-task-navigation.spec.ts e2e/task-center-navigation.spec.ts --project=chromium
```

## 6. 完整验证

```bash
npx tsc --noEmit
pnpm build
```

手工使用真实登录态验证至少 3 类项目与 5 个任务阶段。记录点击前 URL、点击后 URL、最终页面显示的项目名和控制台错误。

## 7. 交付证据

- RED 与 GREEN 测试输出。
- 6 档视口无水平溢出的数据与截图。
- Dashboard 项目卡、Dashboard 任务卡、任务中心详情三段录像。
- resolver 映射表和无法解析时的 UI 截图。
- `npx tsc --noEmit`、`pnpm build` 原始结果。
- commit SHA 与改动文件列表。

## 8. 禁止扩展

- 本阶段不实现 KK、社区、Stripe 或新任务后端。
- 不重做 Dashboard 视觉风格。
- 不用硬编码 demo project ID 掩盖真实 DTO 缺字段。
- 不把所有“查看详情”简单改成 `/job-center`。
