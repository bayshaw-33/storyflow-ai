# Supabase Legacy SQL 归档

这些 SQL 文件是 Supabase CLI 引入之前，通过 Supabase Dashboard SQL Editor 手动执行的数据库迁移脚本。

## 状态：已被取代

这些文件已被 `supabase/migrations/20260716000000_baseline.sql` 取代。后者通过 pg_dump 从生产数据库拉取了完整的当前 schema。

## 重要说明

- **不应再直接执行这些文件**。所有数据库变更应通过 Supabase CLI 管理。
- 这些文件保留作为历史参考，记录了 schema 的演进过程。
- 文件按执行顺序排列：
  1. `supabase-schema.sql` — Phase 1：用户、项目、组织基础表
  2. `supabase-phase2-migration.sql` — Phase 2：角色、集、场结构化数据
  3. `supabase-universe-migration.sql` — Universe 系统：Personal/Business/Shared 三层
  4. `supabase-actor-team-migration.sql` — 演员库系统：Actor、Identity Passport、Casting
  5. `supabase-art-workbench-migration.sql` — 美术工作台：资产、变体、生成记录
  6. `supabase-admin-rls.sql` — RLS 行级安全策略
  7. `supabase-auth-triggers.sql` — Auth 触发器

## 迁移到 CLI 管理

自 2026-07-16 起，所有数据库迁移通过 Supabase CLI 管理：
- 新建 migration：`supabase migration new <description>`
- 应用到生产：`supabase db push`
- 查看状态：`supabase migration list`
