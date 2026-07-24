-- 20260728000000_admin_overview_indexes.sql
-- 运营看板聚合查询性能优化：generation_tasks / generation_jobs 按 created_at + status 分组统计

-- storyflow_generation_tasks: 按日趋势（created_at 范围过滤 + 分组）
CREATE INDEX IF NOT EXISTS idx_generation_tasks_created_at
  ON public.storyflow_generation_tasks (created_at);

-- storyflow_generation_tasks: 按 status 分组统计
CREATE INDEX IF NOT EXISTS idx_generation_tasks_status
  ON public.storyflow_generation_tasks (status);

-- storyflow_generation_jobs: 按 job_type 分组统计
CREATE INDEX IF NOT EXISTS idx_generation_jobs_job_type
  ON public.storyflow_generation_jobs (job_type);

-- storyflow_generation_jobs: 按日趋势
CREATE INDEX IF NOT EXISTS idx_generation_jobs_created_at
  ON public.storyflow_generation_jobs (created_at);

COMMENT ON INDEX public.idx_generation_tasks_created_at IS '运营看板：按日聚合生成任务趋势';
COMMENT ON INDEX public.idx_generation_tasks_status IS '运营看板：按状态分组统计成功率/失败率';
COMMENT ON INDEX public.idx_generation_jobs_job_type IS '运营看板：按多媒体类型分组统计';
COMMENT ON INDEX public.idx_generation_jobs_created_at IS '运营看板：按日聚合多媒体任务趋势';
