-- ============================================================
-- Dry-run 检查脚本（初稿，待 Codex 审核）
-- 只读操作，不修改任何数据。用于评估迁移影响范围。
-- ============================================================

-- 1. 检查 casting 数据存量
SELECT 'casting_in_characters' AS check_name,
       COUNT(*) AS total_characters,
       COUNT(*) FILTER (WHERE cast IS NOT NULL AND cast != '[]'::jsonb) AS characters_with_cast
FROM public.storyflow_characters;

-- 2. 检查 character_appearance_variants 存量
SELECT 'appearance_variants' AS check_name,
       COUNT(*) AS total_variants
FROM public.storyflow_character_appearance_variants;

-- 3. 检查 v4 新表是否已存在数据（避免重复迁移）
SELECT 'v4_casting_existing' AS check_name, COUNT(*) AS existing_rows
FROM public.storyflow_casting_assignments;

SELECT 'v4_portrayals_existing' AS check_name, COUNT(*) AS existing_rows
FROM public.storyflow_character_portrayals;

-- 4. 检查可能成为 orphan 的数据
-- 4.1 无 project 的 character
SELECT 'orphan_characters_no_project' AS check_name, COUNT(*) AS orphan_count
FROM public.storyflow_characters c
WHERE NOT EXISTS (SELECT 1 FROM public.storyflow_drama_projects p WHERE p.id = c.project_id);

-- 4.2 无 character 的 appearance_variant
SELECT 'orphan_variants_no_character' AS check_name, COUNT(*) AS orphan_count
FROM public.storyflow_character_appearance_variants v
WHERE NOT EXISTS (SELECT 1 FROM public.storyflow_characters c WHERE c.id = v.character_id);

-- 5. 检查 RLS 策略状态（确保迁移前后一致）
SELECT 'rls_status' AS check_name,
       tablename,
       rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('storyflow_casting_assignments', 'storyflow_character_portrayals', 'storyflow_identity_passports')
ORDER BY tablename;

-- 6. 检查目标表结构（确认 v4 migration 已执行）
SELECT 'table_structure' AS check_name,
       table_name,
       column_name,
       data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('storyflow_casting_assignments', 'storyflow_character_portrayals')
ORDER BY table_name, ordinal_position;
