-- Migration: video idempotency unique constraint + storage_path field
-- Task: KIIKIS-P3-TRAE-003 §2 (硬补丁)
-- Author: TRAE
-- Review: Codex (staging execution required, DO NOT run on production)
--
-- 目的：
--   1. 数据库级幂等：video job 加 idempotency_hash 列 + 唯一约束
--      hash = sha256(shotId + prompt + firstframeUrl + duration)，应用层计算后写入
--      重复提交命中约束时返回现有 job，不依赖应用层 read-before-insert
--   2. CDN 临时 URL 转存：video job 加 storage_path 列，绑定自有 Supabase Storage 地址
--      禁止直接绑 provider 临时 URL（Codex MUST FIX）
--
-- 非破坏性：仅加列 + 约束，不删不改现有数据；约束 DEFERRABLE INITIALLY IMMEDIATE
-- 回滚脚本：supabase/migrations/rollback/20260718100000_video_idempotency_and_storage.sql

BEGIN;

-- 0. 创建 storyboard-videos Storage bucket（private，通过签名 URL 访问）
INSERT INTO storage.buckets (id, name, public)
VALUES ('storyboard-videos', 'storyboard-videos', false)
ON CONFLICT (id) DO NOTHING;

-- 0.1 bucket RLS policies（owner-scoped upload/sign）
-- 服务端用 service role key 上传+签名，绕过 RLS；这里加 owner 策略供客户端直接访问场景
CREATE POLICY storyboard_videos_owner_select ON storage.objects
  FOR SELECT USING (bucket_id = 'storyboard-videos' AND auth.uid() = owner);
CREATE POLICY storyboard_videos_owner_insert ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'storyboard-videos' AND auth.uid() = owner);

-- 1. 加 idempotency_hash 列（video job 专用，image/audio job 可空）
ALTER TABLE public.storyflow_generation_jobs
  ADD COLUMN IF NOT EXISTS idempotency_hash TEXT;

-- 2. 加 storage_path 列（转存到自有 Storage 后的路径）
ALTER TABLE public.storyflow_generation_jobs
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- 3. 唯一约束：(owner_id, idempotency_hash) WHERE idempotency_hash IS NOT NULL AND status != 'failed'
--    失败 job 不参与幂等（允许重试）
CREATE UNIQUE INDEX IF NOT EXISTS uq_generation_jobs_idempotency_hash
  ON public.storyflow_generation_jobs(owner_id, idempotency_hash)
  WHERE idempotency_hash IS NOT NULL AND status <> 'failed';

-- 4. 索引：按 storage_path 查询（用于清理/重签）
CREATE INDEX IF NOT EXISTS idx_generation_jobs_storage_path
  ON public.storyflow_generation_jobs(storage_path)
  WHERE storage_path IS NOT NULL;

-- 5. 索引：按 provider 查询（切换 provider 时排查旧 job）
CREATE INDEX IF NOT EXISTS idx_generation_jobs_provider
  ON public.storyflow_generation_jobs(provider, job_type);

-- 6. backfill：把现有 video job 的 idempotency_hash 从 input_params->>idempotencyHash 同步
--    应用层从 P3 开始会写 input_params.idempotencyHash，老 job 没有 → 留空（不影响）
UPDATE public.storyflow_generation_jobs
SET idempotency_hash = input_params->>'idempotencyHash'
WHERE job_type = 'video'
  AND idempotency_hash IS NULL
  AND input_params ? 'idempotencyHash';

-- 7. 注释
COMMENT ON COLUMN public.storyflow_generation_jobs.idempotency_hash IS
  'Video job 幂等键 sha256(shotId+prompt+firstframeUrl+duration)；唯一约束防止重复提交（Codex MUST FIX）';
COMMENT ON COLUMN public.storyflow_generation_jobs.storage_path IS
  '视频转存到 Supabase Storage storyboard-videos bucket 的路径；禁止直接绑 provider 临时 URL（Codex MUST FIX）';

COMMIT;
