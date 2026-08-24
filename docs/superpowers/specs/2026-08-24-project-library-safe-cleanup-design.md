# Project Library Safe Cleanup Design

## Goal

Let a project owner remove test and empty projects from Kiikis project management without risking real screenplay, Universe, asset, task, publication, licensing, or collaboration data.

## Confirmed constraints

- No existing project is deleted automatically.
- Every action is limited to the authenticated owner.
- “Delete” must never claim success when no record was affected.
- Existing user projects and their content must remain intact.
- The current project-library card-and-table layout remains the primary UI.

## Current failure mode

The library currently renders records from four physical sources (`storyflow_projects`, production, art, and adaptation). Its deletion endpoint directly deletes a row from the selected source. It does not request or validate the deleted row count, and it has no dependency preflight or recovery state. In addition, the primary-project listing uses a service-role query without filtering `deleted_at`, so a future soft-deleted project could still be rendered.

## Chosen design

### 1. Project lifecycle

Add three owner-visible states:

- Active: normal project-library record.
- Archived: hidden from the default library; recoverable by its owner.
- Permanently deleted: only available for a preflight-confirmed empty project.

The primary `storyflow_projects` source uses the existing `deleted_at` field for archive state. Child-source records remain active unless explicitly deleted; the first release does not invent a cross-table archive schema for them.

### 2. Safe-delete preflight

Before a permanent delete request, the server returns a preflight result with:

- source identity and owner match;
- project title and timestamps;
- meaningful-content flags (three-part screenplay content, script body, or source-specific output);
- related-work counts where the source has a primary project identity;
- a decision: `safe_to_delete`, `archive_only`, or `not_found`.

Only `safe_to_delete` records expose the final permanent-delete confirmation. Any content or linked work changes the result to `archive_only`.

### 3. Deletion and archive APIs

- `PATCH /api/v2/project-library`: archive or restore an owned primary project.
- `POST /api/v2/project-library/preflight-delete`: inspect one owned record without mutation.
- `DELETE /api/v2/project-library`: require the preflight token/identity, request returned rows, and reject a zero-row result. It permanently deletes only an empty primary record or an empty child record that has no meaningful output.

The server returns a normalized error instead of masking database failures as generic success.

### 4. Project-management UI

Move destructive actions under each card’s “更多” menu:

- `置顶` and `分享` remain available there when those capabilities are connected.
- `归档` is the ordinary cleanup action.
- `永久删除` appears only after preflight marks the record safe.
- A separate archived filter exposes `恢复`.

The one-time cleanup flow is a read-only candidate list first. It shows title, source, last edit time, content/relationship counts, and recommended action. The user chooses exact records before any archive or deletion request is sent.

### 5. Production safety

The candidate list is owner-scoped. It never selects by project title alone and never touches another creator’s project. No database cleanup job runs in the background. Production cleanup is a two-step human-confirmed operation.

## Test plan

1. Server tests: owner filtering, `deleted_at` exclusion, zero-row deletion failure, empty primary project preflight, content-bearing project archive-only result, and archive/restore behavior.
2. UI tests: more-menu actions, permanent delete hidden before preflight, archive/restore visibility, and a candidate list with no automatic mutation.
3. Regression checks: existing library filters, project routing, TypeScript, focused server/UI suites, and production build.

## Non-goals

- This change does not clean any production row by itself.
- This change does not change screenplay content, Universe models, licensing, evidence, or project-workbench routing.
- This change does not permanently delete nonempty projects.
