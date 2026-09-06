# Kiikis stability audit — 2026-09-05

## Scope and safeguards

- Test account supplied privately by owner; credentials excluded from artifacts.
- Existing signed-in browser shows bayshaw33. No password reset or permission changes.
- Preserve database schema, creative works, and workbench layout.
- Baseline: origin/main `dff3bacd`; existing clean local worktree `kiikis-p0-closed-loop` reused. Canonical checkout's unrelated files untouched.
- Production at start: `dpl_CdVNrUa7KmN7U7JWJMpysYwq5y39`, Ready, aliases kiikis.com / www.kiikis.com.

## Evidence so far

| Area | Evidence | Status |
| --- | --- | --- |
| Browser channel | Short automation calls timed out; longer individual calls can read/click. User confirms page itself responds. | Tool limitation, NOT evidence of application freezing |
| Login session / dashboard | Signed-in bayshaw33; 33 projects rendered; no authentication failure in project list. | Read verified |
| Legacy art project entry | Different standalone art rows all link to `/art-workbench`, without row identity. Helper deliberately distinguishes legacy art IDs from main project IDs. | Investigating draft-selection loss; do not route legacy ID to production blindly |
| Previs storage quota | Mounted actual component with throwing storage; uncaught QuotaExceededError in passive effect. | Reproduced, patched |
| Previs unit switch | Actual component writes Unit A into Unit B key before hydration; new Unit C inherits Unit B. | Reproduced, patched |
| Corrupt previs draft | Invalid original bytes replaced by serialized default scene on mount. | Reproduced, patched; pause autosave and preserve original |
| Previs handoff | Server save succeeds, local cache throw suppresses adoption and reports save failure. | Reproduced, patched |
| Production 5xx log query | Vercel query for last 24h returned no rows. | Not proof all client flows work |

## Verification

- Initial focused baseline: 25/25 passing.
- Actual-component lifecycle regressions: 5/5 passing after reproduced failures, including scene initialization when shot data arrives after mount.
- Modern main-table Art project routing regression added; project-library suite 7/7. Legacy art identity selection remains separate/unresolved.
- Voice test harness now resolves its actual validation module through the same narrow alias mapping; no production voice implementation changed.
- Fresh root suite `node --test tests/*.test.mjs`: 2086/2086 passed, no skips. This does not include every nested test directory.
- `pnpm build` and subsequent `pnpm exec tsc --noEmit`: both exit 0.
- Logged-in Universe detail and Bible loaded successfully; prior Illegal invocation not reproduced. Other Universe actions not fully accepted.
- Created clearly labeled synthetic project `稳定性验收-20260905` through UI: creation and script entry loaded. An interrupted browser call means chat completion is not confirmed; do not blindly resubmit or duplicate the project.
- Four-stage creation/adoption/reopen pipeline and final production acceptance still pending.
- No deployment of this patch yet. Do not describe the overall audit as complete.

## Usability evidence and separate preview

- Source review: white-model actor placement uses numeric XYZ editor rather than direct scene-object manipulation; no full object undo/duplicate/delete workflow. This is an interaction capability gap, not merely styling.
- Source review: storyboard canvas wheel always zooms; keyboard handler only covers Escape/Delete; export draws labeled rectangles rather than actual frames. Existing right-click menu is present, so do not report that it has no right-click support.
- User requested UI optimization as well as reliability. Independent preview is in `reports/ux-preview/`, preserving the workbench frame, with no database/API integration.
- Preview explores familiar canvas controls, contextual menu, undo, compact navigation, and direct spatial manipulation. White-model view is explicitly an SVG interaction mock, not actual 3D or production-ready video functionality.
- Commercial end-to-end acceptance remains open. Unit/build success and a preview are not substitutes for finishing a real project.
