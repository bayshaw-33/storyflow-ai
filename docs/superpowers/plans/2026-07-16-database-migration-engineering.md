# 数据库迁移工程 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Kiikis.com 的数据库迁移管理从手动 SQL 执行升级为 Supabase CLI 管理的标准化 migration 工作流。

**Architecture:** 使用 `supabase db pull` 从生产数据库拉取当前 schema 作为单一基线 migration，归档现有 7 个手动 SQL 文件为历史参考，建立 `supabase/` 标准目录结构和 CLI 工作流。后续所有 schema 变更通过追加 migration 文件实现。

**Tech Stack:** Supabase CLI, PostgreSQL, Homebrew (macOS), Git

**Spec:** `docs/superpowers/specs/2026-07-16-database-migration-engineering-design.md`

## Global Constraints

- 工作目录为 `/Volumes/Kiikis2026/storyflow-ai`（SMB NAS 挂载）
- SMB 路径的文件写入操作需通过 `python3` 脚本完成（Write/Edit 工具在 SMB 路径受限）
- 不修改已应用的 baseline migration，所有变更通过追加新 migration 实现
- 不提交 `SUPABASE_ACCESS_TOKEN` 和 `service_role key` 到代码
- 保持现有 `.gitignore` 规则不变
- 用户需手动提供 Supabase Project Ref ID（从 Dashboard 获取）

---

### Task 1: 安装 Supabase CLI

**Files:**
- 无文件修改（仅系统安装）

- [ ] **Step 1: 检查 Supabase CLI 是否已安装**

Run: `which supabase && supabase --version`
Expected: `supabase not found`（当前未安装）或显示版本号（如已安装则跳过 Step 2）

- [ ] **Step 2: 通过 Homebrew 安装 Supabase CLI**

Run: `brew install supabase/tap/supabase`
Expected: 安装成功，显示 `supabase` 已被安装到 `/opt/homebrew/bin/supabase`

- [ ] **Step 3: 验证安装**

Run: `supabase --version`
Expected: 显示版本号，如 `2.x.x`

---

### Task 2: 初始化 Supabase 项目结构

**Files:**
- Create: `supabase/config.toml`（由 `supabase init` 自动生成）
- Create: `supabase/.gitignore`（由 `supabase init` 自动生成）
- Create: `supabase/migrations/`（空目录，由 `supabase init` 自动生成）

- [ ] **Step 1: 在项目根目录运行 supabase init**

Run: `cd /Volumes/Kiikis2026/storyflow-ai && supabase init`
Expected: 输出 `Finished supabase init.` 并生成以下文件：
- `supabase/config.toml`
- `supabase/.gitignore`
- `supabase/migrations/`（目录）

- [ ] **Step 2: 验证 config.toml 已生成**

Run: `ls -la /Volumes/Kiikis2026/storyflow-ai/supabase/`
Expected: 显示 `config.toml`、`.gitignore`、`migrations/` 目录

- [ ] **Step 3: 检查 config.toml 内容**

Run: `cat /Volumes/Kiikis2026/storyflow-ai/supabase/config.toml`
Expected: 包含 `[project]`、`[api]`、`[db]` 等配置段

---

### Task 3: 登录 Supabase 并关联项目

**Files:**
- 无文件修改（仅 CLI 配置）

**注意：此任务需要用户交互（浏览器授权）。**

- [ ] **Step 1: 登录 Supabase**

Run: `supabase login`
Expected: 打开浏览器进行 OAuth 授权。授权完成后 CLI 显示 `You are now logged in.`

- [ ] **Step 2: 获取 Project Ref ID**

用户操作：打开 Supabase Dashboard > 选择项目 > Project Settings > General > Reference ID，复制 Project Ref ID。

- [ ] **Step 3: 关联到现有生产项目**

Run（在项目根目录）: `cd /Volumes/Kiikis2026/storyflow-ai && supabase link --project-ref <your-project-ref>`
将 `<your-project-ref>` 替换为 Step 2 获取的实际 ID。
Expected: 输出 `Finished supabase link.`

- [ ] **Step 4: 验证项目关联**

Run: `cd /Volumes/Kiikis2026/storyflow-ai && supabase status`
Expected: 显示关联的项目信息，包括 `Linked project` 和 Project Ref ID

---

### Task 4: 拉取当前生产数据库 schema 作为基线

**Files:**
- Create: `supabase/migrations/<timestamp>_remote_schema.sql`（由 `supabase db pull` 生成）

- [ ] **Step 1: 运行 db pull 拉取当前 schema**

