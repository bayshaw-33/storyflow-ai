-- KIIKIS-TR-ACTOR-P0-009: 性能优化索引
-- 为宇宙/演员库页面加载慢的查询补缺失索引

-- 1. storyflow_universe_project_links: 列表 API 按 universe_id=in.(...) 过滤（之前全表扫）
CREATE INDEX IF NOT EXISTS idx_universe_project_links_universe
  ON public.storyflow_universe_project_links (universe_id);

-- 2. storyflow_universe_timeline_events: 详情页按 universe_id 过滤
CREATE INDEX IF NOT EXISTS idx_universe_timeline_universe
  ON public.storyflow_universe_timeline_events (universe_id);

-- 3. storyflow_universe_relationships: 详情页按 universe_id 过滤
CREATE INDEX IF NOT EXISTS idx_universe_relationships_universe
  ON public.storyflow_universe_relationships (universe_id);

-- 4. storyflow_canon_check_reports: 详情页按 universe_id 过滤
CREATE INDEX IF NOT EXISTS idx_canon_check_reports_universe
  ON public.storyflow_canon_check_reports (universe_id);

-- 5. storyflow_universes: 列表 API or=(user_id.eq.X,team_id.in.(...)) 的 team_id 端
CREATE INDEX IF NOT EXISTS idx_universes_team_active
  ON public.storyflow_universes (team_id) WHERE archived_at IS NULL;

-- 6. storyflow_team_members: 按 team_id 查 membership
CREATE INDEX IF NOT EXISTS idx_team_members_team_user
  ON public.storyflow_team_members (team_id, user_id, status);

-- 7. storyflow_assets: metadata->>actor_id 反查（演员详情页 imagePackCompleteness）
CREATE INDEX IF NOT EXISTS idx_assets_metadata_actor_id
  ON public.storyflow_assets ((metadata->>'actor_id'))
  WHERE metadata->>'actor_id' IS NOT NULL;

-- 8. storyflow_actor_profiles: 平台共享演员列表查询
CREATE INDEX IF NOT EXISTS idx_actor_profiles_visibility_status
  ON public.storyflow_actor_profiles (visibility, status);

COMMENT ON INDEX public.idx_universe_project_links_universe IS 'KIIKIS-TR-ACTOR-P0-009: 加速 universe summaries 列表 API 的 universe_id=in.(...) 过滤';
COMMENT ON INDEX public.idx_universe_timeline_universe IS 'KIIKIS-TR-ACTOR-P0-009: 加速详情页 timeline 加载';
COMMENT ON INDEX public.idx_universe_relationships_universe IS 'KIIKIS-TR-ACTOR-P0-009: 加速详情页 relationships 加载';
COMMENT ON INDEX public.idx_canon_check_reports_universe IS 'KIIKIS-TR-ACTOR-P0-009: 加速详情页 canon reports 加载';
COMMENT ON INDEX public.idx_universes_team_active IS 'KIIKIS-TR-ACTOR-P0-009: 加速列表 API team_id 端过滤';
COMMENT ON INDEX public.idx_team_members_team_user IS 'KIIKIS-TR-ACTOR-P0-009: 加速 team membership 查询';
COMMENT ON INDEX public.idx_assets_metadata_actor_id IS 'KIIKIS-TR-ACTOR-P0-009: 加速演员详情页 imagePackCompleteness 反查';
COMMENT ON INDEX public.idx_actor_profiles_visibility_status IS 'KIIKIS-TR-ACTOR-P0-009: 加速平台共享演员列表查询';
