-- Prevent a user from attaching an entity they own to another user's universe.
-- The previous policy checked only storyflow_universe_entities.user_id.

DROP POLICY IF EXISTS universe_entities_owner_all
  ON public.storyflow_universe_entities;

CREATE POLICY universe_entities_parent_owner_all
  ON public.storyflow_universe_entities
  FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.storyflow_universes universe
      WHERE universe.id = storyflow_universe_entities.universe_id
        AND universe.user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.storyflow_universes universe
      WHERE universe.id = storyflow_universe_entities.universe_id
        AND universe.user_id = auth.uid()
    )
  );
