-- P1: real cursor pagination for Following and Saved community sections.
-- Filtering happens in PostgreSQL against durable Follow/Bookmark rows; the
-- browser no longer downloads arbitrary fixed-size lists and joins them.

CREATE OR REPLACE FUNCTION public.list_community_personal_feed(
  p_user_id uuid,
  p_section text,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 21,
  p_query text DEFAULT NULL
) RETURNS SETOF public.storyflow_publications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 21), 1), 51);
  v_query text := NULLIF(BTRIM(COALESCE(p_query, '')), '');
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'PERSONAL_FEED_USER_REQUIRED'; END IF;
  IF p_section NOT IN ('following', 'saved') THEN RAISE EXCEPTION 'PERSONAL_FEED_SECTION_INVALID'; END IF;

  RETURN QUERY
  SELECT publication.*
  FROM public.storyflow_publications AS publication
  WHERE publication.visibility = 'public'
    AND publication.status = 'active'
    AND (
      p_cursor_created_at IS NULL
      OR publication.created_at < p_cursor_created_at
      OR (publication.created_at = p_cursor_created_at AND publication.id < p_cursor_id)
    )
    AND (
      v_query IS NULL
      OR publication.title ILIKE '%' || v_query || '%'
      OR publication.summary ILIKE '%' || v_query || '%'
    )
    AND (
      (p_section = 'saved' AND EXISTS (
        SELECT 1
        FROM public.storyflow_bookmarks AS bookmark
        WHERE bookmark.user_id = p_user_id
          AND bookmark.publication_id = publication.id
      ))
      OR
      (p_section = 'following' AND EXISTS (
        SELECT 1
        FROM public.storyflow_follows AS follow
        WHERE follow.follower_id = p_user_id
          AND (
            (follow.target_type = 'publication' AND follow.target_id = publication.id)
            OR (follow.target_type = 'user' AND follow.target_id = publication.publisher_id)
            OR (
              follow.target_type = 'universe'
              AND (
                follow.target_id = publication.universe_id
                OR (publication.source_type = 'universe' AND follow.target_id = publication.source_id)
              )
            )
          )
      ))
    )
  ORDER BY publication.created_at DESC, publication.id DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.list_community_personal_feed(uuid, text, timestamptz, uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_community_personal_feed(uuid, text, timestamptz, uuid, integer, text) TO service_role;

CREATE INDEX IF NOT EXISTS storyflow_follows_personal_feed_idx
  ON public.storyflow_follows(follower_id, target_type, target_id);

CREATE INDEX IF NOT EXISTS storyflow_bookmarks_personal_feed_idx
  ON public.storyflow_bookmarks(user_id, publication_id);
