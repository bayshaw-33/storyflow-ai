# KIIKIS V2.2 TRAE 分阶段执行计划

> **For agentic workers:** 每次只执行一个 Phase。使用任务清单逐项推进；实现时采用测试先行，小步提交，阶段 Gate 未通过不得进入下一阶段。

**Goal:** 将《KIIKIS 2.2 总 PRD》拆成七个可独立实施、验证、回滚和交接的 TRAE 阶段。

**Architecture:** 沿用 Next.js 15、React 19、Supabase/Postgres 与现有 V2 服务。V2.2 新增 Work 身份、不可变版本、Conversation Ledger、Universe Manifest/Snapshot、Source Work Import 和 WorkUsageLink；现有 V2 API 保持兼容，工作台统一消费服务端事实。

**Tech Stack:** Next.js 15、React 19、TypeScript 5.8、Supabase/Postgres/RLS、Node test runner、Playwright；媒体阶段使用 CosyVoice 服务适配器、`@xzdarcy/react-timeline-editor@1.0.0` 和 WebAV `@webav/av-cliper`。

## Global Constraints

- 产品版本：`KIIKIS V2.2`。
- V2.2 新契约：`contract_version = 2.2.0-alpha.1`。
- 既有 V2 `2.0.0-alpha.1` API 必须保持兼容；禁止静默改变旧响应。
- 当前创作范围不含小说；入口和新代码不得继续产生 `novel` Work。
- 顶级创作模块固定为：剧本、歌曲、美术、分镜、视频、配音、剪辑。
- 角色、场景、道具统一归美术；“动态分镜”不是独立顶级页面。
- 视频之后是剪辑；Checkpoint、Finalized、导出和 Evidence 是所有 Work 的横向能力。
- Work 可独立开始，但每个 Work 都必须可创建、绑定、打开和同步 Universe。
- 草稿允许跨阶段试做；正式批量制作、发布、授权和正式交付只能读取不可变 Finalized Version。
- AI、Universe 更新、上游修改和第三方组件不得静默覆盖历史版本。
- 正式 Asset Version 只保存持久对象存储引用，不保存 Provider 临时 URL。
- staging / production 中 fixture 默认关闭；fixture 数据不得冒充真实成功。
- 不修改任何既有 migration；所有数据库变更使用 forward-only 新 migration。
- 不使用 Twick；OpenCut 仅在 Editor API 稳定后另行评估。
- 第三方媒体工具只作为适配器，不拥有 KIIKIS Project、Work、Universe、Asset 或 Timeline 身份。

---

## 每次 TRAE 新任务只加载

1. `docs/kiikis-2.2/KIIKIS-2.2-总PRD-v1.0.md`
2. `docs/kiikis-2.2/TRAE/README.md`
3. 当前 Phase 文件
4. 上一阶段执行时生成的 `docs/kiikis-2.2/TRAE/handoffs/phase-N.md`

不要一次读取其他 Phase。发现阶段外需求时写入当前 handoff 的 `Deferred`，不得顺手实现。

## Delivery Map

| 顺序 | TRAE 阶段 | 核心产物 | 进入条件 |
|---:|---|---|---|
| 0 | [`00-Phase-0-真实入口与任务止血.md`](./00-Phase-0-真实入口与任务止血.md) | 真实入口、卡片跳转、Job 动作、KK 目标、社区/市场接线 | 当前 `origin/main` |
| 1 | [`01-Phase-1-Work身份会话版本与Evidence地基.md`](./01-Phase-1-Work身份会话版本与Evidence地基.md) | Work、版本、Conversation、Generation Snapshot、Evidence Manifest | Phase 0 PASS |
| 2 | [`02-Phase-2-Universe原生继承与统一Shell.md`](./02-Phase-2-Universe原生继承与统一Shell.md) | Universe Version、Manifest、Snapshot、Local State、统一 Shell | Phase 1 PASS |
| 3 | [`03-Phase-3-最好用的剧本室.md`](./03-Phase-3-最好用的剧本室.md) | 自由导航、软门禁、AI 候选 Diff、长剧本连续性 | Phase 2 PASS |
| 4 | [`04-Phase-4-站外原作导入Universe.md`](./04-Phase-4-站外原作导入Universe.md) | Source Work、长文档提取、审核台、Universe U1 | Phase 3 PASS |
| 5 | [`05-Phase-5-全工作流融合与横向导出.md`](./05-Phase-5-全工作流融合与横向导出.md) | 歌曲修复、视听主链、配音、剪辑、WorkUsageLink、全域 Evidence | Phase 4 PASS |
| 6 | [`06-Phase-6-集成UAT与发布.md`](./06-Phase-6-集成UAT与发布.md) | 六条 E2E、生产数据验证、监控、灰度和回滚 | Phase 5 PASS |

依赖是单向的：`0 → 1 → 2 → 3 → 4 → 5 → 6`。不得并行修改共享契约或提前合并后续 Phase。

## PRD Coverage Map

