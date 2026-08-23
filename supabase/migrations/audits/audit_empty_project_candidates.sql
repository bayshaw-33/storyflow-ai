-- P1-01 / PRD §10.5 — 空壳项目候选清理审计（只读，不删除任何数据）
--
-- 用途：为"疑似空项目"候选生成完整的关联检查报告。每个候选列出
-- Project/Work/Unit/Version/Candidate/Conversation/Asset/Universe/Evidence
-- 的关联计数；只有全为 0 的行才是清理候选，删除决策与执行不在本 PRD 范围。
--
-- 执行方式（先过目标库门禁）：
--   node scripts/verify-supabase-target.mjs --status
--   node scripts/verify-supabase-target.mjs staging   # 先 staging 验证
--   # 生产执行前必须显式切到 production 并获得人工确认
--   supabase db execute --file supabase/migrations/audits/audit_empty_project_candidates.sql
--
-- 幂等：纯 SELECT，可重复执行。

WITH work_counts AS (
  SELECT project_id, COUNT(*) AS works
  FROM storyflow_works
  GROUP BY project_id
),
unit_counts AS (
  SELECT w.project_id, COUNT(u.id) AS units
  FROM storyflow_works w
  LEFT JOIN storyflow_screenplay_units u ON u.work_id = w.id
  GROUP BY w.project_id
),
version_counts AS (
  SELECT w.project_id, COUNT(v.id) AS work_versions
  FROM storyflow_works w
  LEFT JOIN storyflow_work_versions v ON v.work_id = w.id
  GROUP BY w.project_id
),
candidate_counts AS (
  SELECT w.project_id, COUNT(c.id) AS candidates
  FROM storyflow_works w
  LEFT JOIN storyflow_generation_candidates c ON c.work_id = w.id
  GROUP BY w.project_id
),
thread_counts AS (
  SELECT w.project_id, COUNT(DISTINCT t.id) AS threads,
         COUNT(m.id) AS messages
  FROM storyflow_works w
  LEFT JOIN storyflow_conversation_threads t ON t.work_id = w.id
  LEFT JOIN storyflow_conversation_messages m ON m.thread_id = t.id
  GROUP BY w.project_id
),
asset_counts AS (
  SELECT p.id AS project_id,
         (SELECT COUNT(*) FROM storyflow_assets a WHERE a.project_id = p.id) AS assets,
         (SELECT COUNT(*) FROM storyflow_art_assets aa WHERE aa.project_id::text = p.id) AS art_assets,
         (SELECT COUNT(*) FROM storyflow_v2_assets va WHERE va.project_id = p.id) AS v2_assets
  FROM storyflow_projects p
),
universe_counts AS (
  SELECT p.id AS project_id, COUNT(l.id) AS universe_links
  FROM storyflow_projects p
  LEFT JOIN storyflow_universe_project_links l ON l.project_id = p.id AND l.unbound_at IS NULL
  GROUP BY p.id
),
evidence_counts AS (
  SELECT p.id AS project_id, COUNT(ec.id) AS evidence_cases
  FROM storyflow_projects p
  LEFT JOIN storyflow_evidence_cases ec ON ec.project_id = p.id
  GROUP BY p.id
),
export_counts AS (
  SELECT p.id AS project_id, COUNT(e.id) AS exports
  FROM storyflow_projects p
  LEFT JOIN storyflow_exports e ON e.project_id = p.id
  GROUP BY p.id
)
SELECT
  p.id            AS project_id,
  p.title,
  p.workflow_type,
  p.created_at,
  COALESCE(wc.works, 0)      AS works,
  COALESCE(uc.units, 0)      AS screenplay_units,
  COALESCE(vc.work_versions, 0) AS work_versions,
  COALESCE(cc.candidates, 0) AS candidates,
  COALESCE(tc.threads, 0)    AS conversation_threads,
  COALESCE(tc.messages, 0)   AS conversation_messages,
  COALESCE(ac.assets, 0)     AS assets,
  COALESCE(ac.art_assets, 0) AS art_assets,
  COALESCE(ac.v2_assets, 0)  AS v2_assets,
  COALESCE(unc.universe_links, 0) AS active_universe_links,
  COALESCE(evc.evidence_cases, 0) AS evidence_cases,
  COALESCE(exc.exports, 0)   AS exports,
  -- is_retired_novel 标记（结构化 marker：mode='novel' 或 data 内标记）
  (p.mode = 'novel')         AS legacy_novel_marker
FROM storyflow_projects p
LEFT JOIN work_counts wc       ON wc.project_id = p.id
LEFT JOIN unit_counts uc       ON uc.project_id = p.id
LEFT JOIN version_counts vc    ON vc.project_id = p.id
LEFT JOIN candidate_counts cc  ON cc.project_id = p.id
LEFT JOIN thread_counts tc     ON tc.project_id = p.id
LEFT JOIN asset_counts ac      ON ac.project_id = p.id
LEFT JOIN universe_counts unc  ON unc.project_id = p.id
LEFT JOIN evidence_counts evc  ON evc.project_id = p.id
LEFT JOIN export_counts exc    ON exc.project_id = p.id
WHERE p.deleted_at IS NULL
  AND COALESCE(wc.works, 0) = 0          -- 无任何 Work（P1-01 possiblyEmpty 的服务端事实源）
ORDER BY p.created_at ASC;

-- 附：清理候选严格判定（上述结果中全零关联 且 非 retired-novel 的行）。
-- 任何删除动作必须：单独 PR + 用户逐项授权 + 执行前快照 + 可回滚方案。
