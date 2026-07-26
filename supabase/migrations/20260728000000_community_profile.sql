-- [STATUS: DEFERRED 2026-07-27] PRD V2 验收范围排除社区产品功能，暂不执行/登记。
-- 如需启用，移除此注释块并手动执行 + INSERT 到 supabase_migrations.schema_migrations。


-- ============================================================
-- 社区系统 阶段 A：用户资料与公开主页
-- 日期: 2026-07-28
-- 说明: 扩展 profiles 字段、新增徽章表、AI 头像白名单表、触发器、RLS、历史回填
-- ============================================================

-- ============================================================
-- 1. storyflow_profiles 字段扩展
-- ============================================================
ALTER TABLE public.storyflow_profiles
  ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS username_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS avatar_asset_id UUID REFERENCES public.storyflow_assets(id),
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS language_preference TEXT DEFAULT 'en-US',
  ADD COLUMN IF NOT EXISTS pronouns TEXT,
  ADD COLUMN IF NOT EXISTS creative_tags JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS profile_visibility TEXT DEFAULT 'public' CHECK (profile_visibility IN ('public','private'));

CREATE INDEX IF NOT EXISTS idx_storyflow_profiles_username ON public.storyflow_profiles(username) WHERE username IS NOT NULL;

-- ============================================================
-- 2. 徽章定义表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.storyflow_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_key TEXT NOT NULL UNIQUE,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_zh TEXT,
  description_en TEXT,
  icon_asset_id UUID,
  category TEXT DEFAULT 'milestone',
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. 用户徽章授予表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.storyflow_user_badge_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES public.storyflow_badges(id) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trigger_metadata JSONB DEFAULT '{}',
  UNIQUE(user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badge_awards_user ON public.storyflow_user_badge_awards(user_id);

-- ============================================================
-- 4. AI 头像生成白名单表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.storyflow_ai_avatar_whitelist (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by UUID REFERENCES auth.users(id),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT
);

-- ============================================================
-- 5. 徽章 seed 数据（6 枚里程碑）
-- ============================================================
INSERT INTO public.storyflow_badges (badge_key, name_zh, name_en, description_zh, description_en, category, sort_order) VALUES
  ('first_signup',  '加入 kiikis',   'Joined kiikis',    '完成注册',                       'Completed signup',          'milestone', 1),
  ('first_work',    '处女作',        'First Work',       '发布第一部作品',                 'Published first work',      'milestone', 2),
  ('first_universe','创世者',        'Universe Creator', '建立第一个宇宙',                 'Created first universe',    'milestone', 3),
  ('first_actor',   '选角导演',      'Casting Director', '创建第一个演员',                 'Created first actor',       'milestone', 4),
  ('first_used',    '被看见',        'Being Seen',       '作品/演员首次被他人使用',        'First usage by others',     'milestone', 5),
  ('first_adapted', '被传承',        'Being Adapted',    '宇宙首次被他人改编',             'First universe adaptation', 'milestone', 6)
ON CONFLICT (badge_key) DO NOTHING;

-- ============================================================
-- 6. 徽章触发函数
-- ============================================================
CREATE OR REPLACE FUNCTION public.award_badge_if_first()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_badge_key TEXT;
  v_metadata JSONB;
  v_owner_id UUID;
BEGIN
  CASE TG_ARGV[0]
    WHEN 'first_signup' THEN
      v_user_id := NEW.id;
      v_badge_key := 'first_signup';
      v_metadata := '{}'::jsonb;

    WHEN 'first_work' THEN
      v_user_id := NEW.user_id;
      v_badge_key := 'first_work';
      v_metadata := jsonb_build_object('project_id', NEW.id);

    WHEN 'first_universe' THEN
      v_user_id := NEW.user_id;
      v_badge_key := 'first_universe';
      v_metadata := jsonb_build_object('universe_id', NEW.id);

    WHEN 'first_actor' THEN
      v_user_id := NEW.owner_id;
      v_badge_key := 'first_actor';
      v_metadata := jsonb_build_object('actor_id', NEW.id);

    WHEN 'first_used' THEN
      SELECT owner_id INTO v_owner_id FROM public.storyflow_actor_profiles WHERE id = NEW.actor_id;
      IF v_owner_id IS NULL OR v_owner_id = NEW.consumer_id THEN
        RETURN NEW;
      END IF;
      -- 仅当该 owner 此前没有任何被使用记录时才授奖
      IF EXISTS (
        SELECT 1 FROM public.storyflow_actor_usages u
        JOIN public.storyflow_actor_profiles a ON a.id = u.actor_id
        WHERE a.owner_id = v_owner_id AND u.id != NEW.id
      ) THEN
        RETURN NEW;
      END IF;
      v_user_id := v_owner_id;
      v_badge_key := 'first_used';
      v_metadata := jsonb_build_object('actor_id', NEW.actor_id, 'consumer_id', NEW.consumer_id, 'project_id', NEW.project_id);

    WHEN 'first_adapted' THEN
      SELECT user_id INTO v_owner_id FROM public.storyflow_universes WHERE id = NEW.universe_id;
      IF v_owner_id IS NULL OR v_owner_id = NEW.user_id OR NEW.project_role != 'adaptation' THEN
        RETURN NEW;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.storyflow_universe_project_links l
        JOIN public.storyflow_universes u ON u.id = l.universe_id
        WHERE u.user_id = v_owner_id AND l.id != NEW.id AND l.project_role = 'adaptation' AND l.user_id != u.user_id
      ) THEN
        RETURN NEW;
      END IF;
      v_user_id := v_owner_id;
      v_badge_key := 'first_adapted';
      v_metadata := jsonb_build_object('universe_id', NEW.universe_id, 'adapter_user_id', NEW.user_id, 'project_id', NEW.project_id);

    ELSE
      RETURN NEW;
  END CASE;

  -- 插入徽章（幂等：UNIQUE(user_id, badge_id) 约束）
  INSERT INTO public.storyflow_user_badge_awards (user_id, badge_id, trigger_metadata)
  SELECT v_user_id, b.id, v_metadata
  FROM public.storyflow_badges b
  WHERE b.badge_key = v_badge_key AND b.is_active = true
  ON CONFLICT (user_id, badge_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 绑定 trigger 到各表
DROP TRIGGER IF EXISTS trg_badge_first_signup ON auth.users;
CREATE TRIGGER trg_badge_first_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.award_badge_if_first('first_signup');

DROP TRIGGER IF EXISTS trg_badge_first_work ON public.storyflow_projects;
CREATE TRIGGER trg_badge_first_work
  AFTER INSERT ON public.storyflow_projects
  FOR EACH ROW EXECUTE FUNCTION public.award_badge_if_first('first_work');

DROP TRIGGER IF EXISTS trg_badge_first_universe ON public.storyflow_universes;
CREATE TRIGGER trg_badge_first_universe
  AFTER INSERT ON public.storyflow_universes
  FOR EACH ROW EXECUTE FUNCTION public.award_badge_if_first('first_universe');

DROP TRIGGER IF EXISTS trg_badge_first_actor ON public.storyflow_actor_profiles;
CREATE TRIGGER trg_badge_first_actor
  AFTER INSERT ON public.storyflow_actor_profiles
  FOR EACH ROW EXECUTE FUNCTION public.award_badge_if_first('first_actor');

DROP TRIGGER IF EXISTS trg_badge_first_used ON public.storyflow_actor_usages;
CREATE TRIGGER trg_badge_first_used
  AFTER INSERT ON public.storyflow_actor_usages
  FOR EACH ROW EXECUTE FUNCTION public.award_badge_if_first('first_used');

DROP TRIGGER IF EXISTS trg_badge_first_adapted ON public.storyflow_universe_project_links;
CREATE TRIGGER trg_badge_first_adapted
  AFTER INSERT ON public.storyflow_universe_project_links
  FOR EACH ROW EXECUTE FUNCTION public.award_badge_if_first('first_adapted');

-- ============================================================
-- 7. 历史数据回填
-- ============================================================

-- first_signup: 所有现有用户
INSERT INTO public.storyflow_user_badge_awards (user_id, badge_id, trigger_metadata)
SELECT u.id, b.id, '{}'::jsonb
FROM auth.users u
CROSS JOIN public.storyflow_badges b
WHERE b.badge_key = 'first_signup'
  AND NOT EXISTS (SELECT 1 FROM public.storyflow_user_badge_awards a WHERE a.user_id = u.id AND a.badge_id = b.id)
ON CONFLICT DO NOTHING;

-- first_work: 有 project 的用户
INSERT INTO public.storyflow_user_badge_awards (user_id, badge_id, trigger_metadata)
SELECT p.user_id, b.id, jsonb_build_object('project_id', MIN(p.id))
FROM public.storyflow_projects p
CROSS JOIN public.storyflow_badges b
WHERE b.badge_key = 'first_work' AND p.user_id IS NOT NULL
GROUP BY p.user_id, b.id
ON CONFLICT DO NOTHING;

-- first_universe: 有 universe 的用户
INSERT INTO public.storyflow_user_badge_awards (user_id, badge_id, trigger_metadata)
SELECT u.user_id, b.id, jsonb_build_object('universe_id', MIN(u.id))
FROM public.storyflow_universes u
CROSS JOIN public.storyflow_badges b
WHERE b.badge_key = 'first_universe' AND u.user_id IS NOT NULL
GROUP BY u.user_id, b.id
ON CONFLICT DO NOTHING;

-- first_actor: 有 actor 的用户
INSERT INTO public.storyflow_user_badge_awards (user_id, badge_id, trigger_metadata)
SELECT a.owner_id, b.id, jsonb_build_object('actor_id', MIN(a.id))
FROM public.storyflow_actor_profiles a
CROSS JOIN public.storyflow_badges b
WHERE b.badge_key = 'first_actor' AND a.owner_id IS NOT NULL
GROUP BY a.owner_id, b.id
ON CONFLICT DO NOTHING;

-- first_used: 有被使用记录的 owner
INSERT INTO public.storyflow_user_badge_awards (user_id, badge_id, trigger_metadata)
SELECT ap.owner_id, b.id, '{}'::jsonb
FROM public.storyflow_actor_usages u
JOIN public.storyflow_actor_profiles ap ON ap.id = u.actor_id
CROSS JOIN public.storyflow_badges b
WHERE b.badge_key = 'first_used' AND ap.owner_id IS NOT NULL AND u.consumer_id != ap.owner_id
GROUP BY ap.owner_id, b.id
ON CONFLICT DO NOTHING;

-- first_adapted: 有被改编记录的 universe owner
INSERT INTO public.storyflow_user_badge_awards (user_id, badge_id, trigger_metadata)
SELECT un.user_id, b.id, '{}'::jsonb
FROM public.storyflow_universe_project_links l
JOIN public.storyflow_universes un ON un.id = l.universe_id
CROSS JOIN public.storyflow_badges b
WHERE b.badge_key = 'first_adapted' AND un.user_id IS NOT NULL AND l.user_id != un.user_id AND l.project_role = 'adaptation'
GROUP BY un.user_id, b.id
ON CONFLICT DO NOTHING;

-- ============================================================
-- 8. AI 头像白名单初始化（现有用户全量加入）
-- ============================================================
INSERT INTO public.storyflow_ai_avatar_whitelist (user_id, note)
SELECT id, 'initial-backfill'
FROM auth.users
WHERE NOT EXISTS (SELECT 1 FROM public.storyflow_ai_avatar_whitelist w WHERE w.user_id = auth.users.id)
ON CONFLICT DO NOTHING;

-- 新用户自动加入白名单的 trigger
CREATE OR REPLACE FUNCTION public.add_new_user_to_avatar_whitelist()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.storyflow_ai_avatar_whitelist (user_id, note)
  VALUES (NEW.id, 'auto-on-signup')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_avatar_whitelist_new_user ON auth.users;
CREATE TRIGGER trg_avatar_whitelist_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.add_new_user_to_avatar_whitelist();

-- ============================================================
-- 9. RLS 策略
-- ============================================================

-- storyflow_profiles
ALTER TABLE public.storyflow_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_self_all ON public.storyflow_profiles;
CREATE POLICY profiles_self_all
  ON public.storyflow_profiles
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS profiles_public_read ON public.storyflow_profiles;
CREATE POLICY profiles_public_read
  ON public.storyflow_profiles
  FOR SELECT
  TO anon, authenticated
  USING (profile_visibility = 'public');

-- storyflow_badges（定义表，所有人可读 active）
ALTER TABLE public.storyflow_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS badges_definition_read ON public.storyflow_badges;
CREATE POLICY badges_definition_read
  ON public.storyflow_badges
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- storyflow_user_badge_awards
ALTER TABLE public.storyflow_user_badge_awards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS badges_self_read ON public.storyflow_user_badge_awards;
CREATE POLICY badges_self_read
  ON public.storyflow_user_badge_awards
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS badges_public_read ON public.storyflow_user_badge_awards;
CREATE POLICY badges_public_read
  ON public.storyflow_user_badge_awards
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.storyflow_profiles p
      WHERE p.user_id = storyflow_user_badge_awards.user_id
        AND p.profile_visibility = 'public'
    )
  );

-- storyflow_ai_avatar_whitelist（本人可查）
ALTER TABLE public.storyflow_ai_avatar_whitelist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whitelist_self_read ON public.storyflow_ai_avatar_whitelist;
CREATE POLICY whitelist_self_read
  ON public.storyflow_ai_avatar_whitelist
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- Migration 完成
-- ============================================================
