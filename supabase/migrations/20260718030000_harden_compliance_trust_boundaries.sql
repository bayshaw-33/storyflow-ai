-- Gate 0A blocker patch: authenticated users may read their records, but all
-- trusted compliance, export and provider-result mutations are server-only.

REVOKE ALL ON public.storyflow_provider_codes FROM anon;
REVOKE ALL ON public.storyflow_jurisdiction_rules FROM anon;
GRANT SELECT ON public.storyflow_provider_codes TO authenticated;
GRANT SELECT ON public.storyflow_jurisdiction_rules TO authenticated;

DROP POLICY IF EXISTS provider_codes_select ON public.storyflow_provider_codes;
CREATE POLICY provider_codes_select ON public.storyflow_provider_codes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS jurisdiction_rules_select ON public.storyflow_jurisdiction_rules;
CREATE POLICY jurisdiction_rules_select ON public.storyflow_jurisdiction_rules
  FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.storyflow_compliance_profiles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.storyflow_ai_label_records FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.storyflow_export_compliance_runs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.storyflow_generation_jobs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.storyflow_exports FROM authenticated;

GRANT SELECT ON public.storyflow_compliance_profiles TO authenticated;
GRANT SELECT ON public.storyflow_ai_label_records TO authenticated;
GRANT SELECT ON public.storyflow_export_compliance_runs TO authenticated;
GRANT SELECT ON public.storyflow_generation_jobs TO authenticated;
GRANT SELECT ON public.storyflow_exports TO authenticated;

DROP POLICY IF EXISTS compliance_profiles_owner_insert ON public.storyflow_compliance_profiles;
DROP POLICY IF EXISTS compliance_profiles_owner_update ON public.storyflow_compliance_profiles;
DROP POLICY IF EXISTS compliance_profiles_owner_delete ON public.storyflow_compliance_profiles;
DROP POLICY IF EXISTS compliance_profiles_owner_select ON public.storyflow_compliance_profiles;
CREATE POLICY compliance_profiles_owner_select ON public.storyflow_compliance_profiles
  FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS ai_label_records_owner_insert ON public.storyflow_ai_label_records;
DROP POLICY IF EXISTS ai_label_records_owner_delete ON public.storyflow_ai_label_records;
DROP POLICY IF EXISTS ai_label_records_owner_select ON public.storyflow_ai_label_records;
CREATE POLICY ai_label_records_owner_select ON public.storyflow_ai_label_records
  FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS export_compliance_runs_owner_insert ON public.storyflow_export_compliance_runs;
DROP POLICY IF EXISTS export_compliance_runs_owner_delete ON public.storyflow_export_compliance_runs;
DROP POLICY IF EXISTS export_compliance_runs_owner_select ON public.storyflow_export_compliance_runs;
CREATE POLICY export_compliance_runs_owner_select ON public.storyflow_export_compliance_runs
  FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS generation_jobs_owner_insert ON public.storyflow_generation_jobs;
DROP POLICY IF EXISTS generation_jobs_owner_update ON public.storyflow_generation_jobs;
DROP POLICY IF EXISTS generation_jobs_owner_delete ON public.storyflow_generation_jobs;
DROP POLICY IF EXISTS generation_jobs_owner_select ON public.storyflow_generation_jobs;
CREATE POLICY generation_jobs_owner_select ON public.storyflow_generation_jobs
  FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS exports_owner_all ON public.storyflow_exports;
DROP POLICY IF EXISTS exports_select_own ON public.storyflow_exports;
DROP POLICY IF EXISTS exports_insert_own ON public.storyflow_exports;
DROP POLICY IF EXISTS exports_update_own ON public.storyflow_exports;
DROP POLICY IF EXISTS exports_delete_own ON public.storyflow_exports;
CREATE POLICY exports_select_own ON public.storyflow_exports
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
