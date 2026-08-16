# 剧本工作台生产修复记录（2026-08-16）

> 范围：生产 503 根治 + 剧本室产品缺陷修复。按用户诊断清单执行，非 Phase 流程。

## 一、生产数据库（P0）

### 根因
- kiikis.com（Vercel）→ 生产库 `vgcafbzksizlwmylphzu`（StoryFlow，Seoul）；本机 CLI/`.env.local` 一直链接 `cwpyolxitkcpitqizgtq`（kiikis-staging）。
- V2.2 全部迁移此前只推过 staging；生产库迁移历史停在 20260724 + P0 两条，缺 41 条，其中剧本链路相关全部缺失 → `PGRST205` → 前端 503。

### 执行方式
- 通过 Supabase Management API `database/query`（CLI 登录 token，postgres 身份）执行；每条迁移包裹单一事务并登记 `supabase_migrations`。
- 先只读快照（`reports/2026-08-16-prod-premigration-snapshot.md`：14 用户/66 项目/4 works/7 universes/826 generations），后写入。
- 新热修迁移 `20260829030000_K22-hotfix_candidate_flow.sql` 先在 staging 演练（含 9 项行为断言的自清理验证套件）再上生产。

### 已应用到生产的迁移（13 条）
`20260812010000 K2-C-04`、`20260828010000 P1_work_history`、`20260828011000 P1_evidence_v22`、`20260828020000 P2_universe_inheritance`、`20260828030000 P3_units`、`20260828031000 P3_continuity`、`20260828060500 P6_complete_p4`、`20260828040000 P4_import`、`20260827040000 2.1_grants`、`20260828050000 P5_usage_media`、`20260828060000 P6_release_fixes`、`20260828061000 P6_fix_p4_policies`、`20260829030000 hotfix_candidate_flow`。

应用顺序说明（与时间戳不同，原因已写入执行脚本注释）：
1. P6_complete_p4 先于 P4：P4 原始建表缺自身 policy 引用的 `owner_id` 列（source_chunks / import_candidates / import_decisions）；自愈版先建全 schema，P4 幂等补齐。
2. 2.1_grants 先于 P5：P5 的 owner-select policy 子查询依赖 `storyflow_resource_grants`（自包含迁移）。

### 明确未应用（需用户 Gate 决策）
- `20260829000000_retire_novel_data`、`20260829010000_retire_novel_hardening`：会**删除生产 45 个小说标记项目及其全部子数据**。本次跳过；应用层的小说下线已由 `isRetiredNovelRecord` 代码逻辑生效（返回 410），不依赖删数据。
- 2.1 其余层（kk/community/billing/collab 等）：部署前端涉及处仍会 503，属既有缺口，未纳入本次范围。

### 核验结果
- 旧数据零变化：迁移后计数 = 快照基线（66/14/4/7/51/55/31/826），45 个小说项目仍在。
- 27 张新表、转换触发器、2 个热修 RPC、幂等列、历史登记（13 条）全部在位。
- 生产环境跑 9 项行为断言（非法转换拦截/载荷不可变/DELETE 拦截/原子 apply+指针更新/幂等重放/apply 后拒绝拦截/evidence 共存插入/reject RPC/幂等键唯一）全部通过，自清理无残留。

## 二、新热修迁移内容（20260829030000）
1. `storyflow_screenplay_unit_versions.idempotency_key` 列 + 部分唯一索引。
2. `storyflow_generation_request_snapshots.scope_json/request_json` 列（服务端一直在插入的幽灵列）。
3. candidates 状态 CHECK 增加 `pending_review`。
4. `guard_candidate_transitions` 触发器替换 P6 的全量拦截：仅允许 ready/pending_review → applied（须带版本）/rejected/superseded，载荷列不可变，DELETE 永远拦截。
5. `apply_screenplay_candidate` / `reject_generation_candidate` 原子 RPC（显式 `p_actor`，service-role 路径安全）；重建 `append_work_version` / `apply_generation_candidate` 为 actor 显式版（原版在 service-role 调用下 `created_by NOT NULL` 必挂）。
6. `storyflow_evidence_events` 双形态共存：放宽 7 月链式账本的 NOT NULL/CHECK，`event_type` 增加 `work_scoped`（7 月 RPC 仍自洽，K22 行 work 级）。

