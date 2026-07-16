# 数据库迁移工程 — 设计文档

**日期**: 2026-07-16
**状态**: 已确认
**作者**: TRAE Code（接替 Codex）

## 1. 背景与问题

Kiikis.com 当前有 7 个 SQL 迁移文件散落在 `docs/` 目录下，通过 Supabase Dashboard SQL Editor 手动执行。这种方式存在以下问题：

- **无版本控制**：无法追踪哪些 migration 已应用、何时应用
- **无顺序保证**：依赖手动按顺序执行，容易遗漏或重复
- **无回滚机制**：错误应用后难以恢复
- **无环境一致性**：新环境搭建需要手动查找并按顺序执行所有 SQL 文件
- **无团队协作**：多人开发时无法协调 schema 变更

## 2. 目标

- 建立 Supabase CLI 管理的 migration 工作流
- 将现有生产数据库 schema 拉取为基线 migration
- 定义清晰的 migration 命名规范和开发工作流
- 后续子项目通过标准 migration 添加新表，不再手动执行 SQL

## 3. 范围边界

**本次仅包含基础设施**：
- 初始化 `supabase/` 目录
- 安装和配置 Supabase CLI
- 拉取当前生产 schema 作为基线
- 定义命名规范和工作流文档
- 归档现有 7 个 SQL 文件

**不包含**：
- 后续子项目的新表 migration（各自在子项目中添加）
- 本地 Docker Supabase 环境（直连生产）
- CI/CD 自动化 migration（手动 db push）
- 种子数据管理（YAGNI）

## 4. 设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 基线策略 | `supabase db pull` 拉取当前状态 | 生产数据库已包含所有表，最可靠 |
| 应用方式 | 手动 `supabase db push` | 小团队，简单直接 |
| 本地开发 | 直连生产 Supabase | 符合现有 SMB+Vercel 工作流 |
| 任务范围 | 仅基础设施 | 后续表在各子项目中添加 |
| 实施方案 | 最小基础设施（方案 A） | 符合 YAGNI，快速落地 |

## 5. 目录结构

```
storyflow-ai/
├── supabase/
│   ├── README.md                              # 工作流指南
│   ├── config.toml                            # Supabase CLI 配置（supabase init 生成）
│   ├── migrations/
│   │   └── 20260716000000_baseline.sql        # db pull 拉取的当前生产 schema
│   └── .gitignore                             # 忽略 .temp 目录
├── docs/
│   ├── archive/
│   │   └── supabase-legacy/                   # 历史归档
│   │       ├── README.md                      # 说明这些是 CLI 前的手动 SQL
│   │       ├── supabase-schema.sql            # Phase 1
│   │       ├── supabase-phase2-migration.sql  # Phase 2
│   │       ├── supabase-universe-migration.sql
│   │       ├── supabase-actor-team-migration.sql
│   │       ├── supabase-art-workbench-migration.sql
│   │       ├── supabase-admin-rls.sql
│   │       └── supabase-auth-triggers.sql
│   └── supabase-auth-email-templates.md        # 保留（文档，非 migration）
└── .env.example                               # 添加 SUPABASE_PROJECT_REF 说明
```

## 6. Migration 命名规范

```
supabase/migrations/<YYYYMMDDHHMMSS>_<description>.sql
```

**规则**：
- 时间戳前缀由 `supabase migration new` 命令自动生成
- description 使用蛇形命名（snake_case），简明描述变更内容
- 一个 migration 文件对应一个逻辑变更（可包含多个 SQL 语句）

**示例**：
- `20260716143000_add_shots_table.sql`
- `20260717120000_add_generation_jobs.sql`
- `20260718100000_add_keyframe_slots.sql`

## 7. 初始化步骤

```bash
# 1. 安装 Supabase CLI (macOS)
brew install supabase/tap/supabase

# 2. 初始化项目（在项目根目录）
cd /Volumes/Kiikis2026/storyflow-ai
supabase init

# 3. 登录 Supabase（交互式，浏览器授权）
supabase login

# 4. 关联到现有生产项目
#    Project Ref ID 从 Supabase Dashboard > Project Settings > General > Reference ID 获取
supabase link --project-ref <your-project-ref>

# 5. 拉取当前生产数据库 schema 作为基线
supabase db pull

# 6. 将生成的 migration 重命名为 baseline
#    db pull 生成的文件名形如 <timestamp>_remote_schema.sql，请检查实际文件名
ls supabase/migrations/
mv supabase/migrations/<实际生成的文件名>.sql supabase/migrations/20260716000000_baseline.sql

# 7. 归档旧 SQL 文件
mkdir -p docs/archive/supabase-legacy
mv docs/supabase-*.sql docs/archive/supabase-legacy/
```

## 8. 日常工作流

### 添加新 migration（后续子项目使用）

```bash
supabase migration new add_shots_table
# 生成 supabase/migrations/<timestamp>_add_shots_table.sql
# 编辑该文件，添加 CREATE TABLE 语句
```

### 应用到生产数据库

```bash
supabase db push
# CLI 会显示待应用的 migration 列表，确认后执行
# 已应用的 migration 不会重复执行
```

### 查看 migration 状态

```bash
supabase migration list
# 显示已应用和未应用的 migration 列表
```

### 查看本地与远程差异

```bash
supabase db diff
# 显示本地 migration 文件与远程数据库的差异
```

## 9. 现有 SQL 文件处理

- 7 个 SQL 文件移动到 `docs/archive/supabase-legacy/`
- 添加 `docs/archive/supabase-legacy/README.md` 说明：
  - 这些是 CLI 之前通过 Supabase Dashboard 手动执行的 SQL
  - 已被 `supabase/migrations/20260716000000_baseline.sql` 取代
  - 保留作为历史参考，不应再直接执行
- `docs/supabase-auth-email-templates.md` 保留在 `docs/`（这是文档，不是 migration）

## 10. 安全约束

- `supabase/.gitignore` 忽略 `.temp/` 目录
- **不提交** `SUPABASE_ACCESS_TOKEN` 到代码（通过 `supabase login` 交互式获取）
- **不提交** `.env` 文件（已在 `.gitignore` 中）
- `.env.example` 添加注释说明如何获取 `SUPABASE_PROJECT_REF`
- **不提交** Supabase 服务密钥（service_role key）

## 11. 验证标准

- [ ] `supabase migration list` 能正确显示 baseline 已应用
- [ ] 新建一个空 migration 文件，确认 `supabase db push` 能识别（dry run）
- [ ] Vercel build 不受影响（`supabase/` 目录不影响 Next.js 构建）
- [ ] `docs/archive/supabase-legacy/` 包含所有 7 个原 SQL 文件
- [ ] `supabase/README.md` 包含完整工作流说明

## 12. 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| `db pull` 可能遗漏 RLS 策略 | 拉取后手动检查 `supabase/migrations/baseline.sql` 内容 |
| 现有表结构有手动修改未记录 | `db pull` 会捕获当前实际状态，包含所有手动修改 |
| Supabase CLI 版本变更 | README 记录当前使用的 CLI 版本 |
| SMB 网络文件系统导致 CLI 异常 | 在本地工作目录操作，非 SMB 路径 |

## 13. 后续子项目依赖

本基础设施完成后，后续 11 个子项目将按以下方式使用：

1. 每个子项目通过 `supabase migration new <name>` 创建 migration
2. 在 migration 文件中编写 `CREATE TABLE` / `ALTER TABLE` 语句
3. 通过 `supabase db push` 应用到生产
4. 在代码中通过 Supabase client 访问新表

**不修改**现有已应用的 baseline migration。所有变更通过追加新 migration 实现。
