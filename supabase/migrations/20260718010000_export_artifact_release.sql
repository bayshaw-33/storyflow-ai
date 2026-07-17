-- KM-G0-002C: 导出 artifact 发布链（private quarantine → immutable staging → atomic bind → gated download）
-- 新建:
--   storage buckets: export-quarantine (私有, 隔离区) / export-artifacts (私有, 不可变正式区)
--   public.storyflow_export_artifacts: artifact 状态机记录表
--
-- 设计约束:
--   * final key 内容寻址 (<owner>/artifacts/<sha256>) — 不可变、天然去重、幂等
--   * 先写对象存储, 后写数据库 (与 PRD §5.4 一致); 孤儿 staging 由清理任务收敛
--   * 所有访问经 service role; 私有桶默认拒绝 anon/auth 直连
--
-- Rollback (手动执行):
--   DROP TABLE IF EXISTS public.storyflow_export_artifacts;
--   DELETE FROM storage.buckets WHERE id IN ('export-quarantine', 'export-artifacts');

-- ============================================================
-- 1. 私有存储桶 (幂等)
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('export-quarantine', 'export-quarantine', false, 1073741824),
  ('export-artifacts',  'export-artifacts',  false, 1073741824)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. storyflow_export_artifacts
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_export_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 幂等键: 同一 owner 下唯一; 重试/重放返回同一 artifact
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'staged'
    CHECK (status IN ('staged', 'released', 'bind_failed', 'rolled_back', 'cleaned')),
  -- 内容指纹: 服务端计算, 永不采信客户端值
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  byte_length BIGINT NOT NULL CHECK (byte_length >= 0),
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  -- 隔离区位置 (stage 后必有)
  staging_bucket TEXT NOT NULL DEFAULT 'export-quarantine',
  staging_path TEXT NOT NULL,
  -- 正式区位置 (promote 后才有)
  final_bucket TEXT,
  final_key TEXT,
  -- atomic DB bind 目标 (TRAE 的 Export Request API 记录)
  bound_export_id TEXT,
  -- 可选: 关联合规标识记录 (Sprint 0 表)
  label_record_id UUID,
  -- 来源: provider 拉取 / 用户上传 / 渲染产物
  quarantine_source TEXT NOT NULL DEFAULT 'provider'
    CHECK (quarantine_source IN ('provider', 'upload', 'render')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_export_artifacts_owner ON public.storyflow_export_artifacts(owner_id);
CREATE INDEX IF NOT EXISTS idx_export_artifacts_status ON public.storyflow_export_artifacts(status);
CREATE INDEX IF NOT EXISTS idx_export_artifacts_sha256 ON public.storyflow_export_artifacts(sha256);
CREATE INDEX IF NOT EXISTS idx_export_artifacts_bound_export ON public.storyflow_export_artifacts(bound_export_id);

-- ============================================================
-- 3. updated_at 触发器
-- ============================================================

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS export_artifacts_touch_updated_at ON public.storyflow_export_artifacts;
CREATE TRIGGER export_artifacts_touch_updated_at BEFORE UPDATE ON public.storyflow_export_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 4. RLS: owner 维度 (service role 绕过, 用于服务端发布链)
-- ============================================================

ALTER TABLE public.storyflow_export_artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS export_artifacts_owner_select ON public.storyflow_export_artifacts;
CREATE POLICY export_artifacts_owner_select ON public.storyflow_export_artifacts
  FOR SELECT USING (owner_id = auth.uid());
DROP POLICY IF EXISTS export_artifacts_owner_insert ON public.storyflow_export_artifacts;
CREATE POLICY export_artifacts_owner_insert ON public.storyflow_export_artifacts
  FOR INSERT WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS export_artifacts_owner_delete ON public.storyflow_export_artifacts;
CREATE POLICY export_artifacts_owner_delete ON public.storyflow_export_artifacts
  FOR DELETE USING (owner_id = auth.uid());
