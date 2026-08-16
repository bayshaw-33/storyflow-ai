# 生产库迁移前快照（2026-08-16）

- 目标：`vgcafbzksizlwmylphzu`（StoryFlow，Seoul）= kiikis.com 实际连接库
- 采集方式：Supabase Management API `database/query`（postgres 身份，只读）
- 目的：补齐 V2.2 缺失迁移前的现状记录；本文件为只读核验产物，未做任何写入

## 迁移历史（supabase_migrations.schema_migrations，共 27 条）

完整到 `20260724000000`，之后仅有：
- `20260828000000`（K22-P0_work_identity）
- `20260829020000`（K22-P0_fix_project_start_rpc_ambiguity）

即 2026-07-25 之后共有 41 条本地迁移未登记。

## 关键表存在性核验

已存在（含手工补过 schema 但未记历史的）：
- `storyflow_works`、`storyflow_project_starts`（K22-P0）
- `storyflow_ai_prompts`、`storyflow_ai_prompt_versions`、`storyflow_ai_prompt_overrides`、`storyflow_admin_roles`、`storyflow_admin_audit_log`（20260727000000 的对象已在）
- `storyflow_universe_shares`、`storyflow_content_reports`（部分 8 月上旬对象已在）
- `storyflow_content_moderation`（仍在，待 20260730000000 按设计 DROP）

缺失（对线上 V2.2 前端直接造成 503 的层）：
- K22-P1：`storyflow_work_versions`、`storyflow_evidence_packages_v22`
- K22-P2：`storyflow_universe_versions`、`storyflow_work_inheritance_manifests/snapshots`、`storyflow_work_local_states`
- K22-P3：`storyflow_screenplay_units`、`storyflow_screenplay_unit_versions`、`storyflow_screenplay_dependency_edges`、`storyflow_continuity_index`、`storyflow_continuity_findings`
- KK 会话：`storyflow_conversation_threads`、`storyflow_conversation_messages`
- Candidate：`storyflow_generation_candidates`、`storyflow_generation_request_snapshots`
- K22-P4：`storyflow_source_works/versions/chunks`、`storyflow_universe_import_*`
- K22-P5：`storyflow_work_usage_links`、`storyflow_asset_versions_usage`、`storyflow_stale_resolutions`
- K2-C-04：`storyflow_change_proposals`、`storyflow_change_proposal_items`
- 2.1 全层：kk_profiles/inventory、grants、collab、community、billing、transactions、creative_events、screenplay_handoffs、dynamic_storyboards
- 其他：song_universe_links、badges/avatar、actor_orders/marketplace、voice_profiles/lines

## 数据量核验（迁移前基线）

| 表 | 行数 |
|---|---|
| auth.users | 14 |
| storyflow_projects | 66 |
| storyflow_works | 4 |
| storyflow_project_starts | 4 |
| storyflow_universes | 7 |
| storyflow_universe_entities | 0 |
| storyflow_characters | 0 |
| storyflow_episodes | 0 |
| storyflow_scenes | 0 |
| storyflow_assets | 51 |
| storyflow_art_assets | 55 |
| storyflow_actor_profiles | 31 |
| storyflow_generations | 826 |
| storyflow_versions | 1 |
| storyflow_evidence_events | 0 |

结论：旧项目数据完整存在；缺失的均为 V2.2/2.1 新增结构，与用户判断一致。
