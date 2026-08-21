# KIIKIS V2.2 统一制作工作台验收与发布证据

日期：2026-08-20（2026-08-21 完成生产发布）
分支：`codex/v22-unified-workbench-recovery`
基线：`e8f1e581`
当前验收范围：统一入口、剧本 AI 工作台、制作工作台四阶段、分镜子视图、旧链接恢复、旧项目兼容。

## 已完成

- `/production` 是剧本、美术、分镜、视频的唯一制作工作台壳层。
- 顶层只保留四个阶段；“动态分镜”不再作为顶层页面，改为分镜阶段内的“运动预览”。
- 剧本阶段恢复为两栏结构：左侧工作流上下文，右侧以 AI 对话为主的创作区；文档与候选修改在同一工作区内切换。
- 剧本 Work、单位上下文和旧 `/script-workbench` 链接可恢复到统一 `/production`，刷新后保留项目、Work、Unit 身份。
- 旧项目优先读取标准化剧集/场景数据，并兼容历史嵌套项目导出；不会因切换到统一工作台而删除原有创作数据。
- 美术草稿按 `user + project + work` 隔离，避免不同 Work 互相覆盖。
- 分镜阶段统一承载镜头表、宫格、运动预览和视频提示词；视频阶段继续承载生成与交付。

## 自动化验证

| 验证 | 结果 |
|---|---:|
| 统一工作台及相关服务测试 | 241/241 通过 |
| 剧本服务测试 | 49/49 通过 |
| 分镜/美术回归测试 | 12/12 通过 |
| 长剧本验证（10 集 × 20 场） | 通过 |
| TypeScript | 通过 |
| `pnpm build` | 通过，83 个静态页面 |
| 本地 smoke 审计/契约/性能检查 | 通过 |
| 已认证 Playwright 新增恢复测试 | 2 个测试文件因缺少真实环境变量而跳过，未产生失败 |

已认证 Playwright 需要由验收环境注入以下变量后执行：

- `V22_E2E_PROJECT_ID`
- `V22_E2E_SCRIPT_WORK_ID`
- `V22_E2E_TOKEN`
- 可选 `V22_E2E_USER_ID`、`V22_E2E_UNIT_ID`

## 目标库门禁与发布状态

2026-08-21 收到用户明确的 `RELEASE APPROVED` 后，在隔离工作树中将 Supabase CLI 显式链接至 production；未使用主工作区中指向 staging 的链接或环境地址。

目标库登记信息：

- production：`vgcafbzksizlwmylphzu`（StoryFlow / kiikis.com 实际生产库）
- staging：`cwpyolxitkcpitqizgtq`（演练库）

生产数据库只应用了 `20260830000000_K22_unified_workbench_stage_identity.sql`。执行后确认：

- `ensure_project_stage_work(uuid,text,text,text,text)` 已存在；
- 函数为 `SECURITY DEFINER` 且固定 `search_path=public`；
- anon/authenticated 无直接执行权限；
- `supabase_migrations.schema_migrations` 已记录版本 `20260830000000`。

Vercel production 部署：

- 源代码提交：`dd6e602f11bb8ee0dcc297f89e77703baced03ff`
- deployment：`dpl_B98cw1wAA95BcCgPePJj8k3Zqjzw`
- deployment URL：`https://storyflow-pnhoj8tr0-bay-shaw-s-projects.vercel.app`
- production alias：`https://www.kiikis.com`
- Vercel 状态：`READY`

发布后 smoke 确认首页、项目入口、剧本/美术/分镜/视频四阶段均返回 HTTP 200；未认证的工作台上下文、阶段创建和项目创建 API 均返回 401，而不是 500。部署后 20 分钟窗口未发现 HTTP 500 运行日志。

## 回滚边界

- 代码回滚目标为本分支合并前的基线 `e8f1e581`。
- migration 仅创建或替换阶段 Work RPC 并收紧执行权限，不删除、更新或迁移既有项目数据。
- 若真实库验收发现问题，优先回滚统一入口路由与工作台壳层代码；保留已有项目、Work、版本和创作留痕数据。

## 发布后待办

1. 使用真实但受控的验收账号，执行新增 Playwright happy path 和旧链接恢复测试。
2. 将当前发布分支同步到 GitHub `main`，避免下一次 main 自动部署覆盖本次直接 Vercel 发布。