Run: `cd /Volumes/Kiikis2026/storyflow-ai && supabase db pull`
Expected: CLI 从远程数据库拉取 schema 并生成 migration 文件。输出包含：
- `Schema written to supabase/migrations/<timestamp>_remote_schema.sql`
- `Run supabase db push to apply this migration.`

- [ ] **Step 2: 检查生成的 migration 文件名**

Run: `ls /Volumes/Kiikis2026/storyflow-ai/supabase/migrations/`
Expected: 显示形如 `20260716143000_remote_schema.sql` 的文件

- [ ] **Step 3: 将生成的 migration 重命名为 baseline**

Run（替换实际文件名）:
```bash
cd /Volumes/Kiikis2026/storyflow-ai
mv supabase/migrations/<实际生成的文件名>.sql supabase/migrations/20260716000000_baseline.sql
```
Expected: 文件重命名成功

- [ ] **Step 4: 验证 baseline migration 内容**

Run: `wc -l /Volumes/Kiikis2026/storyflow-ai/supabase/migrations/20260716000000_baseline.sql`
Expected: 文件存在且包含数百行 SQL（反映生产数据库的完整 schema）

检查关键表是否包含在内：
Run: `grep -c "create table" /Volumes/Kiikis2026/storyflow-ai/supabase/migrations/20260716000000_baseline.sql`
Expected: 显示表数量（应与生产数据库一致，约 30 个表）

- [ ] **Step 5: 检查 RLS 策略是否包含**

Run: `grep -i "policy" /Volumes/Kiikis2026/storyflow-ai/supabase/migrations/20260716000000_baseline.sql | head -20`
Expected: 如果生产数据库有 RLS 策略，应显示在 baseline 中。如果缺失，记录到 DEV_HANDOFF_LOG 中。

---

### Task 5: 归档现有 SQL 文件

**Files:**
- Create: `docs/archive/supabase-legacy/`（目录）
- Move: `docs/supabase-*.sql` → `docs/archive/supabase-legacy/`
- Create: `docs/archive/supabase-legacy/README.md`

- [ ] **Step 1: 创建归档目录**

Run: `mkdir -p /Volumes/Kiikis2026/storyflow-ai/docs/archive/supabase-legacy`
Expected: 目录创建成功

- [ ] **Step 2: 移动 7 个 SQL 文件到归档目录**

由于 SMB 路径限制，使用 python3 脚本移动文件：

```bash
cd /Volumes/Kiikis2026/storyflow-ai && python3 -c "
import shutil, os, glob

src_dir = 'docs/'
dst_dir = 'docs/archive/supabase-legacy/'

# 要移动的文件列表
sql_files = [
    'supabase-schema.sql',
    'supabase-phase2-migration.sql',
    'supabase-universe-migration.sql',
    'supabase-actor-team-migration.sql',
    'supabase-art-workbench-migration.sql',
    'supabase-admin-rls.sql',
    'supabase-auth-triggers.sql',
]

for f in sql_files:
    src = os.path.join(src_dir, f)
    dst = os.path.join(dst_dir, f)
    if os.path.exists(src):
        shutil.move(src, dst)
        print(f'Moved: {f}')
    else:
        print(f'Not found: {f}')

print('Done. Files in archive:')
for f in os.listdir(dst_dir):
    print(f'  {f}')
"
```
Expected: 7 个文件全部移动成功

- [ ] **Step 3: 验证 docs/ 中不再有 supabase-*.sql 文件**

Run: `ls /Volumes/Kiikis2026/storyflow-ai/docs/supabase-*.sql 2>/dev/null || echo "No SQL files in docs/"`
Expected: `No SQL files in docs/`

注意：`docs/supabase-auth-email-templates.md` 应保留在 `docs/`（这是文档，不是 migration）。

- [ ] **Step 4: 验证归档目录包含所有 7 个文件**

Run: `ls /Volumes/Kiikis2026/storyflow-ai/docs/archive/supabase-legacy/`
Expected: 显示 7 个 SQL 文件

- [ ] **Step 5: 创建归档目录 README.md**

使用 python3 写入文件（SMB 路径限制）：

