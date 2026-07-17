-- Rollback: video idempotency unique constraint + storage_path field
-- Task: KIIKIS-P3-TRAE-003 §2
-- Author: TRAE
-- Review: Codex (staging execution required)
--
-- 回滚 supabase/migrations/20260718100000_video_idempotency_and_storage.sql
-- 非破坏性回滚：删约束 + 删列；现有 video job 的 input_params.idempotencyHash 不动
-- 注意：回滚后应用层 read-before-insert 仍生效（idempotencyHash 字段不变）

BEGIN;

-- 0. 删 bucket RLS policies
DROP POLICY IF EXISTS storyboard_videos_owner_insert ON storage.objects;
DROP POLICY IF EXISTS storyboard_videos_owner_select ON storage.objects;

-- 0.1 删 bucket（注意：会删 bucket 内所有对象，仅在 staging 回滚时执行）
-- 实际回滚时建议保留 bucket 仅删策略，下面这行注释掉
-- DELETE FROM storage.buckets WHERE id = 'storyboard-videos';

-- 1. 删索引
DROP INDEX IF EXISTS public.idx_generation_jobs_provider;
DROP INDEX IF EXISTS public.idx_generation_jobs_storage_path;
DROP INDEX IF EXISTS public.uq_generation_jobs_idempotency_hash;

-- 2. 删列
ALTER TABLE public.storyflow_generation_jobs
  DROP COLUMN IF EXISTS idempotency_hash,
  DROP COLUMN IF EXISTS storage_path;

COMMIT;
