# STACK_REPORT

Generated: 2026-06-27T12:26:22.545Z

## Detected Stack

- specMode: PRD-001 Spec Patch v1.2 Adaptive Mode

- framework: Next.js
- componentLibrary: Custom internal components
- authSystem: Supabase
- stateManagement: React Context + local component state
- routing: Next.js App Router
- styling: Custom CSS in app/globals.css
- testRunner: None detected
- browserTestRunner: None detected

## App Routes

- /admin
- /api
- /companions
- /dashboard
- /kk
- /login
- /novel-workbench
- /projects
- /reset-password
- /settings
- /song-workbench
- /subscription
- /templates
- /universes
- /viral-workbench

## Conflicts

- Spec assumes Tailwind CSS, but this repo uses custom CSS in app/globals.css.
- Spec requires Vitest tests, but no Vitest dependency or script is present.
- Spec requires Puppeteer E2E, but no Puppeteer dependency or script is present.
- Spec names Radix Dialog as fallback, but Radix packages are not installed.
- Spec routes script entry to /projects-demo, but that route is absent.
- Spec routes storyboard entry to /storyboard, but that route is absent.
- Spec routes video entry to /video, but that route is absent.
- Spec routes OST entry to /song-creation, but current song route appears to be /song-workbench.

## Decision

Initial v1.1 conflicts are present, but Director supplied PRD-001 Spec Patch v1.2 Adaptive Mode. Implementation may proceed using custom CSS, internal React components, disabled tooltips, and manual UAT.