```bash
cd /Volumes/Kiikis2026/storyflow-ai && python3 -c "
content = '''# Supabase Legacy SQL 归档

这些 SQL 文件是 Supabase CLI 引入之前，通过 Supabase Dashboard SQL Editor 手动执行的数据库迁移脚本。

## 状态：已被取代

这些文件已被 \`supabase/migrations/20260716000000_baseline.sql\` 取代。后者通过 \`supabase db pull\` 从生产数据库拉取了完整的当前 schema。

## 重要说明

- **不应再直接执行这些文件**。所有数据库变更应通过 Supabase CLI 管理。
- 这些文件保留作为历史参考，记录了 schema 的演进过程。
- 文件按执行顺序排列：
  1. \`supabase-schema.sql\` — Phase 1：用户、项目、组织基础表
  2. \`supabase-phase2-migration.sql\` — Phase 2：角色、集、场结构化数据
  3. \`supabase-universe-migration.sql\` — Universe 系统：Personal/Business/Shared 三层
  4. \`supabase-actor-team-migration.sql\` — 演员库系统：Actor、Identity Passport、Casting
  5. \`supabase-art-workbench-migration.sql\` — 美术工作台：资产、变体、生成记录
  6. \`supabase-admin-rls.sql\` — RLS 行级安全策略
  7. \`supabase-auth-triggers.sql\` — Auth 触发器

## 迁移到 CLI 管理

自 2026-07-16 起，所有数据库迁移通过 Supabase CLI 管理：
- 新建 migration：\`supabase migration new <description>\`
- 应用到生产：\`supabase db push\`
- 查看状态：\`supabase migration list\`
'''

with open('docs/archive/supabase-legacy/README.md', 'w') as f:
    f.write(content)
print('Created README.md')
"
```
Expected: `Created README.md`

---

### Task 6: 创建 supabase/README.md 工作流指南

**Files:**
- Create: `supabase/README.md`

- [ ] **Step 1: 写入 supabase/README.md**

使用 python3 写入文件（SMB 路径限制）：

```bash
cd /Volumes/Kiikis2026/storyflow-ai && python3 -c "
content = '''# Supabase Migration 工作流

本目录由 Supabase CLI 管理。所有数据库 schema 变更通过 migration 文件追踪。

## 目录结构

\`\`\`
supabase/
├── config.toml              # Supabase CLI 配置
├── migrations/              # Migration 文件（按时间戳排序）
│   └── 20260716000000_baseline.sql   # 当前生产 schema 基线
└── .gitignore
\`\`\`

## Migration 命名规范

\`\`\`
<YYYYMMDDHHMMSS>_<description>.sql
\`\`\`

- 时间戳前缀由 \`supabase migration new\` 自动生成
- description 使用蛇形命名（snake_case）
- 示例：\`20260717120000_add_shots_table.sql\`

## 常用命令

### 添加新 migration

\`\`\`bash
supabase migration new add_shots_table
# 生成 supabase/migrations/<timestamp>_add_shots_table.sql
# 编辑该文件，添加 CREATE TABLE / ALTER TABLE 语句
\`\`\`

### 应用 migration 到生产

\`\`\`bash
supabase db push
# 显示待应用的 migration 列表，确认后执行
# 已应用的 migration 不会重复执行
\`\`\`

### 查看 migration 状态

\`\`\`bash
supabase migration list
# 显示已应用和未应用的 migration 列表
\`\`\`

### 查看本地与远程差异

\`\`\`bash
supabase db diff
# 显示本地 migration 文件与远程数据库的差异
\`\`\`

## 工作流规则

1. **不修改已应用的 migration**。所有变更通过追加新 migration 实现。
2. **不直接在 Supabase Dashboard 执行 SQL**。所有 schema 变更通过 migration 文件。
3. **不提交敏感凭证**。Access token 通过 \`supabase login\` 交互式获取，不写入代码。
4. **每次 push 前运行 \`supabase migration list\`** 确认状态。
5. **一个 migration 对应一个逻辑变更**。不要在一个文件中混合多个不相关的表变更。

## 初始化历史

- 2026-07-16：通过 \`supabase db pull\` 从生产数据库拉取 baseline migration
- 历史手动 SQL 文件归档于 \`docs/archive/supabase-legacy/\`
'''

with open('supabase/README.md', 'w') as f:
    f.write(content)
print('Created supabase/README.md')
"
```
Expected: `Created supabase/README.md`

- [ ] **Step 2: 验证文件创建**

Run: `ls -la /Volumes/Kiikis2026/storyflow-ai/supabase/README.md`
Expected: 文件存在，大小约 1.5KB

---

### Task 7: 更新 .env.example

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: 读取当前 .env.example 内容**

Run: `cat /Volumes/Kiikis2026/storyflow-ai/.env.example`
Expected: 显示当前环境变量模板

- [ ] **Step 2: 添加 SUPABASE_PROJECT_REF 说明**

使用 python3 在文件末尾追加 Supabase CLI 相关说明：

