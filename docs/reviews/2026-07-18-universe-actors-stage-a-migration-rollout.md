# Universe / Actors Stage A migration rollout

Date: 2026-07-18 18:10 +08  
Executor: Codex

## Targets

- Staging: `kiikis-staging` (`cwpyolxitkcpitqizgtq`)
- Production: `StoryFlow` (`vgcafbzksizlwmylphzu`)

Both projects were `ACTIVE_HEALTHY` before execution. The local Supabase link remained on staging.

## Preflight

- Staging dry-run contained only:
  - `20260718060000_actor_metadata_and_email_revoke.sql`
  - `20260720000000_universe_card_fields.sql`
  - `20260720010000_casting_portrayal_owner_rls.sql`
- Both environments had 0 casting rows and 0 portrayal rows, so owner backfill changed no creator records.
- Both environments had 8 permissive casting/portrayal policies before the rollout.
- Relevant columns were absent before execution.

## Applied

Staging migration history records the local versions directly. Production uses the authenticated Supabase migration API because its historical baseline differs from the repository; the production records are:

- `20260718100519` → `actor_metadata_and_email_revoke_20260718060000`
- `20260718100523` → `universe_card_fields_20260720000000`
- `20260718100527` → `casting_portrayal_owner_rls_20260720010000`
- `20260718100919` → `harden_team_authorization_helpers_20260718100702`

The final hardening migration removes authenticated access to email lookup, removes anon/PUBLIC access to team helpers, pins helper `search_path`, and requires `p_user_id = auth.uid()`.

## Verification

- 9 expected columns exist with the intended types/defaults.
- 8 expected indexes exist.
- Both target tables have RLS enabled.
- 8 owner/team policies exist; permissive `true` policies: 0.
- Casting/portrayal NULL-owner rows: 0/0.
- Cross-owner project links: 0.
- Projects linked to multiple Universes: 0.
- Email lookup executable by anon/authenticated: false/false.
- Team helper executable by anon: false.
- Team helper self guards are present in both function definitions.
- Supabase Advisor still reports the two team helpers as authenticated `SECURITY DEFINER` functions because RLS must call them. Their callable surface is intentionally retained and constrained to the current JWT user.

## Rollback

`supabase/migrations/rollback/20260720_rollback.sql` was changed to fail closed: it preserves all new columns and creator data, and downgrades casting/portrayal access to owner-only instead of restoring public policies. It was not executed because both rollouts and all post-write checks succeeded.

## Local gates

- `node --test tests/*.test.mjs`: 296/296 passed.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm run build`: passed; 67/67 static pages generated.

