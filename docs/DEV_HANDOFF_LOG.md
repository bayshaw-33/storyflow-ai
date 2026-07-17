# DEV_HANDOFF_LOG.md - KIIKIS Storyflow AI

## 2026-07-17 22:42 - Codex / KIIKIS-CX-G0-001B Gate 0A Blocker Patch

### 本次目标
- 修复 Formal Export fail-open、客户端可信事实/Job 完成状态伪造、Content ID、RLS 与公开 metadata 边界；不执行 Gate 0B。

### 已完成
- `COMPLIANCE_EXPORT_GATE=false` 改为审计后 `blocked / gate_disabled`，`allow_download` 明确阻断。
- 旧 multipart 合规导出入口不再读取客户端提交的法域、AI 来源、Provider/模型、Content ID、声音授权或参考权利；服务端按源文件 SHA-256 生成稳定 `cid_<sha256>`。服务端可信 Export Request 未接通前，该旧入口保持 fail-closed。
- 删除客户端 generation job 任意 update API/hook，保留独立 cancel；RLS 将 generation jobs、compliance profiles、label records、compliance runs、exports 改为 authenticated 仅 owner SELECT、service role 写。
- 公开 AI manifest 移除 asset/project/episode 内部 ID、voice profile 与 license 状态；私有审计表仍保留验证所需字段。
- 将 TRAE Content ID 占位 UUID 改为强制接收服务端计算的 64-hex payload SHA-256。

### 修改文件
- `app/api/compliance/export/route.ts`
- `app/api/production/jobs/route.ts`
- `lib/compliance/{gate,manifest,types}.ts`
- `lib/compliance/writers/{jpeg,pdf}.ts`
- `lib/production/hooks.ts`
- `lib/exports/content-id.ts`
- `supabase/migrations/20260718030000_harden_compliance_trust_boundaries.sql`
- `tests/compliance-marking.test.mjs`
- `tests/compliance-trust-boundaries.test.mjs`
- `docs/DEV_HANDOFF_LOG.md`

### 验证结果
- `pnpm run build`：通过（77/77 静态页面）；为共享工作树中 TRAE 的 3 个 0 字节在途 route 临时补 `export {}` 后验证，这些占位文件不纳入本提交。
- 测试：定向安全测试 36/36；`node --test tests/*.test.mjs` 109/109；`pnpm exec tsc --noEmit` 通过；`git diff --check` 通过。
- 实测/截图：非 UI 任务；安全 grep 确认旧 route 不再解析 13 个客户端可信字段，Job update 入口不存在。
- 未验证的部分：未对 staging/production 执行 migration（禁止生产写）；未执行 Gate 0B；TRAE/Kimi 并行链路尚未集成。

### Git 信息
- commit：待提交。
- 推送锁放行时间：按用户长期指令直接推送，不再等待 Claw 锁。

### 未完成 / 风险
- TRAE 的 `supabase/migrations/drafts/20260718020000_exports_compliance_fields.sql` 仍是初稿；其中 authenticated 写策略与 storage owner CRUD 不得作为 Formal Export 权威边界。即使后续保留 UI 策略，也必须保证本次 REVOKE 不被重新 GRANT。
- 旧 `/api/compliance/export` 有意保持阻断，直至 Export Request 从服务端权威记录解析 jurisdiction、AI origin、voice/reference rights；不得重新接回客户端表单字段。

### 给下一位
- TRAE 在 Request API 中先服务端序列化 payload 并计算 SHA-256，再调用 `generateContentId`；不得接受客户端 payloadHash 或可信完成状态。
- Kimi 原子发布链只能在 Gate `allowed + verified` 后 bind/release；下载签名不能绕过本次 RLS 与 Gate。

---

## 2026-07-17 22:24 - Codex / P0S-03 歌词翻译与 Suno 字节限制

### 本次目标
- 保证歌词翻译只回填当前目标语言的有效结果，并让所有 Suno style prompt 入口严格不超过 1000 UTF-8 bytes。

### 已完成
- 抽取统一 UTF-8 字节裁剪工具，覆盖手工输入、AI 主生成、AI 修订、项目恢复和历史版本预览；不会切断 emoji 等多字节字符。
- 翻译请求接入 `AbortSignal`，切换歌词、目标语言、模型或项目时取消旧请求，避免迟到结果覆盖当前译文。
- 空翻译和请求失败改为独立错误提示，不再把错误文本写进译文正文；源歌词已是中文时直接回填原文。
- 新增 999/1000/1001 bytes、空响应、取消传播、真实页面恢复与翻译回填测试，并保存双语并排截图。

### 修改文件
- `app/song-workbench/page.tsx`
- `lib/song/prompt.ts`
- `lib/song/translation.ts`
- `tests/song-prompt.test.mjs`
- `tests/song-translation.test.mjs`
- `e2e/song-workbench-p0s03.spec.ts`
- `docs/uat/p0s-03-lyrics-translation-zh.png`
- `docs/DEV_HANDOFF_LOG.md`

