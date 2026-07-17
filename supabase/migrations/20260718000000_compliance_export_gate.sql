-- Sprint 0: 双法域合规导出 Gate (EU AI Act Art.50 / 中国《人工智能生成合成内容标识办法》)
-- 新建 5 张表:
--   storyflow_compliance_profiles      用户/项目级合规策略配置
--   storyflow_jurisdiction_rules       法域规则参考表(数据驱动, 避免代码硬编码法律文案)
--   storyflow_provider_codes           Provider 编码注册表(写入标识 manifest)
--   storyflow_ai_label_records         每次标识写入/验证的记录 (PRD 2.5 字段)
--   storyflow_export_compliance_runs   导出 Gate 每次执行的审计记录
--
-- Rollback (手动执行, 不放在迁移内自动跑):
--   DROP TABLE IF EXISTS public.storyflow_export_compliance_runs;
--   DROP TABLE IF EXISTS public.storyflow_ai_label_records;
--   DROP TABLE IF EXISTS public.storyflow_compliance_profiles;
--   DROP TABLE IF EXISTS public.storyflow_jurisdiction_rules;
--   DROP TABLE IF EXISTS public.storyflow_provider_codes;

-- ============================================================
-- 1. storyflow_provider_codes: Provider 编码注册表
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_provider_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  provider_type TEXT NOT NULL DEFAULT 'model'
    CHECK (provider_type IN ('platform', 'model', 'voice', 'tool')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. storyflow_jurisdiction_rules: 法域规则参考表
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_jurisdiction_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_profile TEXT NOT NULL UNIQUE
    CHECK (jurisdiction_profile IN ('EU_ART50', 'CN_AIGC', 'EU_CN_DUAL', 'INTERNAL_ONLY')),
  require_machine_marking BOOLEAN NOT NULL DEFAULT true,
  require_visible_disclosure BOOLEAN NOT NULL DEFAULT true,
  allowed_disclosure_modes TEXT[] NOT NULL DEFAULT ARRAY['ui', 'end_card', 'credits'],
  strict_export_block BOOLEAN NOT NULL DEFAULT true,
  allow_unmarked_exception BOOLEAN NOT NULL DEFAULT false,
  blocking_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  legal_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. storyflow_compliance_profiles: 用户/项目级合规策略
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_compliance_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id TEXT,
  jurisdiction_profile TEXT NOT NULL DEFAULT 'INTERNAL_ONLY'
    CHECK (jurisdiction_profile IN ('EU_ART50', 'CN_AIGC', 'EU_CN_DUAL', 'INTERNAL_ONLY')),
  machine_marking_enabled BOOLEAN NOT NULL DEFAULT true,
  visible_disclosure_enabled BOOLEAN NOT NULL DEFAULT true,
  visible_disclosure_mode TEXT NOT NULL DEFAULT 'ui'
    CHECK (visible_disclosure_mode IN ('none', 'ui', 'watermark', 'end_card', 'credits')),
  strict_export_block BOOLEAN NOT NULL DEFAULT true,
  allow_unmarked_exception BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_profiles_owner ON public.storyflow_compliance_profiles(owner_id);
CREATE INDEX IF NOT EXISTS idx_compliance_profiles_project ON public.storyflow_compliance_profiles(project_id);

-- ============================================================
-- 4. storyflow_ai_label_records: 标识记录 (PRD 2.5 最少字段)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_ai_label_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL DEFAULT '',
  asset_version_id TEXT NOT NULL DEFAULT '',
  export_id TEXT NOT NULL DEFAULT '',
  content_kind TEXT NOT NULL
    CHECK (content_kind IN ('text', 'image', 'audio', 'video', 'document')),
  ai_generated BOOLEAN NOT NULL DEFAULT false,
  ai_modified BOOLEAN NOT NULL DEFAULT false,
  jurisdiction_profile TEXT NOT NULL
    CHECK (jurisdiction_profile IN ('EU_ART50', 'CN_AIGC', 'EU_CN_DUAL', 'INTERNAL_ONLY')),
  provider_code TEXT NOT NULL DEFAULT '',
  content_id TEXT NOT NULL DEFAULT '',
  machine_readable_formats JSONB NOT NULL DEFAULT '[]'::jsonb,
  visible_disclosure_mode TEXT NOT NULL DEFAULT 'none'
    CHECK (visible_disclosure_mode IN ('none', 'ui', 'watermark', 'end_card', 'credits')),
  c2pa_manifest_id TEXT,
  metadata_hash TEXT NOT NULL DEFAULT '',
  verification_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'marked'
    CHECK (status IN ('marked', 'verified', 'failed', 'blocked')),
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_label_records_owner ON public.storyflow_ai_label_records(owner_id);
CREATE INDEX IF NOT EXISTS idx_ai_label_records_asset ON public.storyflow_ai_label_records(asset_id);
CREATE INDEX IF NOT EXISTS idx_ai_label_records_export ON public.storyflow_ai_label_records(export_id);
CREATE INDEX IF NOT EXISTS idx_ai_label_records_status ON public.storyflow_ai_label_records(status);

-- ============================================================
-- 5. storyflow_export_compliance_runs: 导出 Gate 审计
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_export_compliance_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id TEXT,
  asset_id TEXT NOT NULL DEFAULT '',
  asset_version_id TEXT NOT NULL DEFAULT '',
  content_kind TEXT NOT NULL DEFAULT 'document'
    CHECK (content_kind IN ('text', 'image', 'audio', 'video', 'document')),
  jurisdiction_profile TEXT NOT NULL DEFAULT 'INTERNAL_ONLY'
    CHECK (jurisdiction_profile IN ('EU_ART50', 'CN_AIGC', 'EU_CN_DUAL', 'INTERNAL_ONLY')),
  decision TEXT NOT NULL DEFAULT 'blocked'
    CHECK (decision IN ('allowed', 'blocked', 'failed')),
  blocking_reason_code TEXT,
  gate_steps_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  label_record_id UUID REFERENCES public.storyflow_ai_label_records(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_export_compliance_runs_owner ON public.storyflow_export_compliance_runs(owner_id);
CREATE INDEX IF NOT EXISTS idx_export_compliance_runs_project ON public.storyflow_export_compliance_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_export_compliance_runs_decision ON public.storyflow_export_compliance_runs(decision);

-- ============================================================
-- 6. updated_at 触发器 (touch_updated_at 由
--    20260716180000_unified_generation_jobs.sql 提供, 此处兜底重建)
-- ============================================================

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS provider_codes_touch_updated_at ON public.storyflow_provider_codes;
CREATE TRIGGER provider_codes_touch_updated_at BEFORE UPDATE ON public.storyflow_provider_codes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS jurisdiction_rules_touch_updated_at ON public.storyflow_jurisdiction_rules;
CREATE TRIGGER jurisdiction_rules_touch_updated_at BEFORE UPDATE ON public.storyflow_jurisdiction_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS compliance_profiles_touch_updated_at ON public.storyflow_compliance_profiles;
CREATE TRIGGER compliance_profiles_touch_updated_at BEFORE UPDATE ON public.storyflow_compliance_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 7. RLS
--    参考表(provider_codes / jurisdiction_rules): 登录用户可读, 仅 service role 写
--    业务表: owner 维度隔离 (与 card_draw_system 模式一致)
-- ============================================================

ALTER TABLE public.storyflow_provider_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_jurisdiction_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_compliance_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_ai_label_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_export_compliance_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_codes_select ON public.storyflow_provider_codes
  FOR SELECT USING (true);

CREATE POLICY jurisdiction_rules_select ON public.storyflow_jurisdiction_rules
  FOR SELECT USING (true);

CREATE POLICY compliance_profiles_owner_select ON public.storyflow_compliance_profiles
  FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY compliance_profiles_owner_insert ON public.storyflow_compliance_profiles
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY compliance_profiles_owner_update ON public.storyflow_compliance_profiles
  FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY compliance_profiles_owner_delete ON public.storyflow_compliance_profiles
  FOR DELETE USING (owner_id = auth.uid());

CREATE POLICY ai_label_records_owner_select ON public.storyflow_ai_label_records
  FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY ai_label_records_owner_insert ON public.storyflow_ai_label_records
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY ai_label_records_owner_delete ON public.storyflow_ai_label_records
  FOR DELETE USING (owner_id = auth.uid());

CREATE POLICY export_compliance_runs_owner_select ON public.storyflow_export_compliance_runs
  FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY export_compliance_runs_owner_insert ON public.storyflow_export_compliance_runs
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY export_compliance_runs_owner_delete ON public.storyflow_export_compliance_runs
  FOR DELETE USING (owner_id = auth.uid());

-- ============================================================
-- 8. 种子数据
-- ============================================================

INSERT INTO public.storyflow_provider_codes (code, display_name, provider_type) VALUES
  ('KIIKIS',     'KIIKIS StoryFlow Platform', 'platform'),
  ('DEEPSEEK',   'DeepSeek',                  'model'),
  ('MINIMAX',    'MiniMax',                   'model'),
  ('OPENAI',     'OpenAI',                    'model'),
  ('ELEVENLABS', 'ElevenLabs',                'voice'),
  ('ATLASCLOUD', 'AtlasCloud',                'model'),
  ('BFL',        'Black Forest Labs',         'model')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.storyflow_jurisdiction_rules (
  jurisdiction_profile, require_machine_marking, require_visible_disclosure,
  allowed_disclosure_modes, strict_export_block, allow_unmarked_exception,
  blocking_conditions, legal_references
) VALUES
  (
    'EU_ART50', true, true,
    ARRAY['ui', 'watermark', 'end_card', 'credits'], true, false,
    '["jurisdiction_missing", "ai_status_unknown", "machine_marking_failed", "verification_failed", "voice_license_missing", "reference_rights_blocked", "disclosure_mode_missing"]'::jsonb,
    '[{"instrument": "EU AI Act", "article": "Article 50", "applies_from": "2026-08-02", "note": "Machine-readable, detectable marking for synthetic text/image/audio/video; deep fake deployer disclosure."}]'::jsonb
  ),
  (
    'CN_AIGC', true, true,
    ARRAY['ui', 'watermark', 'end_card', 'credits'], true, false,
    '["jurisdiction_missing", "ai_status_unknown", "machine_marking_failed", "verification_failed", "voice_license_missing", "reference_rights_blocked", "disclosure_mode_missing"]'::jsonb,
    '[{"instrument": "人工智能生成合成内容标识办法", "applies_from": "2025-09-01", "note": "显式标识与文件元数据隐式标识; 导出、下载、复制场景必须纳入标识策略。"}]'::jsonb
  ),
  (
    'EU_CN_DUAL', true, true,
    ARRAY['ui', 'watermark', 'end_card', 'credits'], true, false,
    '["jurisdiction_missing", "ai_status_unknown", "machine_marking_failed", "verification_failed", "voice_license_missing", "reference_rights_blocked", "disclosure_mode_missing"]'::jsonb,
    '[{"instrument": "EU AI Act", "article": "Article 50", "applies_from": "2026-08-02"}, {"instrument": "人工智能生成合成内容标识办法", "applies_from": "2025-09-01"}]'::jsonb
  ),
  (
    'INTERNAL_ONLY', true, false,
    ARRAY['none', 'ui'], false, true,
    '["machine_marking_failed"]'::jsonb,
    '[]'::jsonb
  )
ON CONFLICT (jurisdiction_profile) DO NOTHING;
