-- ============================================================
-- 回滚脚本（初稿，待 Codex 审核）
-- 仅用于 v4_core_tables migration 的结构回滚。
-- 警告：回滚会删除 v4 新表，表内数据将丢失。执行前必须先备份。
-- ============================================================

-- 事务边界：整体回滚或整体成功
BEGIN;

-- 安全检查：确认是 staging 或有明确回滚指令
-- 生产执行前请注释掉下面的 RAISE 并由 DBA 手动确认
RAISE NOTICE 'rollback.sql 初稿：仅用于 staging，生产需 DBA 签署';

-- 1. 删除 v4 新增表（按依赖顺序逆序）
DROP TABLE IF EXISTS public.storyflow_input_assets CASCADE;
DROP TABLE IF EXISTS public.storyflow_generation_job_targets CASCADE;
DROP TABLE IF EXISTS public.storyflow_export_archives CASCADE;
DROP TABLE IF EXISTS public.storyflow_creative_document_versions CASCADE;
DROP TABLE IF EXISTS public.storyflow_story_stages CASCADE;
DROP TABLE IF EXISTS public.storyflow_universe_shares CASCADE;
DROP TABLE IF EXISTS public.storyflow_assembly_items CASCADE;
DROP TABLE IF EXISTS public.storyflow_assembly_sequences CASCADE;
DROP TABLE IF EXISTS public.storyflow_selected_takes CASCADE;
DROP TABLE IF EXISTS public.storyflow_identity_passports CASCADE;
DROP TABLE IF EXISTS public.storyflow_character_portrayals CASCADE;
DROP TABLE IF EXISTS public.storyflow_casting_assignments CASCADE;
DROP TABLE IF EXISTS public.storyflow_keyframe_candidates CASCADE;
DROP TABLE IF EXISTS public.storyflow_keyframe_slots CASCADE;
DROP TABLE IF EXISTS public.storyflow_keyframe_sets CASCADE;

-- 2. 删除 v4 相关函数
DROP FUNCTION IF EXISTS public.is_team_member(UUID);
DROP FUNCTION IF EXISTS public.is_team_owner(UUID);

COMMIT;

-- 注意：
-- 1. 本脚本不恢复 baseline 之后的 migration（如 production_storyboard_backend 等）
-- 2. 本脚本不恢复已迁移的数据
-- 3. 完整回滚应从备份恢复，本脚本仅作为结构回退应急方案
-- 4. 执行后必须验证 baseline 表完整性
