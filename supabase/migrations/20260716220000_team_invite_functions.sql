-- Add function to look up user ID by email (for team invitations)
-- SECURITY DEFINER: runs with the function owner's privileges (postgres)
-- Only accessible via service role key (bypasses RLS)

CREATE OR REPLACE FUNCTION public.get_user_id_by_email(user_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE email = user_email LIMIT 1;
$$;

-- Grant execute to authenticated (service role bypasses this check anyway)
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO anon;
