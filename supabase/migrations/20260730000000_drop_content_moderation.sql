-- 20260730000000_drop_content_moderation.sql
-- 回滚：删除内容审核子项目1的举报表和审核记录表（方向调整，改用发布前审批模型）

DROP TABLE IF EXISTS public.storyflow_content_moderation CASCADE;
DROP TABLE IF EXISTS public.storyflow_content_reports CASCADE;
