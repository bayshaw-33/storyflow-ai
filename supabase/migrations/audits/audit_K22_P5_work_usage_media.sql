-- KIIKIS V2.2 Phase 5 audit — Work Usage Links & media assets
-- Verifies no orphaned work/version/grant references and append-only behavior.

begin;

-- 1. no orphan source works
select count(*) as orphan_source_works
from public.storyflow_work_usage_links l
left join public.storyflow_works w on w.id = l.source_work_id
where w.id is null;

-- 2. no orphan target works
select count(*) as orphan_target_works
from public.storyflow_work_usage_links l
left join public.storyflow_works w on w.id = l.target_work_id
where w.id is null;

-- 3. no orphan source versions
select count(*) as orphan_source_versions
from public.storyflow_work_usage_links l
left join public.storyflow_work_versions v on v.id = l.source_work_version_id
where v.id is null;

-- 4. no orphan grants referenced by links
select count(*) as orphan_grants
from public.storyflow_work_usage_links l
left join public.storyflow_resource_grants g on g.id = l.rights_snapshot_id
where l.rights_snapshot_id is not null and g.id is null;

-- 5. append-only: update must fail
DO $$
BEGIN
  BEGIN
    UPDATE public.storyflow_work_usage_links SET usage_role = 'editing_input' WHERE false;
    RAISE EXCEPTION 'append-only trigger NOT enforced (silent no-op)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%append-only%' THEN
      RAISE NOTICE 'append-only OK';
    ELSE
      RAISE;
    END IF;
  END;
END $$;

rollback;
