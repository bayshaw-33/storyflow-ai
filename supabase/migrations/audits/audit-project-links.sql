-- ============================================================
-- audit-project-links.sql
-- PRD v3.0 §8.5: project link 审计，只读
-- 检测：孤立 Universe（无 link）、孤立 project（无 link）、重复 link、跨 owner link
-- 用法：psql -f audit-project-links.sql
-- ============================================================

-- 1. 孤立 Universe：有 Universe 但无任何 project link
SELECT 'orphan_universe_no_link' AS check_name,
       u.id AS universe_id, u.name, u.user_id, u.created_at
FROM public.storyflow_universes u
WHERE NOT EXISTS (
  SELECT 1 FROM public.storyflow_universe_project_links l
  WHERE l.universe_id = u.id
)
ORDER BY u.created_at DESC;

-- 2. 孤立 project：有 project 但无 Universe link
SELECT 'orphan_project_no_link' AS check_name,
       p.id AS project_id, p.owner_id, p.title
FROM public.storyflow_projects p
WHERE NOT EXISTS (
  SELECT 1 FROM public.storyflow_universe_project_links l
  WHERE l.project_id = p.id
)
ORDER BY p.created_at DESC
LIMIT 100;

-- 3. 重复 link：同一 project_id 关联多个 Universe
SELECT 'duplicate_link_per_project' AS check_name,
       l.project_id,
       COUNT(DISTINCT l.universe_id) AS universe_count,
       array_agg(l.universe_id) AS universe_ids
FROM public.storyflow_universe_project_links l
GROUP BY l.project_id
HAVING COUNT(DISTINCT l.universe_id) > 1
ORDER BY universe_count DESC;

-- 4. 跨 owner link：link 的 user_id 与 project owner_id 不一致
SELECT 'cross_owner_link' AS check_name,
       l.id AS link_id, l.project_id, l.user_id AS link_user_id,
       p.owner_id AS project_owner_id
FROM public.storyflow_universe_project_links l
JOIN public.storyflow_projects p ON p.id = l.project_id
WHERE l.user_id <> p.owner_id
ORDER BY l.created_at DESC;

-- 5. link 指向不存在的 project
SELECT 'link_to_missing_project' AS check_name,
       l.id AS link_id, l.universe_id, l.project_id
FROM public.storyflow_universe_project_links l
WHERE NOT EXISTS (
  SELECT 1 FROM public.storyflow_projects p WHERE p.id = l.project_id
);

-- 6. link 指向不存在的 Universe
SELECT 'link_to_missing_universe' AS check_name,
       l.id AS link_id, l.project_id, l.universe_id
FROM public.storyflow_universe_project_links l
WHERE NOT EXISTS (
  SELECT 1 FROM public.storyflow_universes u WHERE u.id = l.universe_id
);

-- 7. 汇总
SELECT 'audit_summary' AS check_name,
       (SELECT COUNT(*) FROM public.storyflow_universes u
        WHERE NOT EXISTS (SELECT 1 FROM public.storyflow_universe_project_links l WHERE l.universe_id = u.id)) AS orphan_universes,
       (SELECT COUNT(*) FROM public.storyflow_projects p
        WHERE NOT EXISTS (SELECT 1 FROM public.storyflow_universe_project_links l WHERE l.project_id = p.id)) AS orphan_projects,
       (SELECT COUNT(*) FROM (
          SELECT l.project_id FROM public.storyflow_universe_project_links l
          GROUP BY l.project_id HAVING COUNT(DISTINCT l.universe_id) > 1
       ) t) AS projects_with_duplicate_links,
       (SELECT COUNT(*) FROM public.storyflow_universe_project_links l
        JOIN public.storyflow_projects p ON p.id = l.project_id
        WHERE l.user_id <> p.owner_id) AS cross_owner_links;