```bash
cd /Volumes/Kiikis2026/storyflow-ai && python3 -c "
# 检查是否已包含 SUPABASE_PROJECT_REF
with open('.env.example', 'r') as f:
    content = f.read()

if 'SUPABASE_PROJECT_REF' in content:
    print('SUPABASE_PROJECT_REF already exists in .env.example, skipping')
else:
    addition = '''

# Supabase CLI (for database migrations)
# SUPABASE_PROJECT_REF is NOT a secret — it's your project's reference ID
# Find it at: Supabase Dashboard > Project Settings > General > Reference ID
# Used by: supabase link --project-ref <SUPABASE_PROJECT_REF>
# Note: Access token is obtained via interactive \`supabase login\`, not stored in .env
# SUPABASE_PROJECT_REF=your-project-ref-id
'''
    with open('.env.example', 'a') as f:
        f.write(addition)
    print('Added SUPABASE_PROJECT_REF documentation to .env.example')
"
```
Expected: `Added SUPABASE_PROJECT_REF documentation to .env.example` 或 `SUPABASE_PROJECT_REF already exists...`

---

### Task 8: 更新 DEV_HANDOFF_LOG.md

**Files:**
- Modify: `docs/DEV_HANDOFF_LOG.md`

- [ ] **Step 1: 读取 DEV_HANDOFF_LOG.md 当前内容**

Run: `head -30 /Volumes/Kiikis2026/storyflow-ai/docs/DEV_HANDOFF_LOG.md`
Expected: 显示当前最近的 handoff 条目

- [ ] **Step 2: 在文件顶部添加本次变更记录**

使用 python3 在文件开头插入新条目：

```bash
cd /Volumes/Kiikis2026/storyflow-ai && python3 -c "
entry = '''## [2026-07-16] TRAE Code: 数据库迁移工程 — Supabase CLI 基础设施

**变更类型**: 数据库基础设施

**变更内容**:
- 安装 Supabase CLI 并初始化 \`supabase/\` 目录
- 通过 \`supabase db pull\` 从生产数据库拉取基线 migration (\`20260716000000_baseline.sql\`)
- 将 7 个历史 SQL 文件从 \`docs/\` 移动到 \`docs/archive/supabase-legacy/\`
- 创建 \`supabase/README.md\` 工作流指南
- 更新 \`.env.example\` 添加 \`SUPABASE_PROJECT_REF\` 说明

**新增文件**:
- \`supabase/config.toml\` — CLI 配置
- \`supabase/README.md\` — 工作流指南
- \`supabase/migrations/20260716000000_baseline.sql\` — 生产 schema 基线
- \`docs/archive/supabase-legacy/README.md\` — 历史归档说明

**移动文件**:
- \`docs/supabase-*.sql\` → \`docs/archive/supabase-legacy/\` (7 个文件)

**修改文件**:
- \`.env.example\` — 添加 SUPABASE_PROJECT_REF 说明

**验证**:
- \`supabase migration list\` 显示 baseline 已应用
- Vercel build 不受影响
- 历史 SQL 文件完整归档

**后续影响**:
- 所有数据库 schema 变更通过 \`supabase migration new\` + \`supabase db push\` 管理
- 不再直接在 Supabase Dashboard 执行 SQL
- 后续 11 个子项目将通过此工作流添加新表

---

'''

with open('docs/DEV_HANDOFF_LOG.md', 'r') as f:
    original = f.read()

with open('docs/DEV_HANDOFF_LOG.md', 'w') as f:
    f.write(entry + original)

print('Updated DEV_HANDOFF_LOG.md')
"
```
Expected: `Updated DEV_HANDOFF_LOG.md`

---

### Task 9: 验证

**Files:**
- 无文件修改（仅验证）

- [ ] **Step 1: 验证 migration 状态**

Run: `cd /Volumes/Kiikis2026/storyflow-ai && supabase migration list`
Expected: 显示 `20260716000000_baseline` 已应用（`Applied` 状态）

- [ ] **Step 2: 验证目录结构完整**

Run: `ls -la /Volumes/Kiikis2026/storyflow-ai/supabase/ && ls /Volumes/Kiikis2026/storyflow-ai/supabase/migrations/`
Expected: 显示 `README.md`、`config.toml`、`.gitignore`、`migrations/` 目录，`migrations/` 下有 `20260716000000_baseline.sql`

- [ ] **Step 3: 验证归档目录完整**

Run: `ls /Volumes/Kiikis2026/storyflow-ai/docs/archive/supabase-legacy/`
Expected: 显示 7 个 SQL 文件 + `README.md`