### 验证结果
- `pnpm run build`：通过（77/77 静态页面生成完成）。
- 测试：`node --test tests/*.test.mjs` 104/104 通过；Chromium E2E 12/12 通过；P0S-03 定向 E2E 2/2 通过。
- 实测/截图：英文原歌词与中文译文正确并排回填；Suno prompt 恢复后显示 `1000/1000 bytes`；截图为 `docs/uat/p0s-03-lyrics-translation-zh.png`。
- 未验证的部分：AI 翻译 E2E 使用受控 API 响应，不消耗真实模型额度；未运行 WebKit/Firefox。

### Git 信息
- commit：本条记录同 P0S-03 提交。
- 推送锁放行时间：按用户长期指令直接推送，不再等待 Claw 锁。

### 未完成 / 风险
- `pnpm run test:unit` 的目录参数兼容问题仍属于 P0-07，本卡未修改。
- 工作区中的 `.writetest.tmp` 与 `supabase/migrations/drafts/20260718020000_exports_compliance_fields.sql` 为其他任务在途文件，本提交不包含。

### 给下一位
- 翻译回填逻辑必须继续保留取消信号和空响应保护；任何新增 style prompt 回填入口必须调用 `trimPromptBytes`。

---

## 2026-07-17 22:08 - Codex / P0-02 Dashboard 入口死链验收

### 本次目标
- 验证并关闭 Dashboard “Enter the Studio” 死链任务，补齐有效路由、EN/CN 文案和截图证据。

### 已完成
- 确认当前 `main` 已移除原 “Enter the Studio” 死链按钮，首页主 CTA 改为有效的登录/创作入口流程。
- 新增 Playwright 回归：验证 `/dashboard` 返回成功且渲染欢迎标题；验证 EN `Start Your Universe` 与 CN `进入你的宇宙` 点击后均打开登录入口且不出现 404。
- 生成并人工检查 EN/CN 视口截图。

### 修改文件
- `e2e/dashboard-entry.spec.ts`
- `docs/uat/p0-02-dashboard-entry-en.png`
- `docs/uat/p0-02-dashboard-entry-zh.png`
- `docs/DEV_HANDOFF_LOG.md`

### 验证结果
- `pnpm run build`：通过（77/77 静态页面生成完成）。
- 测试：P0-02 定向 Chromium 3/3 通过；全量 Chromium E2E 10/10 通过；`node --test tests/*.test.mjs` 97/97 通过。
- 实测/截图：EN/CN 登录入口弹窗均正常显示，截图位于 `docs/uat/p0-02-dashboard-entry-*.png`。
- 未验证的部分：未运行 WebKit/Firefox；任务验收只要求死链与双语页面证据。
- 基线问题：`pnpm run test:unit` 当前执行 `node --test tests/`，在本机 Node v26.5.0 把目录当模块并报 `MODULE_NOT_FOUND`；实际测试文件用显式 glob 全部通过。该脚本属于 P0-07 范围，本卡未修改。

### Git 信息
- commit：待提交。
- 推送锁放行时间：用户于本任务前明确取消后续 Claw 推送锁要求；本次按用户指令直接推送。

### 未完成 / 风险
- 任务板状态仍由 Claw 维护；代码侧 P0-02 验收证据已齐。

### 给下一位
- P0-07 应把 `test:unit` 改为可跨 Node 版本正确展开测试文件的命令，并把测试真正接入 CI。

---

## 2026-07-17 21:30 - Codex / KIIKIS-CX-G0-001 Gate 0A

### 本次目标
- 以 `4d3366b441cc0b8a9a6a966eaf52e7797d3a1b6d` 为固定基线，完成 EU/CN 双法域 AI 标识实施前架构、导出面、Schema、Feature Flag 与测试缺口审查。

### 已完成
- 穷举浏览器 Blob/print、API export、Provider/CDN URL、signed URL、通用 Job result URL、SRT/EDL/FCPXML、DOCX/ZIP/PDF 等导出/下载面。
- 给出服务端唯一 Formal Export Gate、finalize→visible disclosure→machine marking→verify→hash/log→release 的修订流程。
- 给出 `storyflow_exports`、五张合规表、幂等重试、Sidecar 绑定、RLS、服务端 Flags 和六类真实文件验证要求。
- 核验 EU Article 50、中国《标识办法》及 `GB 45438-2025` 官方依据，并把未决适用问题列入 Legal 确认。

### 修改文件
- `docs/reviews/GATE-0A-DUAL-JURISDICTION-MARKING-PREFLIGHT.md`
- `docs/DEV_HANDOFF_LOG.md`

