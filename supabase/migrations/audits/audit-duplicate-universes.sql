-- ============================================================
-- audit-duplicate-universes.sql
-- PRD v3.0 §8.6: 重复 Universe 只读报告
-- 候选重复项判定：同 owner 下名称相似 + 关联同一 project_id
-- 不自动删除，仅输出清单供人工选择保留的主 Universe
-- ============================================================

-- 1. 同 owner + 同名（精确匹配）
SELECT 'exact_name_duplicate' AS check_name,
       user_id, name, COUNT(*) AS dup_count,
       array_agg(id ORDER BY created_at) AS universe_ids,
       array_agg(created_at ORDER BY created_at) AS created_ats
FROM public.storyflow_universes
GROUP BY user_id, name
HAVING COUNT(*) > 1
ORDER BY dup_count DESC;

-- 2. 同 owner + 关联同一 project（疑似重复派生）
SELECT 'same_project_duplicate' AS check_name,
       l.project_id,
       l.user_id AS link_owner,
       COUNT(DISTINCT l.universe_id) AS universe_count,
       array_agg(l.universe_id ORDER BY l.created_at) AS universe_ids,
       array_agg(u.name ORDER BY l.created_at) AS universe_names
FROM public.storyflow_universe_project_links l
JOIN public.storyflow_universes u ON u.id = l.universe_id
GROUP BY l.project_id, l.user_id
HAVING COUNT(DISTINCT l.universe_id) > 1
ORDER BY universe_count DESC;

-- 3. 候选项详细对比（实体数/作品数/inbox 数/最近更新）
WITH candidates AS (
  SELECT l.project_id, l.universe_id, u.name, u.created_at, u.updated_at,
         u.user_id
  FROM public.storyflow_universe_project_links l
  JOIN public.storyflow_universes u ON u.id = l.universe_id
  WHERE l.project_id IN (
    SELECT l2.project_id FROM public.storyflow_universe_project_links l2
    GROUP BY l2.project_id HAVING COUNT(DISTINCT l2.universe_id) > 1
  )
)
SELECT 'candidate_detail' AS check_name,
       c.project_id,
       c.universe_id,
       c.name,
       c.created_at,
       c.updated_at,
       (SELECT COUNT(*) FROM public.storyflow_universe_entities e WHERE e.universe_id = c.universe_id) AS entity_count,
       (SELECT COUNT(*) FROM public.storyflow_universe_project_links ll WHERE ll.universe_id = c.universe_id) AS work_count,
       (SELECT COUNT(*) FROM public.storyflow_universe_inbox_items i WHERE i.universe_id = c.universe_id) AS inbox_count
FROM candidates c
ORDER BY c.project_id, c.created_at;

-- 4. 汇总
SELECT 'duplicate_summary' AS check_name,
       (SELECT COUNT(*) FROM (
          SELECT user_id, name FROM public.storyflow_universes
          GROUP BY user_id, name HAVING COUNT(*) > 1
       ) t) AS exact_name_groups,
       (SELECT COUNT(*) FROM (
          SELECT project_id FROM public.storyflow_universe_project_links
          GROUP BY project_id HAVING COUNT(DISTINCT universe_id) > 1
       ) t) AS projects_with_multiple_universes;
