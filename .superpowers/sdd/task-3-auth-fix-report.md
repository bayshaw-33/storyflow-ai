# Task 3 authentication fix

## Finding

The root layout mounts `KkRuntimeProvider` without an explicit access token. The provider previously passed `null` to the live KK and task APIs, so authenticated users still received `401 Authentication required.` from the live job feed.

## Fix

- Resolve the Supabase browser session when `accessToken` is omitted.
- Track `getSession()` and `onAuthStateChange()` so refreshes use the current token.
- Keep explicit `accessToken={null}` behavior for callers that intentionally force an unauthenticated request.
- Gate runtime, event, fixture, and task-message requests until session resolution completes.

## Verification

- `node --test tests/ui-v2/kk/kk-runtime-auth.test.mjs`
- `pnpm exec tsc --noEmit`
- `git diff --check`

The regression test is dependency-free and verifies the actual root-layout/provider wiring and all live request call sites.