| PRD 范围 | 实施 Phase |
|---|---|
| `K22-G-001` 最好用的剧本创作台 | Phase 3 |
| `K22-G-002` Universe 对象级继承 | Phase 2 |
| `K22-G-003` 站外原作建立 Universe | Phase 4 |
| `K22-G-004` 统一 Project/Work/Universe/Version 身份 | Phase 0、1、2、5 |
| `K22-G-005` 剧本和歌曲沟通记录 | Phase 1、3、5 |
| `K22-G-006` Dashboard/任务中心/KK 真实目标 | Phase 0 |
| `K22-G-007` 创作制作融合与单一分镜 | Phase 3、5 |
| `K22-G-008` 全 Work 成果与留痕 | Phase 1、5 |
| `K22-G-009` 社区和演员市场 | Phase 0、6 |
| `K22-G-010` 轻量配音与剪辑 | Phase 5 |
| `K22-ENTRY-001..006` | Phase 0 Task 0.1–0.2 |
| `K22-JOB-001..006`、`K22-KK-001..003` | Phase 0 Task 0.3–0.4 |
| `K22-SW-001..008` | Phase 3 Task 3.1–3.5 |
| `K22-UNI-001..008` | Phase 2 Task 2.1–2.5 |
| `K22-IMP-001..010` | Phase 4 Task 4.1–4.5 |
| `K22-SONG-001..005` | Phase 5 Task 5.2 |
| `K22-MKT-001..005` | Phase 0 Task 0.5、Phase 6 Journey F |
| PRD 13：横向 Finalized/Export/Evidence | Phase 1 Task 1.4–1.5、Phase 5 Task 5.6 |
| PRD 16–18：恢复、非功能与指标 | Phase 6 Task 6.2–6.5 |
| PRD 19：六条端到端 Journey | Phase 6 Task 6.3 |

## 阶段执行协议

1. 执行 `git fetch origin`、`git status --short --branch`、`git rev-parse origin/main`，记录用户现有改动与 base commit。
2. 从最新 `origin/main` 创建当前 Phase 文件指定的分支或独立 worktree；不得复用残留改动。
3. 阅读当前 Phase 的 `Files` 与 `Interfaces`，先确认路径仍存在；路径漂移时只做等价映射并写入 handoff。
4. 先增加 Phase 指定的 contract/regression 测试，运行并保存目标行为缺失导致的 RED 证据。
5. 只实现当前 Phase 的最小闭环；数据库、服务端、客户端、E2E 分开提交。
6. 执行 Phase 测试、相关旧回归、`npx tsc --noEmit` 和 `pnpm build`。
7. 使用真实登录态做浏览器验证；涉及数据库时同时做 RLS 正反例和 migration audit。
8. 生成 handoff，提交当前分支，停止执行；Gate 通过前不得进入下一 Phase。

## 推荐提交顺序

```text
test/contract → migration/server → client/UI → integration/e2e → docs/handoff
```

每个 commit 必须可单独说明和回滚。禁止一个 commit 同时包含当前阶段和后续阶段功能。

## 通用验证矩阵

每份 Phase 在“完整验证”中给出了可直接复制的完整命令。除此之外，每个 Phase 都必须执行：

```bash
npx tsc --noEmit
pnpm build
```

涉及 UI 的 Phase 必须执行该 Phase “完整验证”列出的 Playwright 命令和 `--project=chromium`。

涉及 migration 的 Phase 还必须保存：

- migration 在隔离数据库的执行输出。
- owner、其他登录用户、匿名用户和 service role 的 RLS 正反例。
- 重复请求、并发请求和幂等键测试。
- audit SQL 为零异常的输出。

## 完成声明禁区

存在以下任一情况时不得写“完成”：

- 只通过 fixture，未验证真实 API 或数据库。
- 可点击控件仍无真实目标或真实动作。
- 测试未实际运行，或 RED 阶段不是由目标行为缺失导致。
- migration 未执行、RLS 未测、历史 migration 被修改。
- 会话、版本、来源或 Universe 更新仍会静默覆盖。
- Provider 临时 URL 被写入正式版本。
- 社区 Feed 或演员市场用空数据掩盖服务错误。
- V2.2 行为破坏既有 `2.0.0-alpha.1` API。
- 有 P0/P1 失败被写成“已知问题”后继续进入下一 Phase。

## 标准 Handoff

执行者在 `docs/kiikis-2.2/TRAE/handoffs/phase-N.md` 写入：

```markdown
# Phase N Handoff

- Branch:
- Base commit:
- Commits:
- Migration applied to:
- RED evidence:
- GREEN checks:
- Browser evidence:
- Changed files:
- Contract changes:
- Deferred:
- Known failures:
- Rollback:
- Gate: PASS | CONDITIONAL PASS | FAIL
```

`CONDITIONAL PASS` 只能由用户或独立验收者接受；TRAE 不能自行把当前阶段标记为可继续。

## 外部依赖边界

- CosyVoice 使用官方 `FunAudioLLM/CosyVoice` 的独立服务部署方式；Web 应用只调用 KIIKIS provider adapter。
- React Timeline Editor 只负责轨道交互；`kiikis.timeline/1` 才是持久事实源。
- WebAV 使用 `@webav/av-cliper` 做浏览器端预览/组合/导出，并保留 EDL、FCPXML 或服务端导出退路。
- 所有依赖在引入 commit 中固定版本、保存许可证文本或链接，并通过 Next.js 生产构建。
