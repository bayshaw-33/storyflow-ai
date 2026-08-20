# KIIKIS V2.2 统一制作工作台验收与发布证据

日期：2026-08-20
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

本轮仅执行了只读目标检查。检查结果是 Supabase CLI 当前未链接目标库；因此本轮没有执行 migration、没有写入生产数据库、没有创建或切换 `kiikis-staging`，也没有声称线上发布已完成。

目标库登记信息：

- production：`vgcafbzksizlwmylphzu`（StoryFlow / kiikis.com 实际生产库）
- staging：`cwpyolxitkcpitqizgtq`（演练库）

在 CLI 明确链接 production、完成真实账号验收，并收到明确的 `RELEASE APPROVED` 前，不执行生产 migration 或线上部署。该限制是为了防止把测试库、演练库或错误 Supabase 项目当成生产目标。

## 回滚边界

- 代码回滚目标为本分支合并前的基线 `e8f1e581`。
- 本轮没有执行破坏性数据迁移，因此不存在需要反向删除生产数据的回滚动作。
- 若真实库验收发现问题，优先回滚统一入口路由与工作台壳层代码；保留已有项目、Work、版本和创作留痕数据。

## 未完成的发布前动作

1. 在正确的生产目标上完成只读 schema 检查与 migration dry-run。
2. 注入真实但受控的验收账号，执行新增 Playwright happy path 和旧链接恢复测试。
3. 由授权人明确给出 `RELEASE APPROVED` 后，才进行生产部署并重新做线上 smoke/UAT。
