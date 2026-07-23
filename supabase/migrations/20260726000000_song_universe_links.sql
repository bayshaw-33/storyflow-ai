-- ============================================================
-- 20260726000000_song_universe_links.sql
-- Kiikis 歌曲创作工作台优化方案 V1.0 §7
-- 歌曲-Universe 关联关系表：歌曲角色、来源项目、继承范围、草稿/正式发布状态、绑定版本号
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. storyflow_song_universe_links 主表
-- ------------------------------------------------------------
-- 一条记录 = 一首歌曲（song_project_id 指向 storyflow_projects.id）关联到一个 Universe。
-- 草稿关联（status='draft'）与正式发布（status='published'）通过 status 区分。
-- 正式发布时 frozen_version_id 冻结当前正式版本，不被后续草稿静默覆盖。
-- 一个 (song_project_id, universe_id) 只能有一条 published 记录（UNIQUE 约束）。

CREATE TABLE IF NOT EXISTS public.storyflow_song_universe_links (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  universe_id uuid NOT NULL,
  song_project_id text NOT NULL,
  user_id uuid DEFAULT auth.uid() NOT NULL,
  team_id uuid,

  -- §7.2 歌曲角色：主题曲 / 片尾曲 / 角色歌 / 插曲 / BGM / 宣传曲
  song_role text NOT NULL DEFAULT 'theme_song',

  -- §7.2 来源项目（可选，歌曲可继承自某个剧集/电影项目）
  source_project_id text,

  -- §7.2 来源角色或故事节点（可选，用于角色歌/插曲）
  source_entity_id uuid,

  -- §7.2 继承范围：哪些 Canon 内容会被歌曲继承
  inheritance_scope jsonb DEFAULT '{}'::jsonb NOT NULL,

  -- §7.3 草稿关联 vs 正式发布
  -- draft: 草稿归属，可继续编辑
  -- published: 已发布到 Universe，冻结当前正式版本
  status text NOT NULL DEFAULT 'draft',

  -- §7.3 发布冻结：published 状态下绑定的 song version id（来自 storyflow_projects.data.versions[].id）
  -- 草稿编辑不会改变此字段；重新发布时新建一条 published 记录并把旧的改为 deprecated
  frozen_version_id text,

  -- §7.3 Canon 快照（发布时冻结的 Universe 状态摘要，用于审计）
  canon_snapshot jsonb,

  -- §8.4 发布关联的交付工作包 sha256（可选，用于工作包与发布版本绑定）
  delivery_package_sha256 text,

  notes text DEFAULT ''::text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,

  CONSTRAINT storyflow_song_universe_links_pkey PRIMARY KEY (id),
  CONSTRAINT storyflow_song_universe_links_song_role_check
    CHECK ((song_role = ANY (ARRAY[
      'theme_song'::text,      -- 主题曲
      'ending_song'::text,     -- 片尾曲
      'character_song'::text,  -- 角色歌
      'insert_song'::text,     -- 插曲
      'bgm'::text,             -- BGM
      'promo_song'::text       -- 宣传曲
    ]))),
  CONSTRAINT storyflow_song_universe_links_status_check
    CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'deprecated'::text])))
);

COMMENT ON TABLE public.storyflow_song_universe_links IS
  'Kiikis V1.0 §7: 歌曲-Universe 关联关系。Universe 是歌曲归属、继承和正式发布的唯一入口。';

COMMENT ON COLUMN public.storyflow_song_universe_links.song_role IS
  '歌曲角色：theme_song(主题曲)/ending_song(片尾曲)/character_song(角色歌)/insert_song(插曲)/bgm/promo_song(宣传曲)';

COMMENT ON COLUMN public.storyflow_song_universe_links.source_project_id IS
  '来源项目 id（剧集/电影等），歌曲可继承其 Canon 内容';

COMMENT ON COLUMN public.storyflow_song_universe_links.source_entity_id IS
  '来源角色或故事节点 id（storyflow_universe_entities.id），用于角色歌/插曲';