## 三、服务端代码修复
- **认证统一（27 个路由）**：所有 v2 works/universe-imports/community 等 `getViewerFromCookies` → `getViewerFromRequest`（Bearer 优先 + cookie 兜底）；`/resolve-work` 与页面入口同步修复 → 根治旧项目偶发 `Authentication required`。
- **错误分类（新增 `lib/server/v2/service-errors.ts`）**：`SUPABASE_SERVICE_ERROR` 解析 PGRST 码；`PGRST205/204/206 → schema_not_deployed`、429 → rate_limited、provider 网络 → provider_failed；响应只含安全码 + requestId，原始 PostgREST 码仅进服务端日志。剧本 6 个路由 + resolve-work 接入。
- **generation.ts**：消息补 `work_id`（原违反 NOT NULL）；候选插入 `pending_review`（原违反 CHECK）；apply/reject 改走原子 RPC（原直接 PATCH 被 P6 触发器拦截）；新增 `listMessages`（会话恢复）与 `appendEvidence`（雷同审查留痕）。
- **units.ts**：`adaptLegacyProject` 改读真实 `storyflow_episodes`/`storyflow_scenes` 表（原查询幽灵列 `work_id`/`episodes` 必 500）；scene beats 转正文。
- **真实 AI（新增 `lib/server/v2/screenplays/model-invoke.ts`）**：discuss / similarity_review / propose_change 三种目的接入 DeepSeek（flash→pro 自带回退），携带上下文包、最近 12 条会话、当前单元正文、工具阶段上下文；propose 强制 JSON patch 契约，解析失败降级为单个待审阅块（绝不静默改稿）。缺 API key 时如实 `provider_failed`，不再固定回声。
- **works GET**：返回面包屑数据（title/projectTitle/universeName）。
- **契约**：`CANDIDATE_STATUSES` 增加 `pending_review`。

## 四、客户端修复（剧本室）
- **专注模式两栏**：进入剧本室时 `html[data-screenplay-focus]` 折叠全局侧栏，页面 = 路径栏 + KK 主区。
- **底部工具抽屉**：文档/雷同/本土化/定稿等工具以主区 35%（220px–46%）底部浮层打开，KK 对话始终占主视区；窄屏回退常规流式。
- **会话恢复**：挂载即从服务端加载 KK 历史；`similarityReviewed` 由持久化消息推导（刷新不丢）；propose 后拉取最新会话。
- **雷同审查门禁**：未创建/未确认大纲时按钮禁用并解释原因；审查走 `purpose=similarity_review` 真实模型调用，服务端追加绑定大纲版本的证据事件。
- **三部曲规则统一**：左栏/空态/门禁文案一致——已创建节点自由回改；新节点严格按 世界观→角色圣经→剧情及大纲→分集→正文。
- **工具上下文驱动 KK**：当前对象/阶段目标/可用版本/下一步以上下文条展示并随请求发送。
- **本土化**：接入真实 KK 讨论（预填提示词 + 上下文），不再是说明卡片。
- **定稿与留痕**：真实导出当前单元定稿文本 + evidence package 生成/签名下载。
- **面包屑**：项目 / Universe / 当前单元。
- **错误中文化**：`clientErrorMessage` 映射（结构未部署/请重试/重新登录等），错误条附 requestId。
- 修复 `createUnit` 打错端点（原打到 legacy 适配路由）。

## 五、测试与验证
- 新增 `tests/contracts-v22/screenplay-hotfix.test.mjs`（12 项：work_id、pending_review、RPC 化 apply/reject、无 PATCH、证据事件、错误分类、中文映射）。
- `tests/contracts-v22` 138/138 通过（含更新后的 work-history 断言）。
- `npx tsc --noEmit` 0 错；`pnpm build` 通过（83 静态页）。
- 根目录全套 `node --test tests/*.test.mjs`：1819 通过 / 17 失败——失败项在干净 HEAD 上同样失败（Node 26 无法解析 `next/headers` 的既有环境问题，与本改无关，已用 git stash 对照验证）。
- staging：热修迁移演练 + 9 项行为断言通过。
- 生产：迁移后只读核验 + 行为断言通过 + 无残留。

## 六、防再发
- `scripts/verify-supabase-target.mjs`（`npm run verify:supabase-target`）：db push/写操作前校验 CLI 链接是否指向预期库，杜绝再次错库。

## 七、已知限制（不包装成完成）
- 2.1 其余层（kk 宠物资料/社区/billing/collab）生产表仍缺，相关入口仍会 503——需后续单独 Gate。
- 小说数据退休（45 项目删除）未执行，待用户决策；建议若执行前先做行级备份。
- DeepSeek 依赖 Vercel 生产 env 的 `DEEPSEEK_API_KEY`（已存在）；未配置时 KK 会明确报 AI 服务不可用，不再假成功。
- 线上登录态的完整创作旅程（建世界观→三部曲→雷同→分集→正文→导出）需真实账号交互验收；本次完成无鉴权路径与服务端结构核验。
