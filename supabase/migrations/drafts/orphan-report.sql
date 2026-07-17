-- ============================================================
-- Orphan 数据检测脚本（初稿，待 Codex 审核）
-- 检测迁移后可能产生的孤儿数据，供 Kimi/Codex 评估清理策略。
-- 只读操作。
-- ============================================================

-- 1. 无 project 的 character
SELECT 'orphan_character_no_project' AS type, c.id, c.name, c.project_id
FROM public.storyflow_characters c
WHERE NOT EXISTS (SELECT 1 FROM public.storyflow_drama_projects p WHERE p.id = c.project_id)
ORDER BY c.created_at DESC;

-- 2. 无 character 的 appearance_variant
SELECT 'orphan_variant_no_character' AS type, v.id, v.name, v.character_id
FROM public.storyflow_character_appearance_variants v
WHERE NOT EXISTS (SELECT 1 FROM public.storyflow_characters c WHERE c.id = v.character_id)
ORDER BY v.created_at DESC;

-- 3. 无 actor_profile 的 casting（迁移后可能产生）
SELECT 'orphan_casting_no_actor' AS type, ca.id, ca.character_id, ca.actor_profile_id
FROM public.storyflow_casting_assignments ca
WHERE ca.actor_profile_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.storyflow_actor_profiles ap WHERE ap.id = ca.actor_profile_id);

-- 4. 无 casting_assignment 的 portrayal（迁移后可能产生，casting_assignment_id 可为 NULL，但应记录）
SELECT 'orphan_portrayal_no_casting' AS type, cp.id, cp.character_id, cp.actor_profile_id
FROM public.storyflow_character_portrayals cp
WHERE cp.casting_assignment_id IS NULL;

-- 5. 无 project 的 art_asset
SELECT 'orphan_art_no_project' AS type, a.id, a.name, a.project_id
FROM public.storyflow_art_assets a
WHERE a.project_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.storyflow_drama_projects p WHERE p.id = a.project_id);

-- 6. 统计汇总
SELECT 'orphan_summary' AS check_name,
       (SELECT COUNT(*) FROM public.storyflow_characters c
        WHERE NOT EXISTS (SELECT 1 FROM public.storyflow_drama_projects p WHERE p.id = c.project_id)) AS orphan_characters,
       (SELECT COUNT(*) FROM public.storyflow_character_appearance_variants v
        WHERE NOT EXISTS (SELECT 1 FROM public.storyflow_characters c WHERE c.id = v.character_id)) AS orphan_variants;
