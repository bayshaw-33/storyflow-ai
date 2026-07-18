-- ============================================================
-- audit-casting-portrayal-orphans.sql
-- PRD v3.0 §8.4: 输出无法回填 owner_id 的历史行清单
-- 执行 20260720010000 migration 后运行此脚本
-- ============================================================

-- 1. casting_assignments 缺 owner_id
SELECT 'casting_missing_owner' AS check_name,
       ca.id, ca.project_id, ca.character_id, ca.actor_profile_id, ca.created_at,
       CASE WHEN p.id IS NULL THEN 'project_missing' ELSE 'project_owner_null' END AS reason
FROM public.storyflow_casting_assignments ca
LEFT JOIN public.storyflow_projects p ON p.id = ca.project_id
WHERE ca.owner_id IS NULL
ORDER BY ca.created_at DESC;

-- 2. character_portrayals 缺 owner_id
SELECT 'portrayal_missing_owner' AS check_name,
       cp.id, cp.actor_profile_id, cp.character_id, cp.project_id, cp.created_at,
       CASE
         WHEN ap.id IS NULL THEN 'actor_profile_missing'
         WHEN ap.owner_id IS NULL THEN 'actor_owner_null'
       END AS reason
FROM public.storyflow_character_portrayals cp
LEFT JOIN public.storyflow_actor_profiles ap ON ap.id = cp.actor_profile_id
WHERE cp.owner_id IS NULL
ORDER BY cp.created_at DESC;

-- 3. 汇总
SELECT 'orphan_summary' AS check_name,
       (SELECT COUNT(*) FROM public.storyflow_casting_assignments WHERE owner_id IS NULL) AS casting_orphans,
       (SELECT COUNT(*) FROM public.storyflow_character_portrayals WHERE owner_id IS NULL) AS portrayal_orphans;
