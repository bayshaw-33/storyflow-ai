# GitHub 分支收敛审查 — 2026-08-29

## 范围与结论

- 仓库：bayshaw-33/storyflow-ai；基线 main：`26e7a693cc6ad2db233ede7304f3ce4c1003c225`。
- 审查对象：远端 main 之外的 42 条分支。不是全站重构，不删除业务数据、现用源码、测试依赖或其他 Vercel 项目。
- C-03 合并提交：`64d206fcf723bbb563d0c57f0b43531ab003865c`，补入团队成员校验及绑定/解绑历史。
- 其余 37 条分支的 tip 已被 main 历史包含；另 4 条的每个独立提交均有 main 中 patch-id 相同的提交。
- **纠正早先审查**：commit SHA 不在 main 不等于代码遗漏。四条“冲突分支”及 Vercel 计费提交都是已等价集成的重复历史，无须再次合并、移植或恢复旧代码。
- 删除对象仅为下表分支引用；清理必须在 main 推送并验证生产后执行，且要求远端 tip 仍等于本表 SHA。

## C-03 代码与数据库

保留现有 Work-level V2.2 实现，仅补旧 project-level 绑定的访问控制与审计：
- Universe 所有者可访问；其他用户必须是相应团队的 active 成员。
- 权限查询失败时拒绝写入；新绑定与解绑记录历史；重复绑定不重复写记录。
- 原测试名为团队校验但使用了 Universe 所有者，现改为真实的跨用户团队场景，并覆盖非成员、所有者、成员查询失败。
- 生产库原本缺少 history/snapshot 表与 link.unbound_at；检查重复 project_id 绑定为 0 后，应用仓库已有增量迁移 `20260812000000_K2-C-03_project_universe_binding.sql`，登记对应 migration version。没有运行其他历史迁移，没有删除或改写用户项目。

## 重复补丁对应关系

| 旧分支/提交 | main 中等价提交 | 处置 |
| --- | --- | --- |
| feat/K22-P0-runtime-truth / `1e385d8f` | `c01e65bfbf2e9fbbe55ac955860a0574d9a0854c` | 保留 main 现状，清理旧引用 |
| trae/K2-T-01-dashboard / `393164f1` | `7260bd39d133a47ac129b3cc501f0a28cdd5462a` | 保留 main 现状，清理旧引用 |
| trae/K2-T-01-dashboard / `12c6133c` | `07b3b7cf521dea9ae5b4c0520b45b5a062ecc6ff` | 保留 main 现状，清理旧引用 |
| trae/K2-T-03-project-start / `eca3a546` | `e50bcd6e2278efd741218b58e2e08dc7de4e403b` | 保留 main 现状，清理旧引用 |
| trae/K2-T-05-task-center / `bac33fc9` | `dafc656d68910d006c90e83468ffdc571bc6b658` | 保留 main 现状，清理旧引用 |
| Vercel 历史计费部署 / `c2c78f0f` | `844cfe16919a022df82a2d0515b58360777733cd` | 三个相关文件与当前 main 内容相同，无须恢复 |

用 `git merge-base --is-ancestor` 验证已合并历史，用 `git cherry` 与 `git patch-id --stable` 对照改写过 SHA 的提交，而不以三点 diff 的文件数推定功能缺失。

## 文件处置

- `lib/client/v2/project-start/fixtures.ts` 已被现有 main 删除，保持删除状态。
- Dashboard 的 fixtures / fixture-data 仍被测试及显式预览路径引用；Jobs fixtures 仍被受显式开关控制的动态加载路径引用。均非无引用废文件，本次保留。
- 现有 UI、模型、播放器、画布、社区、数据库迁移文件及测试均不批量删除、不用旧分支版本覆盖。
- 本次业务源码范围仅 `lib/server/v2/inheritance/index.ts`，并扩充同目录现有测试。
- 清理两处过时测试断言：社区重试已迁移到统一空状态组件（补真实按钮点击验证），剪辑已走统一 production 路由。两项在原 main 同样失败；只更新测试，保留当前产品行为。

## 恢复备份