COMMENT ON COLUMN public.storyflow_song_universe_links.inheritance_scope IS
  '继承范围：{characters:[], locations:[], canon_facts:[], timeline:bool, ...}';

COMMENT ON COLUMN public.storyflow_song_universe_links.status IS
  'draft=草稿关联（可继续编辑），published=已发布到 Universe（冻结正式版本），deprecated=已被新发布取代';

COMMENT ON COLUMN public.storyflow_song_universe_links.frozen_version_id IS
  'published 状态下绑定的 song version id。草稿编辑不改变此字段；重新发布时新建 published 记录并把旧的改为 deprecated';

COMMENT ON COLUMN public.storyflow_song_universe_links.canon_snapshot IS
  '发布时冻结的 Universe 状态摘要，用于审计追溯';

COMMENT ON COLUMN public.storyflow_song_universe_links.delivery_package_sha256 IS
  '发布关联的交付工作包 sha256，用于工作包与发布版本绑定';

-- ------------------------------------------------------------
-- 2. 索引
-- ------------------------------------------------------------

-- 按 Universe 查询其下所有歌曲（含草稿+已发布）
CREATE INDEX IF NOT EXISTS idx_song_universe_links_universe
  ON public.storyflow_song_universe_links (universe_id, status, updated_at DESC);

-- 按歌曲查询其关联（一首歌曲可能有多条历史记录，但只有一条 draft 或 published 活跃）
CREATE INDEX IF NOT EXISTS idx_song_universe_links_song
  ON public.storyflow_song_universe_links (song_project_id, status, updated_at DESC);

-- 按用户查询
CREATE INDEX IF NOT EXISTS idx_song_universe_links_user
  ON public.storyflow_song_universe_links (user_id, updated_at DESC);

-- ------------------------------------------------------------
-- 3. 唯一约束：一首歌曲在一个 Universe 下只能有一条 draft 或 published（不含 deprecated）
--    使用部分唯一索引实现：deprecated 历史记录不参与唯一约束
-- ------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS uq_song_universe_links_active
  ON public.storyflow_song_universe_links (song_project_id, universe_id)
  WHERE status IN ('draft', 'published');

-- ------------------------------------------------------------
-- 4. RLS
-- ------------------------------------------------------------

ALTER TABLE public.storyflow_song_universe_links ENABLE ROW LEVEL SECURITY;

-- SELECT: 所有 authenticated 可读（Universe 是协作资产，但只暴露公开字段）
-- 实际可见性由上层应用层根据 Universe.visibility 控制
DROP POLICY IF EXISTS "song_universe_links_select_authenticated" ON public.storyflow_song_universe_links;
CREATE POLICY "song_universe_links_select_authenticated" ON public.storyflow_song_universe_links
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: 只有 owner 可创建关联
DROP POLICY IF EXISTS "song_universe_links_insert_owner" ON public.storyflow_song_universe_links;
CREATE POLICY "song_universe_links_insert_owner" ON public.storyflow_song_universe_links
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE: 只有 owner 可更新（发布、修改角色等）
DROP POLICY IF EXISTS "song_universe_links_update_owner" ON public.storyflow_song_universe_links;
CREATE POLICY "song_universe_links_update_owner" ON public.storyflow_song_universe_links
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: 只有 owner 可删除（一般用 deprecated 软删除，但保留物理删除能力）
DROP POLICY IF EXISTS "song_universe_links_delete_owner" ON public.storyflow_song_universe_links;
CREATE POLICY "song_universe_links_delete_owner" ON public.storyflow_song_universe_links
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- 5. updated_at 自动更新触发器
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_song_universe_links_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_song_universe_links_updated_at ON public.storyflow_song_universe_links;
CREATE TRIGGER trg_song_universe_links_updated_at
  BEFORE UPDATE ON public.storyflow_song_universe_links
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_song_universe_links_updated_at();

COMMIT;
