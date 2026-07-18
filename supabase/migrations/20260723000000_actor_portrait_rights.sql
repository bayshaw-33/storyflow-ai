-- ============================================================
-- Migration: 20260723000000_actor_portrait_rights.sql
-- 目的：建立肖像权安全边界（PRD §肖像权安全边界）
--
-- 业务规则：
--   AI 生成演员：默认允许平台共享（rights_state = "ai_generated"）
--   用户上传真人照片：必须明确确认拥有肖像使用及再授权权利，
--                   才能设为 platform（rights_state = "portrait_confirmed"）
--   权利状态不明确：只允许 private/team（rights_state = "portrait_pending"）
--
-- 实现：
--   rights_state 存在 metadata.rights_state（jsonb），不需要新增列。
--   本 migration 只添加注释文档化约束，便于运维查询。
--   强约束在应用层 assertCanSetPlatformVisibility 实现。
-- ============================================================

COMMENT ON COLUMN public.storyflow_actor_profiles.metadata IS
  'metadata.rights_state ∈ {ai_generated, portrait_confirmed, portrait_pending}。'
  'visibility=platform 时 rights_state 必须为 ai_generated 或 portrait_confirmed。'
  '强制由应用层 assertCanSetPlatformVisibility 实现。';
