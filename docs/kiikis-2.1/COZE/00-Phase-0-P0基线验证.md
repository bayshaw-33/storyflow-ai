# Phase 0 验证：工作台布局与任务跳转

> 验证需求：`K21-P0-UI-001..004`、`K21-P0-NAV-001..006`
> 输入：TRAE Phase 0 commit、部署 URL、测试输出、截图

## 1. 前置核验

- 部署 commit 等于 TRAE 交接 commit。
- Dashboard 和 `/job-center` 使用相同环境/账号。
- 记录是否 fixture；fixture 验证之后必须再验证至少一个真实项目和真实任务。
- 浏览器清除缓存后复现，控制台与网络面板全程记录。

## 2. 布局矩阵

视口：390×844、768×1024、1024×768、1440×900、1920×1080、2560×1440。

逐档检查：

- 页面 `scrollWidth <= clientWidth`。
- 769px 以上侧栏不覆盖标题、卡片或按钮；768px 以下侧栏隐藏。
- “继续创作”的每张卡背景/边框完整包住标题、徽标和元信息。
- 列表不是窄竖条，长中英文标题不溢出。
- Tab 键焦点可见，Enter 激活，触摸热区与整卡一致。
- 页面缩放 200% 后仍能操作。

保存 1440、2560 和 390 三档全页截图，并与用户原始截图进行并排说明。

## 3. Dashboard 项目导航

分别找 song、viral、novel/script、storyboard/video 项目：

1. 记录卡片项目名与 ID。
2. 点击卡片。
3. 记录最终 URL、页面标题、实际加载项目 ID。
4. 浏览器后退，验证焦点/滚动位置合理。

判定：URL 参数正确但页面加载了空草稿或其他项目仍为 FAIL。

## 4. Dashboard 任务导航

对 running、queued、result_ingesting 各选一项：

- 点击任务卡应直接进入所属项目/工作台，不只是 `/job-center`。
- 项目名与最终页面一致。
- “前往任务中心”仍进入总览。
- 无 project ID 的任务必须明确不可点击或解释，不可无响应。

## 5. 全局任务中心导航

至少验证：

| 场景 | 预期 |
|---|---|
| running 无 resultUrl、有 projectId | “查看详情”进入项目 |
| queued 无 resultUrl、有 projectId | 进入正确工作台 |
| completed 有内部 resultUrl | 详情进项目，“查看结果”进结果 |
| completed 有外部 URL | 详情仍进项目，结果新窗口安全打开 |
| 无合法 project/result | 禁用并显示原因 |
| 恶意/无效 URL | 不执行、不跳 404、不开放重定向 |

检查所有 fixture 内部链接返回非 404。检查控制台无路由/React 错误。

## 6. 自动化复跑

```bash
node --test tests/ui-v2/navigation/project-target.test.mjs tests/ui-v2/dashboard/dashboard.test.mjs tests/ui-v2/task-center/*.test.mjs
npx playwright test e2e/dashboard-task-navigation.spec.ts e2e/task-center-navigation.spec.ts --project=chromium
npx tsc --noEmit
pnpm build
```

## 7. PASS 门槛

- 6 档布局全部通过。
- 至少 4 类项目卡和 5 类任务详情进入正确真实对象。
- 没有点击无响应、404、开放重定向或 fixture 冒充。
- 自动化、typecheck、build 通过。

任一导航错误或主流视口压缩为 P0/P1，结论 FAIL。
