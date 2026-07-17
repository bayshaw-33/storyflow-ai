-- ============================================================
-- storyflow_exports 合规字段升级（初稿，待 Codex 审核 RLS）
--
-- 目的：为 Export Request/Status/Download API 提供合规元数据持久化。
-- 关联：KIIKIS-TR-G0-002 任务卡。
-- 注意：本文件为初稿，不得直接在生产执行。Codex 审核 RLS 与权限后
--       再复制到 supabase/migrations/ 带时间戳正式发布。
-- ============================================================

-- 1. 扩展 storyflow_exports 表：增加合规字段
--    现有字段保留：id/user_id/project_id/export_type/format/storage_path/metadata/created_at/file_url/payload_json/status
ALTER TABLE public.storyflow_exports
  ADD COLUMN IF NOT EXISTS jurisdiction_profile TEXT,
  ADD COLUMN IF NOT EXISTS ai_origin TEXT
    CHECK (ai_origin IS NULL OR ai_origin IN ('ai_generated', 'ai_modified', 'human_only', 'unknown')),
  ADD COLUMN IF NOT EXISTS content_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_code TEXT,
  ADD COLUMN IF NOT EXISTS visible_disclosure_mode TEXT
    CHECK (visible_disclosure_mode IS NULL OR visible_disclosure_mode IN ('none', 'ui', 'watermark', 'end_card', 'credits')),
  ADD COLUMN IF NOT EXISTS compliance_run_id UUID,
  ADD COLUMN IF NOT EXISTS label_record_id UUID,
  ADD COLUMN IF NOT EXISTS metadata_hash TEXT,
  ADD COLUMN IF NOT EXISTS verification_status TEXT
    CHECK (verification_status IS NULL OR verification_status IN ('pending', 'verified', 'failed', 'blocked')),
  ADD COLUMN IF NOT EXISTS blocking_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS download_url_signed TEXT,
  ADD COLUMN IF NOT EXISTS download_url_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_kind TEXT
    CHECK (source_kind IS NULL OR source_kind IN ('project_json', 'project_markdown', 'universe_json', 'production_script', 'production_assembly', 'archive_manifest', 'viral_script', 'video_render', 'art_asset', 'custom')),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. 状态扩展：原有 'completed'，增加合规流程状态
--    pending_request → marking → verifying → ready → downloaded / blocked / failed
--    旧数据 status='completed' 保持兼容
ALTER TABLE public.storyflow_exports
  DROP CONSTRAINT IF EXISTS storyflow_exports_status_check;
ALTER TABLE public.storyflow_exports
  ADD CONSTRAINT storyflow_exports_status_check
    CHECK (status IN ('pending_request', 'marking', 'verifying', 'ready', 'downloaded', 'blocked', 'failed', 'completed'));

-- 3. export_type 扩展：增加合规导出类型
ALTER TABLE public.storyflow_exports
  DROP CONSTRAINT IF EXISTS storyflow_exports_export_type_check;
ALTER TABLE public.storyflow_exports
  ADD CONSTRAINT storyflow_exports_export_type_check
    CHECK (export_type IN ('markdown', 'json', 'docx', 'pdf', 'image', 'audio', 'video', 'archive', 'compliance_package'));

-- 4. 索引
CREATE INDEX IF NOT EXISTS idx_exports_user_created ON public.storyflow_exports(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exports_status ON public.storyflow_exports(status) WHERE status NOT IN ('completed', 'downloaded');
CREATE INDEX IF NOT EXISTS idx_exports_compliance_run ON public.storyflow_exports(compliance_run_id) WHERE compliance_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exports_content_id ON public.storyflow_exports(content_id) WHERE content_id IS NOT NULL;

-- 5. updated_at 触发器
CREATE OR REPLACE FUNCTION public.touch_exports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_exports_updated_at ON public.storyflow_exports;
CREATE TRIGGER trg_exports_updated_at
  BEFORE UPDATE ON public.storyflow_exports
  FOR EACH ROW EXECUTE FUNCTION public.touch_exports_updated_at();

-- 6. RLS 策略（待 Codex 审核修订）
--    临时策略：用户只能 CRUD 自己的导出记录
ALTER TABLE public.storyflow_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exports_select_own ON public.storyflow_exports;
CREATE POLICY exports_select_own ON public.storyflow_exports
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS exports_insert_own ON public.storyflow_exports;
CREATE POLICY exports_insert_own ON public.storyflow_exports
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS exports_update_own ON public.storyflow_exports;
CREATE POLICY exports_update_own ON public.storyflow_exports
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS exports_delete_own ON public.storyflow_exports;
CREATE POLICY exports_delete_own ON public.storyflow_exports
  FOR DELETE USING (auth.uid() = user_id);

-- 7. 外键关联 compliance run（可选，待 Codex 确认是否需要）
-- ALTER TABLE public.storyflow_exports
--   ADD CONSTRAINT fk_exports_compliance_run
--   FOREIGN KEY (compliance_run_id) REFERENCES public.storyflow_export_compliance_runs(id) ON DELETE SET NULL;

-- 8. 创建 exports 存储桶（私桶，仅服务端写入，签名 URL 下载）
--    TRAE 在此桶写入标记后的导出产物；Kimi 后续替换为 immutable staging + atomic promote。
INSERT INTO storage.buckets (id, name, public)
VALUES ('exports', 'exports', false)
ON CONFLICT (id) DO NOTHING;

-- 9. exports 桶的 RLS 策略（初稿，待 Codex 审核）
--    临时策略：用户只能 CRUD 自己的导出对象（owner = auth.uid()）
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exports_bucket_select_own ON storage.objects;
CREATE POLICY exports_bucket_select_own ON storage.objects
  FOR SELECT USING (bucket_id = 'exports' AND owner = auth.uid());

DROP POLICY IF EXISTS exports_bucket_insert_own ON storage.objects;
CREATE POLICY exports_bucket_insert_own ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'exports' AND owner = auth.uid());

DROP POLICY IF EXISTS exports_bucket_update_own ON storage.objects;
CREATE POLICY exports_bucket_update_own ON storage.objects
  FOR UPDATE USING (bucket_id = 'exports' AND owner = auth.uid());

DROP POLICY IF EXISTS exports_bucket_delete_own ON storage.objects;
CREATE POLICY exports_bucket_delete_own ON storage.objects
  FOR DELETE USING (bucket_id = 'exports' AND owner = auth.uid());
