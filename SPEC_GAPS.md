# SPEC_GAPS PRD-001

- `Script -> /projects` is not a concrete page in the current App Router tree. The implementation uses `/projects/demo?template=demo`, which is an existing working dynamic route.
- Storyboard and Video have no route modules. They remain disabled and non-navigating as required by Spec Patch v1.2.
- Auth success depends on Supabase `onAuthStateChange` in the landing page. If a future auth flow redirects away from `/`, the global modal provider is ready, but the redirect page will need to call `hasWorkspaceModalPostLoginAction()` and `openModal()`.
- The Phase 0 idea input is UI-only. It intentionally does not dispatch AI, create projects, or persist text.
- Manual UAT replaces automated E2E. A future test stack decision should add coverage without changing the feature behavior.