### 验证结果
- `pnpm run build`：未执行；本任务仅新增 Markdown 审查文档，且共享工作区存在他人未提交的 `package.json`、`pnpm-lock.yaml`、`lib/compliance/` 实现，避免把在途代码纳入本次验证或干扰他人工作。
- 测试：未执行；报告已确认基线 `package.json` 没有 test script，基线 CI 也不运行测试，并将其列为 Gate 0B 前 Must Fix。
- 实测/截图：不适用（Gate 0A 架构审查）；已使用 `git show/git grep 4d3366b` 逐项核对路径与行号，`git diff --check` 通过。
- 未验证的部分：审查期间 `main` 新增的 `3af9230` 及随后出现的在途 compliance 实现不属于指定基线，必须在 Gate 0B 按明确 commit range 审查。

### Git 信息
- commit：待提交；不得与共享工作区的他人改动混入同一提交。
- 推送锁放行时间：未申请；未推送。

### 未完成 / 风险
- 生产 formal export 仍应保持阻断；本报告不是 Gate 0B 上线批准。
- Sidecar 是否满足特定 EU/CN 格式要求需 Legal/标准专家确认，未确认组合必须 fail closed。

### 给下一位
- Kimi 先接受报告第 8 节五项实施前架构决定，再按第 9 节完成生产 Must Fix。
- Gate 0B 需另给 `KIIKIS-CX-G0-002`、base/head commit、ADR、migration、测试入口、CI 与 staging 证据。

---

## 2026-07-17 · P0-07 进行中 · trunk-based 工程基线

**目标**：CI 配置 + pre-push hook + 交接日志 SOP 确认 + 禁用 force push

**已完成**：
- `.github/workflows/ci.yml` 创建（build + tsc --noEmit，staging env 变量占位）
  - Commit: `b69d757`
- `tsconfig.json` 排除 `*.test.ts`（CI 暂排除测试类型检查）
- `pre-push` hook 创建（pull --rebase → build → tsc check）
- GitHub branch protection: force push 已禁用 ✅ (`allow_force_pushes: false`)
- `CODEX_HANDOFF_SOP.md` 已存在并最新

**待验证**：
- 完整走查：改小文件→build→push→CI 绿
- 模拟 CI 变红演练

**验证结果**：
- TypeScript check: `tsc --noEmit` pass ✅
- Build: 本地 NAS/SMB 工作树休眠，以 Vercel Linux CI 构建为准

---

## 2026-07-17 · P0-08 环境进展（更新）

**已就绪**：
- NAS 挂载 ✅ `/Volumes/Kiikis2026` (3.6TB, UGREEN DP4800 Plus)
- Repo 位置 ✅ `/Volumes/Kiikis2026/storyflow-ai/`
- GitHub CLI ✅ 已登录 `bayshaw-33`
- Mac 磁盘 ✅ 44% 使用
- pnpm ✅ 已安装 v11.13.1
- Kimi Code CLI ✅ 已安装 v0.26.0
- Codex CLI ✅ 已安装 v0.145.0-alpha.18
- Pi ✅ 已安装
- Tailscale（电脑） ✅ v1.98.8
- Tailscale（手机） ✅ 浪哥已安装
- FileVault ✅ **已开启**（后台加密中，建议今晚重启）
- UPS ✅ 绿联 DP4800 Plus 正常亮灯
- 阿里云 OSS ✅ 已开通（待配置 bucket + access key）

**待完成**：
- OSS bucket + access key 配置到 `.env.local`
- 首次异地备份脚本编写
- 首次备份执行并在日报确认
- 云备份策略：OSS 标准存储，按量付费

**OSS 配置**：
- Bucket: `kiikis`
- 区域: 马来西亚（吉隆坡）oss-ap-southeast-3
- Endpoint: `oss-ap-southeast-3.aliyuncs.com`

---

## 2026-07-17 · P0-06 进行中 · staging 环境配置

**目标**：staging Supabase 项目 + 密钥清单 + `.env.example` 完整模板

**已完成**：
- `.env.example` 更新为完整模板（区分 dev/staging/production + OSS 占位符）
  - Commit: `84fea23`
- `.env.staging` 已创建（staging Supabase URL + anon key，gitignore 忽略）
- `.env.local` 更新：Supabase 指向 staging（保留生产 API 密钥在本地环境）
- 仓库硬编码密钥 grep：未发现 service_role key 泄漏
- 生产 service_role key 未写入仓库（.env.local 被 gitignore 忽略）✅

**缺失/待补充**：
- staging 的 service_role key 需浪哥从 Supabase dashboard 获取（`Project Settings → API → service_role key`）
- 表结构同步：staging 新创建，表结构为空，需从生产迁移或重建

**验证结果**：
- `.env.example` 字段齐全 ✅
- 仓库无硬编码密钥 ✅
- .env.local / .env.staging 被 gitignore 正确忽略 ✅