本地备份（不提交至公开仓库）：`/Users/kiikis000/Documents/Kiikis/backups/branch-consolidation-20260829/before-cleanup.bundle`。
已运行 `git bundle verify`，完整历史与原始分支 tip 可恢复。另有 `remote-branches.json` 保存审查清单。

恢复单条远端分支示例：
```sh
git fetch /Users/kiikis000/Documents/Kiikis/backups/branch-consolidation-20260829/before-cleanup.bundle refs/remotes/origin/BRANCH:refs/heads/recovered/BRANCH
git push origin refs/heads/recovered/BRANCH:refs/heads/BRANCH
```

## 全部分支审查清单

| 分支 | 清理前 tip | 依据 |
| --- | --- | --- |
| art-workbench-assistant-collapse | `54e3dae76d47796a31fad38db48dd01915911a7f` | 合并后 main 包含完整提交历史 |
| codex/K2-C-01-v2-contracts | `77c6e84e2920142fc34652498c686c3becd26825` | 合并后 main 包含完整提交历史 |
| codex/K2-C-02-universe-read | `44d5566135d9681176f3bb60333eae3c1606074b` | 合并后 main 包含完整提交历史 |
| codex/K2-C-03-project-universe-binding | `9ad425b59892a74fca9a307a796e19e2ef80cf58` | 合并后 main 包含完整提交历史 |
| codex/K2-C-04-change-proposals | `1c21331e7af30c791ffe575675a88a0febb0b433` | 合并后 main 包含完整提交历史 |
| codex/K2-C-05-canon-impact | `bac1e5f2a8f41d4fa2b2491d86324b9fff1dd13f` | 合并后 main 包含完整提交历史 |
| codex/K2-C-06-unified-jobs | `86381ad9ab543b39301c0dc3385c81b3c2182205` | 合并后 main 包含完整提交历史 |
| codex/c0-community-experience | `3441cbdb1f74fb1bd75e88472281bf9afac2a3fb` | 合并后 main 包含完整提交历史 |
| codex/coze-report-stability-v2 | `844cfe16919a022df82a2d0515b58360777733cd` | 合并后 main 包含完整提交历史 |
| codex/coze-verification-followup | `b57d519bd5171145e0cd3d9fdb062a6c883890d7` | 合并后 main 包含完整提交历史 |
| codex/v22-unified-workbench-recovery | `b3ba9c1a466050d5257cd5823ca5a9a774d54677` | 合并后 main 包含完整提交历史 |
| feat/K22-P0-runtime-truth | `1e385d8ffa2195043aba95a7825155c28a6d73f3` | 独立提交均与 main 补丁等价 |
| feat/K22-P1-work-history | `90fa2a8ff1fa12061cf5840cff4f40625422722f` | 合并后 main 包含完整提交历史 |
| feat/K22-P2-universe-inheritance | `686281d366e546ba80be727de1a63abfbe7da4ab` | 合并后 main 包含完整提交历史 |
| feat/K22-P3-screenplay-studio | `e64fbd8067390a2f16210647617a2ba9c724d14e` | 合并后 main 包含完整提交历史 |
| feat/K22-P6-release-uat | `05366cef4a6144f115b26f9379131fda4dd9c0b2` | 合并后 main 包含完整提交历史 |
| feat/infinite-canvas | `fbb8cf693795e7be3ce226feebf3d642c88bb31b` | 合并后 main 包含完整提交历史 |
| feat/v2 | `a3095c6a44746d31201777ae7b58a52ee9f5c579` | 合并后 main 包含完整提交历史 |
| feature/PRD-001-modal-entry | `f438a5cbff6bafafd6ed408c4a3340b91a5191bf` | 合并后 main 包含完整提交历史 |
| fix/K22-p0p1-trust | `5823997aa0015f8ab09b0eb9a457be29b729d89c` | 合并后 main 包含完整提交历史 |
| integration/K2-I-01-universe-adapt | `e4f9c2cb72f289c2949c04169e17ab83c5a0b11e` | 合并后 main 包含完整提交历史 |
| integration/K2-I-02-jobs-adapt | `4712a815f530600ef3023060b63c0950b275fe70` | 合并后 main 包含完整提交历史 |
| integration/K2-I-03-short-drama-e2e | `b70e516386d2589414d80760199dda0bf59a84de` | 合并后 main 包含完整提交历史 |
| integration/K2-I-04-marketplace-adapt | `385be6cee818639b81ac2a37e7be21c99c8425bb` | 合并后 main 包含完整提交历史 |
| trae/K2-1-Phase0-baseline | `d3c051ba24eed3e13fa17bb09a514dd3b42e7088` | 合并后 main 包含完整提交历史 |
| trae/K2-1-Phase1-foundation | `80c2ee3eaa50a7531cafd01d290b8e597d624c7a` | 合并后 main 包含完整提交历史 |
| trae/K2-2-Phase2-screenplay-handoff | `476077d5635f4e3c5f4a2248102fd244c451d2fa` | 合并后 main 包含完整提交历史 |
| trae/K2-3-Phase3-kk-runtime | `c733482c52715651477c328f6200083b29e1e419` | 合并后 main 包含完整提交历史 |
| trae/K2-4-Phase4-grants-collab | `9e84221df214886afff1545ed8e0447212e73914` | 合并后 main 包含完整提交历史 |
| trae/K2-5-Phase5-community | `18259ec6a0f3e79201e7f0a6a6ccd95b3ccb5795` | 合并后 main 包含完整提交历史 |
| trae/K2-6-Phase6-subscription | `1d76afdad884a28ba51cecc8a5bacf00e0205b23` | 合并后 main 包含完整提交历史 |
| trae/K2-7-Phase7-gate-validation | `6bd62b91fc385fba8277924bad111bc28ed08bf7` | 合并后 main 包含完整提交历史 |
| trae/K2-T-01-dashboard | `393164f10972f9807e96069c6f940e4dc909a660` | 独立提交均与 main 补丁等价 |
| trae/K2-T-02-workbench-shell | `18e1f27242781c5c24eaef155e4a0bf45f7bc46c` | 合并后 main 包含完整提交历史 |
| trae/K2-T-03-project-start | `eca3a54620609fb7230916e3a873ee62da4786ae` | 独立提交均与 main 补丁等价 |
| trae/K2-T-04-model-router | `178a5e52fa4cfdffa80da5c6b7d80867fbda5c78` | 合并后 main 包含完整提交历史 |
| trae/K2-T-05-task-center | `bac33fc9ca3737f1889a4160de421e93fda5e359` | 独立提交均与 main 补丁等价 |
| trae/K2-T-06-kk-companion | `1fbc54d5768361b1877c61d49ed0d9d1c786c783` | 合并后 main 包含完整提交历史 |
| trae/K2-T-07-universe-ui | `08c0953ac939f83502589443b4b3b713c64c9abb` | 合并后 main 包含完整提交历史 |
| trae/K2-T-08-short-drama-flow | `48cda427fc5ee99f57d5b7e0b1f5973b132325ef` | 合并后 main 包含完整提交历史 |
| trae/K2-T-09-marketplace-alpha | `ffdd4c08138e77ba2b6d313b7ce8cd5e4d91968e` | 合并后 main 包含完整提交历史 |
| trae/K2-T-10-licensing-creator-center | `c9cee0f42628937d096278759cceea2f9888a817` | 合并后 main 包含完整提交历史 |

## 验证

- 合并前继承测试 75/75；合并后扩展继承测试 79/79。
- 合并后 TypeScript 检查通过。
- 相关回归 308/308（包含继承、Dashboard、项目创建、任务中心、Jobs、Coze 修复与社区）；无跳过。
- 生产构建通过，84 个页面；沿用现有 LOGO_PRIMARY orphan 与 CSS autoprefixer 警告，无新增构建错误。
- 生产 SQL 只读复验：历史表、快照表、unbound_at、唯一索引、RLS、service-role INSERT 权限和 migration 记录全部就绪。
- 发布采用 GitHub main 集成触发 Vercel，不另行从脏工作区重复部署。最终 SHA、线上部署状态与远端分支清理结果以交付消息为准。
