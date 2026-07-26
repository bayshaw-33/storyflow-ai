-- Bind every Universe child write to the owner of its parent Universe.
-- Each replaced policy previously checked only the child row's user_id.

DROP POLICY IF EXISTS universe_inbox_owner_all
  ON public.storyflow_universe_inbox_items;
CREATE POLICY universe_inbox_parent_owner_all
  ON public.storyflow_universe_inbox_items
  FOR ALL TO authenticated
  USING (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.storyflow_universes universe
      WHERE universe.id = storyflow_universe_inbox_items.universe_id
        AND universe.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.storyflow_universes universe
      WHERE universe.id = storyflow_universe_inbox_items.universe_id
        AND universe.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS universe_links_owner_all
  ON public.storyflow_universe_project_links;
CREATE POLICY universe_links_parent_owner_all
  ON public.storyflow_universe_project_links
  FOR ALL TO authenticated
  USING (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.storyflow_universes universe
      WHERE universe.id = storyflow_universe_project_links.universe_id
        AND universe.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.storyflow_universes universe
      WHERE universe.id = storyflow_universe_project_links.universe_id
        AND universe.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS universe_relationships_owner_all
  ON public.storyflow_universe_relationships;
CREATE POLICY universe_relationships_parent_owner_all
  ON public.storyflow_universe_relationships
  FOR ALL TO authenticated
  USING (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.storyflow_universes universe
      WHERE universe.id = storyflow_universe_relationships.universe_id
        AND universe.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.storyflow_universes universe
      WHERE universe.id = storyflow_universe_relationships.universe_id
        AND universe.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS universe_timeline_owner_all
  ON public.storyflow_universe_timeline_events;
CREATE POLICY universe_timeline_parent_owner_all
  ON public.storyflow_universe_timeline_events
  FOR ALL TO authenticated
  USING (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.storyflow_universes universe
      WHERE universe.id = storyflow_universe_timeline_events.universe_id
        AND universe.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.storyflow_universes universe
      WHERE universe.id = storyflow_universe_timeline_events.universe_id
        AND universe.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS canon_facts_owner_all
  ON public.storyflow_canon_facts;
CREATE POLICY canon_facts_parent_owner_all
  ON public.storyflow_canon_facts
  FOR ALL TO authenticated
  USING (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.storyflow_universes universe
      WHERE universe.id = storyflow_canon_facts.universe_id
        AND universe.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.storyflow_universes universe
      WHERE universe.id = storyflow_canon_facts.universe_id
        AND universe.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS canon_state_owner_all
  ON public.storyflow_canon_state_snapshots;
CREATE POLICY canon_state_parent_owner_all
  ON public.storyflow_canon_state_snapshots
  FOR ALL TO authenticated
  USING (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.storyflow_universes universe
      WHERE universe.id = storyflow_canon_state_snapshots.universe_id
        AND universe.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.storyflow_universes universe
      WHERE universe.id = storyflow_canon_state_snapshots.universe_id
        AND universe.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS canon_reports_owner_all
  ON public.storyflow_canon_check_reports;
CREATE POLICY canon_reports_parent_owner_all
  ON public.storyflow_canon_check_reports
  FOR ALL TO authenticated
  USING (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.storyflow_universes universe
      WHERE universe.id = storyflow_canon_check_reports.universe_id
        AND universe.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.storyflow_universes universe
      WHERE universe.id = storyflow_canon_check_reports.universe_id
        AND universe.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS song_universe_links_insert_owner
  ON public.storyflow_song_universe_links;
CREATE POLICY song_universe_links_insert_parent_owner
  ON public.storyflow_song_universe_links
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.storyflow_universes universe
      WHERE universe.id = storyflow_song_universe_links.universe_id
        AND universe.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS song_universe_links_update_owner
  ON public.storyflow_song_universe_links;
CREATE POLICY song_universe_links_update_parent_owner
  ON public.storyflow_song_universe_links
  FOR UPDATE TO authenticated
  USING (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.storyflow_universes universe
      WHERE universe.id = storyflow_song_universe_links.universe_id
        AND universe.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.storyflow_universes universe
      WHERE universe.id = storyflow_song_universe_links.universe_id
        AND universe.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS song_universe_links_delete_owner
  ON public.storyflow_song_universe_links;
CREATE POLICY song_universe_links_delete_parent_owner
  ON public.storyflow_song_universe_links
  FOR DELETE TO authenticated
  USING (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.storyflow_universes universe
      WHERE universe.id = storyflow_song_universe_links.universe_id
        AND universe.user_id = (select auth.uid())
    )
  );
