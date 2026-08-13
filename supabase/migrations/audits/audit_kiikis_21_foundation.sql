-- ============================================================
-- KIIKIS 2.1 Phase 1 Foundation Audit
-- 检查 storyflow_creative_events 表的 RLS、约束、数据完整性
-- 用法: psql -f audit_kiikis_21_foundation.sql
-- 预期: 所有查询返回 0 行；非零行表示需要修复
-- ============================================================

\echo '=== A. RLS 是否启用 ==='
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rowsecurity_enabled,
  c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'storyflow_creative_events';
-- 预期: rowsecurity_enabled = true, force_rls = true

\echo '=== B. payload 为 null 的异常行 (K21-EV-005, 应为 0 行) ==='
SELECT id, owner_id, event_type, payload
FROM public.storyflow_creative_events
WHERE payload IS NULL;
-- 预期: 0 行（NOT NULL DEFAULT '{}' 约束已防）

\echo '=== C. visibility 非法值的残留 (应为 0 行) ==='
SELECT id, owner_id, visibility
FROM public.storyflow_creative_events
WHERE visibility NOT IN ('private', 'collaborators', 'public');
-- 预期: 0 行（CHECK 约束已防）

\echo '=== D. (owner_id, idempotency_key) 唯一冲突 (应为 0 行) ==='
SELECT owner_id, idempotency_key, COUNT(*) AS dup_count
FROM public.storyflow_creative_events
GROUP BY owner_id, idempotency_key
HAVING COUNT(*) > 1;
-- 预期: 0 行（UNIQUE 约束已防）

\echo '=== E. schema_version 非正整数的残留 (应为 0 行) ==='
SELECT id, schema_version
FROM public.storyflow_creative_events
WHERE schema_version <= 0;
-- 预期: 0 行（CHECK 约束已防）

\echo '=== F. actorType=user 但 actor_id 为 null 的异常 (应为 0 行) ==='
SELECT id, actor_type, actor_id, owner_id
FROM public.storyflow_creative_events
WHERE actor_type = 'user' AND actor_id IS NULL;
-- 预期: 0 行（应用层 parseCreativeEvent 已防）

\echo '=== G. owner_id 不在 auth.users 的孤儿事件 (应为 0 行) ==='
SELECT e.id, e.owner_id, e.event_type
FROM public.storyflow_creative_events e
LEFT JOIN auth.users u ON u.id = e.owner_id
WHERE u.id IS NULL;
-- 预期: 0 行（FK ON DELETE RESTRICT 已防）

\echo '=== H. sequence 是否单调连续 (gap 检查, 仅供参考) ==='
SELECT owner_id, sequence, lag(sequence) OVER (PARTITION BY owner_id ORDER BY sequence) AS prev_seq
FROM public.storyflow_creative_events
WHERE sequence - COALESCE(lag(sequence) OVER (PARTITION BY owner_id ORDER BY sequence), sequence - 1) > 1;
-- 预期: 可能存在 gap（事务回滚导致 IDENTITY 跳号），不影响幂等性，仅记录

\echo '=== I. guard trigger 是否存在 ==='
SELECT tgname, tgtype, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.storyflow_creative_events'::regclass
  AND tgname = 'storyflow_creative_events_immutable_guard';
-- 预期: 1 行, tgenabled = 'O' (origin)

\echo '=== J. Realtime publication 是否包含 storyflow_creative_events ==='
SELECT pubname, schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'storyflow_creative_events';
-- 预期: 1 行

\echo '=== K. Realtime publication 不应包含无关 Phase 1 表 (应为 0 行) ==='
-- 本 audit 不强制其他表清单，只确认本 migration 没有错误地把其他表加入
-- 若怀疑有误加，运行: SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

\echo '=== L. RLS policy 清单 (人工确认无 UPDATE/DELETE) ==='
SELECT polname, polcmd, polqual, polwithcheck
FROM pg_policy
WHERE polrelid = 'public.storyflow_creative_events'::regclass
ORDER BY polname;
-- 预期: 3 行
--   storyflow_creative_events_owner_insert    (polcmd='a' INSERT)
--   storyflow_creative_events_owner_select    (polcmd='r' SELECT)
--   storyflow_creative_events_public_select   (polcmd='r' SELECT)
-- 不应出现 polcmd='w' (UPDATE) 或 polcmd='d' (DELETE)

\echo '=== Audit 完成：以上所有非空结果集都需要人工复核 ==='
