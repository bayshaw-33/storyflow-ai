# Production pre-migration schema snapshot

- Captured: 2026-07-18 (UTC+08)
- Project: `StoryFlow` (`vgcafbzksizlwmylphzu`)
- Method: read-only Supabase Management API schema queries; no user data was exported.

## Migration history before change

| Version | Name |
| --- | --- |
| `20260717172720` | `20260717152816_storyboard_stable_state` |
| `20260717172838` | `20260718010000_export_artifact_release` |

## Relevant schema state before change

- `storyflow_projects.delivery_package`: absent.
- `storyflow_generation_jobs.idempotency_hash` and `storage_path`: absent.
- `uq_generation_jobs_idempotency_hash`, `idx_generation_jobs_storage_path`, and `idx_generation_jobs_provider`: absent.
- Private `storyboard-videos` bucket: absent; its two owner policies were absent.
- Existing production state prerequisites: `storyflow_projects`, `storyflow_production_projects`, `storyflow_production_scenes`, `storyflow_production_shots`, `storyflow_generation_jobs`, and `storyflow_versions` exist. `storyflow_production_projects.source_unit_id` and `revision` exist.

## Planned additive changes

1. `20260718100000_video_idempotency_and_storage.sql`
2. `20260719100000_add_storyflow_projects_delivery_package.sql`

Both changes add only missing schema objects. The video rollback script removes its two columns, three indexes, and two Storage policies; the delivery column rollback is `ALTER TABLE public.storyflow_projects DROP COLUMN delivery_package` only after a data-retention review.