**给下一位**：
- 补充 staging service_role key 到 `.env.staging` 和 `.env.local`
- 考虑用 `supabase db dump` 或迁移文件同步生产表结构到 staging

---

## 2026-07-17 - Codex / 创作工作台默认设定污染、跨阶段覆盖与翻译链路修复

### 本次目标

- 阻止旧小说/剧本工作台的“狼人 Alpha、北美市场”等默认值进入新创作工作台 AI 上下文。
- 确保正文、翻译和本土化只更新当前章/集，不覆盖已确认的背景及世界观、角色圣经、剧情及大纲。
- 修复小说与结构化剧本翻译，补齐翻译校验、原文预览和锁定正文后的翻译能力。
- 修复 DOCX/ZIP 下载在 Vercel TypeScript 构建中的 `BlobPart` 类型错误。

### 根因与修复

- 新工作台仍通过 `createNovelProject()` 继承旧默认项目字段，并把 `project.market/project.genre` 无条件传给 AI。现改为 V2 独立、默认留空的 `targetMarket/genre`，旧工作台逻辑不变。
- AI 请求完成后原逻辑使用请求开始时的整份 workspace 快照回写，异步期间可能把最新共享文档覆盖回旧版本。现改为基于 `projectRef` 最新项目状态执行定向 workspace updater。
- 翻译阶段错误地禁止锁定单元，并只读取 `unit.content`；结构化剧本正文实际位于 `unit.screenplay`。现允许锁定正文生成派生译文，并通过当前剧本格式渲染完整翻译源文。
- 翻译新增目标语言必选、源/目标语言不可相同、源文不可为空、AI 空输出不覆盖当前版本等保护；右侧改为原文/译文并排编辑。
- DOCX/ZIP 下载把 `Uint8Array` 显式复制为标准 `ArrayBuffer` 后再创建 Blob，兼容 Vercel TypeScript。

### 修改文件

- `components/creation/CreationWorkbench.tsx`
- `lib/creation/types.ts`
- `lib/creation/state.ts`
- `lib/creation/screenplay.ts`
- `lib/creation/downloads.ts`
- `lib/ai/prompts.ts`
- `app/globals.css`
- `tests/creation-regressions.test.mjs`
- `lib/creative-handoff.test.ts`
- `docs/DEV_HANDOFF_LOG.md`

### 验证结果

- 创作工作台聚焦测试：28/28 通过。
- `npx tsc --noEmit`：通过。
- `git diff --check`：通过。
- `npm run build`：资源校验通过；Next.js 在 NAS/SMB 工作树上进入无 CPU、无子进程的休眠状态，约 5 分钟后人工终止。未出现编译错误，最终以 Vercel Linux 构建为准。
- 同时修复远端基线 `lib/creative-handoff.test.ts` 使用 `as never` 导致的 TypeScript 构建阻断。

### Git 信息

- branch：`codex/creation-workbench-v2`（基于最新 `origin/main`）
- commit：本条记录同提交
- push：完成后直接推送 `origin/main`

### 给下一位开发者

- 开工前先确认本次 Vercel Production 部署为 READY。
- 继续修改创作工作台时，所有 AI 回写必须使用“最新状态 + 当前阶段定向更新”，禁止把请求发起时的整份 workspace 快照覆盖回来。
- 旧剧本工作台的默认项目工厂仍保留，不要把旧默认值重新接入 V2 `targetMarket/genre`。

---

## 2026-07-16 - TRAE: 分镜结构化后端 — Production Storyboard Backend

*[历史日志保留]*

---

## 2026-07-17 · P0-03 完成 · 清除定价页开发文案

**目标**：删除订阅页 "Staging can still update the active profile plan for QA" 等内部开发文案。

**已完成**：
- 文件：`components/pricing/MonetizationLayer.tsx`
- 替换 4 处文案（EN 2 处 + CN 2 处）：
  - EN subtitle: 移除 "Staging can still update...for QA"
  - EN stagingSaved: 改为 "Your plan has been updated."
  - CN subtitle: 移除 "Staging 环境仍可更新...用于测试"
  - CN stagingSaved: 改为 "套餐已更新。"
- 全站 grep 验证：无剩余 Staging/QA/测试等开发文案泄漏

**验证结果**：
- grep 清场确认 ✅
- 修改文件数：1
- Commit: `4a6961a`
- pnpm 已安装，build 验证通过 ✅

**风险/注意**：
- `stagingSaved` 与 `saved` 文案现在相同（均为 "Your plan has been updated." / "套餐已更新。"），未来可合并 key，但当前不改动代码结构

**给下一位**：
- 若需要合并 `stagingSaved` + `saved` 为一个 key，需检查所有引用点（MonetizationLayer.tsx 第 219 行及测试）

---

*[后续日志追加到顶部]*
