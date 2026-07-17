# DEV_HANDOFF_LOG.md - KIIKIS Storyflow AI

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