- [ ] **Step 4: 验证 docs/ 不再有 supabase-*.sql**

Run: `ls /Volumes/Kiikis2026/storyflow-ai/docs/supabase-*.sql 2>/dev/null || echo "Clean - no SQL files in docs/"`
Expected: `Clean - no SQL files in docs/`

- [ ] **Step 5: 验证 .env.example 包含 SUPABASE_PROJECT_REF**

Run: `grep "SUPABASE_PROJECT_REF" /Volumes/Kiikis2026/storyflow-ai/.env.example`
Expected: 显示包含 `SUPABASE_PROJECT_REF` 的行

- [ ] **Step 6: 验证 Vercel build 不受影响**

Run: `cd /Volumes/Kiikis2026/storyflow-ai && pnpm run typecheck 2>&1 | tail -5`
Expected: typecheck 通过（`supabase/` 目录不影响 TypeScript 类型检查）

注意：由于 SMB 路径的 SWC binary 签名问题，本地 `pnpm run build` 可能失败。以 Vercel 部署作为最终验证标准。

---

### Task 10: 提交并推送

**Files:**
- Git commit 和 push

- [ ] **Step 1: 查看 git 状态**

Run: `cd /Volumes/Kiikis2026/storyflow-ai && git status`
Expected: 显示新增的 `supabase/` 目录、移动的文件、修改的 `.env.example` 和 `DEV_HANDOFF_LOG.md`

- [ ] **Step 2: 暂存所有变更**

Run: `cd /Volumes/Kiikis2026/storyflow-ai && git add supabase/ docs/archive/supabase-legacy/ docs/DEV_HANDOFF_LOG.md .env.example`
Expected: 文件暂存成功

注意：使用 `git add` 指定具体路径，不使用 `git add .` 或 `git add -A`，避免意外提交敏感文件。

- [ ] **Step 3: 确认 git status 不包含敏感文件**

Run: `cd /Volumes/Kiikis2026/storyflow-ai && git status`
Expected: 确认暂存区只有预期的文件，没有 `.env`、`service_role` 等敏感文件

- [ ] **Step 4: 提交变更**

Run:
```bash
cd /Volumes/Kiikis2026/storyflow-ai && git commit -m "$(cat <<'EOF'
chore: establish Supabase CLI migration infrastructure

- Initialize supabase/ directory with config.toml
- Pull current production schema as baseline migration
- Archive 7 legacy SQL files to docs/archive/supabase-legacy/
- Add supabase/README.md workflow guide
- Update .env.example with SUPABASE_PROJECT_REF documentation
- Update DEV_HANDOFF_LOG.md

All future schema changes will be managed via Supabase CLI
(supabase migration new + supabase db push).
EOF
)"
```
Expected: 提交成功，显示 commit hash

- [ ] **Step 5: 推送到远端**

Run: `cd /Volumes/Kiikis2026/storyflow-ai && git push origin main`
Expected: 推送成功

- [ ] **Step 6: 等待 Vercel 部署验证**

在 Vercel Dashboard 检查最新部署是否成功。
Expected: Vercel build 通过，部署成功。`supabase/` 目录不影响 Next.js 构建。

- [ ] **Step 7: 记录最终 commit hash 到 DEV_HANDOFF_LOG**

在 `docs/DEV_HANDOFF_LOG.md` 的本次条目中补充 commit hash 和 Vercel 部署结果。

使用 python3 更新文件：

```bash
cd /Volumes/Kiikis2026/storyflow-ai && python3 -c "
with open('docs/DEV_HANDOFF_LOG.md', 'r') as f:
    content = f.read()

# 在验证部分后添加 commit hash（需要手动替换）
old = '**验证**:
- \`supabase migration list\` 显示 baseline 已应用
- Vercel build 不受影响
- 历史 SQL 文件完整归档'

new = '''**验证**:
- \`supabase migration list\` 显示 baseline 已应用
- Vercel build 不受影响
- 历史 SQL 文件完整归档

**Commit**: <commit-hash>
**Vercel**: <部署状态>'''

content = content.replace(old, new)

with open('docs/DEV_HANDOFF_LOG.md', 'w') as f:
    f.write(content)

print('Updated DEV_HANDOFF_LOG with commit hash')
"
```

然后手动替换 `<commit-hash>` 和 `<部署状态>` 为实际值，并追加提交：

```bash
cd /Volumes/Kiikis2026/storyflow-ai && git add docs/DEV_HANDOFF_LOG.md && git commit -m "docs: update handoff log with commit hash and deploy status" && git push origin main
```
