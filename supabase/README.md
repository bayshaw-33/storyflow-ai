# Supabase Migration 工作流

本目录由 Supabase CLI 管理。所有数据库 schema 变更通过 migration 文件追踪。

## 目录结构

```
supabase/
├── config.toml              # Supabase CLI 配置
├── migrations/              # Migration 文件（按时间戳排序）
│   └── 20260716000000_baseline.sql   # 当前生产 schema 基线
└── .gitignore
```

## Migration 命名规范

```
<YYYYMMDDHHMMSS>_<description>.sql
```

- 时间戳前缀由 `supabase migration new` 自动生成
- description 使用蛇形命名（snake_case）
- 示例：`20260717120000_add_shots_table.sql`

## 常用命令

### 添加新 migration

```bash
supabase migration new add_shots_table
# 生成 supabase/migrations/<timestamp>_add_shots_table.sql
# 编辑该文件，添加 CREATE TABLE / ALTER TABLE 语句
```

### 应用 migration 到生产

```bash
supabase db push
# 显示待应用的 migration 列表，确认后执行
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

## 工作流规则

1. **不修改已应用的 migration**。所有变更通过追加新 migration 实现。
2. **不直接在 Supabase Dashboard 执行 SQL**。所有 schema 变更通过 migration 文件。
3. **不提交敏感凭证**。Access token 通过 `supabase login` 交互式获取，不写入代码。
4. **每次 push 前运行 `supabase migration list`** 确认状态。
5. **一个 migration 对应一个逻辑变更**。不要在一个文件中混合多个不相关的表变更。

## 初始化历史

- 2026-07-16：通过 pg_dump 从生产数据库拉取 baseline migration（44 表 + 67 RLS 策略）
- Supabase CLI 版本：2.109.1
- 历史手动 SQL 文件归档于 `docs/archive/supabase-legacy/`
