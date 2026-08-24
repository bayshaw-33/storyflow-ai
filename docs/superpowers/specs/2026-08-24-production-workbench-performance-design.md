# Production Workbench First-Open Performance Design

## Goal

Make an authenticated Kiikis production workbench usable sooner without changing the project, Work, Universe, screenplay, or evidence data model.

## Decisions

1. Keep the existing `/production` route and four-stage UI unchanged.
2. Load the currently selected stage only; screenplay, art, and storyboard modules must not all be in the initial JavaScript path.
3. Fetch a project context once per project route change. Authentication state changes must not trigger a second context request.
4. Run the production-entry verification only for storyboard and video, where it protects downstream production work; it must not delay screenplay or art.
5. Load the latest 30 KK messages first. Older messages remain intact and load on explicit user request.
6. Preserve private-data safety: no public CDN caching for project or conversation content.

## Verification

- Source-contract tests prove inactive stages are dynamically imported.
- Source-contract tests prove the context effect is project-scoped and the production gate is stage-scoped.
- Server tests prove a recent-message page returns chronological messages, a cursor, and never creates a blank conversation thread on read.
- UI tests prove the initial screenplay request uses the recent-message page and exposes an older-message action.
- Typecheck, focused tests, full relevant test suite, and production build pass.
