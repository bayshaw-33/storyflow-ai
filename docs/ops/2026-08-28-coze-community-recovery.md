# Coze stability report — community feed recovery

Date: 2026-08-28

## Finding

Production `GET /api/v2/community/discover` returned HTTP 500 with `schema_error`. A read-only query against the production Supabase project showed that `storyflow_publications`, `storyflow_follows`, `storyflow_reactions`, and `storyflow_bookmarks` were absent, and migration version `20260827050000` was not recorded remotely.

## Action

After the production target gate passed, the existing migration was executed exactly once through the linked production target:

`supabase/migrations/20260827050000_kiikis_21_community.sql`

The migration version was then repaired as applied with `supabase migration repair`. No comments, moderation, or unrelated pending migrations were applied.

## Evidence

- Production tables now resolve to `storyflow_publications`, `storyflow_follows`, `storyflow_reactions`, and `storyflow_bookmarks`.
- Production migration history contains `20260827050000` once.
- `https://www.kiikis.com/api/v2/community/discover?limit=2` now returns HTTP 200 with a valid community contract and an empty `items` array.
- Staging rehearsal was not possible because the staging Supabase project is currently paused.

## Follow-up

Comments and moderation remain separate migrations and should be applied only when their dependent rollout is scheduled and the staging project is available for rehearsal.
