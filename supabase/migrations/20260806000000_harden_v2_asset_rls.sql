-- Replace V2's temporary open policies with parent-owner authorization.

DROP POLICY IF EXISTS identity_passports_select ON public.storyflow_identity_passports;
DROP POLICY IF EXISTS identity_passports_insert ON public.storyflow_identity_passports;
DROP POLICY IF EXISTS identity_passports_update ON public.storyflow_identity_passports;
DROP POLICY IF EXISTS identity_passports_delete ON public.storyflow_identity_passports;
CREATE POLICY identity_passports_owner_all ON public.storyflow_identity_passports FOR ALL TO authenticated
USING ((project_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.storyflow_projects p WHERE p.id = project_id AND p.user_id = (select auth.uid()))) OR (project_id IS NULL AND EXISTS (SELECT 1 FROM public.storyflow_actor_profiles a WHERE a.id = actor_profile_id AND a.owner_id = (select auth.uid()))))
WITH CHECK ((project_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.storyflow_projects p WHERE p.id = project_id AND p.user_id = (select auth.uid()))) OR (project_id IS NULL AND EXISTS (SELECT 1 FROM public.storyflow_actor_profiles a WHERE a.id = actor_profile_id AND a.owner_id = (select auth.uid()))));

DROP POLICY IF EXISTS keyframe_sets_project_select ON public.storyflow_keyframe_sets;
DROP POLICY IF EXISTS keyframe_sets_project_insert ON public.storyflow_keyframe_sets;
DROP POLICY IF EXISTS keyframe_sets_project_update ON public.storyflow_keyframe_sets;
DROP POLICY IF EXISTS keyframe_sets_project_delete ON public.storyflow_keyframe_sets;
CREATE POLICY keyframe_sets_project_owner_all ON public.storyflow_keyframe_sets FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.storyflow_projects p WHERE p.id = project_id AND p.user_id = (select auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.storyflow_projects p WHERE p.id = project_id AND p.user_id = (select auth.uid())));

DROP POLICY IF EXISTS keyframe_slots_select ON public.storyflow_keyframe_slots;
DROP POLICY IF EXISTS keyframe_slots_insert ON public.storyflow_keyframe_slots;
DROP POLICY IF EXISTS keyframe_slots_update ON public.storyflow_keyframe_slots;
DROP POLICY IF EXISTS keyframe_slots_delete ON public.storyflow_keyframe_slots;
CREATE POLICY keyframe_slots_project_owner_all ON public.storyflow_keyframe_slots FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.storyflow_keyframe_sets s JOIN public.storyflow_projects p ON p.id = s.project_id WHERE s.id = keyframe_set_id AND p.user_id = (select auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.storyflow_keyframe_sets s JOIN public.storyflow_projects p ON p.id = s.project_id WHERE s.id = keyframe_set_id AND p.user_id = (select auth.uid())));

DROP POLICY IF EXISTS keyframe_candidates_select ON public.storyflow_keyframe_candidates;
DROP POLICY IF EXISTS keyframe_candidates_insert ON public.storyflow_keyframe_candidates;
DROP POLICY IF EXISTS keyframe_candidates_update ON public.storyflow_keyframe_candidates;
DROP POLICY IF EXISTS keyframe_candidates_delete ON public.storyflow_keyframe_candidates;
CREATE POLICY keyframe_candidates_project_owner_all ON public.storyflow_keyframe_candidates FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.storyflow_keyframe_slots l JOIN public.storyflow_keyframe_sets s ON s.id = l.keyframe_set_id JOIN public.storyflow_projects p ON p.id = s.project_id WHERE l.id = keyframe_slot_id AND p.user_id = (select auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.storyflow_keyframe_slots l JOIN public.storyflow_keyframe_sets s ON s.id = l.keyframe_set_id JOIN public.storyflow_projects p ON p.id = s.project_id WHERE l.id = keyframe_slot_id AND p.user_id = (select auth.uid())));

DROP POLICY IF EXISTS selected_takes_select ON public.storyflow_selected_takes;
DROP POLICY IF EXISTS selected_takes_insert ON public.storyflow_selected_takes;
DROP POLICY IF EXISTS selected_takes_update ON public.storyflow_selected_takes;
DROP POLICY IF EXISTS selected_takes_delete ON public.storyflow_selected_takes;
CREATE POLICY selected_takes_project_owner_all ON public.storyflow_selected_takes FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.storyflow_projects p WHERE p.id = project_id AND p.user_id = (select auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.storyflow_projects p WHERE p.id = project_id AND p.user_id = (select auth.uid())));

DROP POLICY IF EXISTS assembly_sequences_select ON public.storyflow_assembly_sequences;
DROP POLICY IF EXISTS assembly_sequences_insert ON public.storyflow_assembly_sequences;
DROP POLICY IF EXISTS assembly_sequences_update ON public.storyflow_assembly_sequences;
DROP POLICY IF EXISTS assembly_sequences_delete ON public.storyflow_assembly_sequences;
CREATE POLICY assembly_sequences_project_owner_all ON public.storyflow_assembly_sequences FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.storyflow_projects p WHERE p.id = project_id AND p.user_id = (select auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.storyflow_projects p WHERE p.id = project_id AND p.user_id = (select auth.uid())));

DROP POLICY IF EXISTS assembly_items_select ON public.storyflow_assembly_items;
DROP POLICY IF EXISTS assembly_items_insert ON public.storyflow_assembly_items;
DROP POLICY IF EXISTS assembly_items_update ON public.storyflow_assembly_items;
DROP POLICY IF EXISTS assembly_items_delete ON public.storyflow_assembly_items;
CREATE POLICY assembly_items_project_owner_all ON public.storyflow_assembly_items FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.storyflow_assembly_sequences s JOIN public.storyflow_projects p ON p.id = s.project_id WHERE s.id = assembly_sequence_id AND p.user_id = (select auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.storyflow_assembly_sequences s JOIN public.storyflow_projects p ON p.id = s.project_id WHERE s.id = assembly_sequence_id AND p.user_id = (select auth.uid())));

DROP POLICY IF EXISTS gen_job_targets_select ON public.storyflow_generation_job_targets;
DROP POLICY IF EXISTS gen_job_targets_insert ON public.storyflow_generation_job_targets;
DROP POLICY IF EXISTS gen_job_targets_delete ON public.storyflow_generation_job_targets;
CREATE POLICY gen_job_targets_owner_all ON public.storyflow_generation_job_targets FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.storyflow_generation_jobs j WHERE j.id = generation_job_id AND j.owner_id = (select auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.storyflow_generation_jobs j WHERE j.id = generation_job_id AND j.owner_id = (select auth.uid())));

DROP POLICY IF EXISTS input_assets_select ON public.storyflow_input_assets;
DROP POLICY IF EXISTS input_assets_insert ON public.storyflow_input_assets;
DROP POLICY IF EXISTS input_assets_delete ON public.storyflow_input_assets;
CREATE POLICY input_assets_owner_all ON public.storyflow_input_assets FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.storyflow_generation_jobs j WHERE j.id = generation_job_id AND j.owner_id = (select auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.storyflow_generation_jobs j WHERE j.id = generation_job_id AND j.owner_id = (select auth.uid())));
