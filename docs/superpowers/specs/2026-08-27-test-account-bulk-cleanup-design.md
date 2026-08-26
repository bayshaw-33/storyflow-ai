# Test Account Bulk Project Cleanup Design

## Goal

Let the internal test account `bayshaw33@gmail.com` select many empty test projects and remove them with one confirmation. The feature must not change cleanup behavior for any other account.

## Confirmed scope

- The cleanup entry is visible only to `bayshaw33@gmail.com`.
- The user selects exact project cards; there is no automatic cleanup.
- One batch uses one confirmation dialog. There is no per-project preflight, typed title, or repeated confirmation.
- Selected projects may be deleted directly because this account uses them as disposable test data.
- Project-scoped Work rows, screenplay rows, generation records, assets, and links are cleaned with the selected project.
- A Universe linked to the selected projects is deleted only when it is owned by the same account, has no remaining project links, and contains no meaningful content.
- A shared or non-empty Universe is preserved; only the deleted project link disappears.

## Current problem

The existing safe-cleanup flow was designed for ordinary creators. It deliberately excludes batch actions and requires each project to pass a read-only preflight before a second permanent-delete confirmation. Any project with content or related records becomes archive-only. This is safe for real creator data but makes a test account with many disposable projects unnecessarily slow to clean.

## Chosen approach

Add a small, isolated test-account cleanup path instead of weakening the ordinary project lifecycle.

The UI sends all selected project identities in one request. The server authenticates the request, checks the exact account email, verifies ownership for every selected identity, and then deletes the owned test records by source. The response reports deleted and failed identities so the UI removes only confirmed successes.

This path intentionally avoids the ordinary single-project preflight. It is not a general-purpose deep-delete system and is not exposed to other users.

## User experience

### Entry and selection

- Add `清理测试项目` to the project-management toolbar only for the allowed account.
- Clicking it switches the project grid into selection mode.
- Every visible card receives a checkbox; the card itself no longer navigates while selection mode is active.
- Provide `全选当前结果`, `取消全选`, and `退出清理` controls.
- A sticky action bar shows `已选择 N 个项目` and a single `删除所选项目` button.
- Selection works in both active and archived views.

### Single confirmation

The confirmation dialog lists the selected count and warns that the action cannot be undone. It uses one cancel button and one red `确认删除 N 个项目` button. It does not require typing a title or confirming projects individually.

### Completion

- Successful projects disappear immediately from the current list and matching local-browser project records are removed.
- Failed projects remain selected and display one concise error summary.
- The result notice reports the number of deleted projects and any empty Universes removed with them.

## Authorization boundary

- Client visibility is convenience only. The server is authoritative.
- The server compares the normalized authenticated email with `bayshaw33@gmail.com`.
- A non-allowed account receives `404`, not a permission description that advertises the internal feature.
- Every database query also filters by the authenticated user ID. Email permission never replaces ownership checks.
- The request accepts at most 200 selected identities and rejects duplicates or malformed source IDs.

## API contract

Add `DELETE /api/v2/project-library/test-cleanup`.

Request:

```json
{
  "projects": [
    { "source": "project", "sourceId": "project-id" },
    { "source": "art", "sourceId": "art-project-uuid" }
  ]
}
```

Response:

```json
{
  "success": true,
  "deleted": [
    { "source": "project", "sourceId": "project-id" }
  ],
  "failed": [],
  "deletedUniverseIds": []
}
```

The route supports the four existing project-library sources: `project`, `production`, `art`, and `viral`.

## Deletion behavior

### Primary projects

For selected `storyflow_projects` rows owned by the account:

1. Read Universe IDs linked to the selected projects.
2. Remove project-scoped records that are not protected by project foreign-key cascades, including unified generation jobs, legacy generation records, versions, and project asset rows.
3. Delete the owned primary project rows and let existing `ON DELETE CASCADE` constraints remove empty Work and screenplay scaffolding.
4. Remove matching browser-local projects after the server confirms success.

The implementation must reuse the repository's established project-retirement dependency order where explicit cleanup is needed. It must not disable global database triggers or weaken evidence immutability for ordinary data.
If a supposedly empty test project contains immutable historical records, that project is returned in `failed` instead of bypassing the guard.

### Child-source projects

Selected production, art, and viral project rows are owner-filtered and deleted from their existing source tables. Their existing child-table cascade rules remain authoritative.

### Empty Universe cleanup

After successful project deletion, consider only Universes that were linked to those selected primary projects. Delete a candidate Universe only when all conditions are true:

- it is owned by the authenticated test account;
- no surviving project link references it;
- it has no Universe entities, canon facts, inbox proposals, relationships, actors, works, or Universe-scoped assets;
- it is not shared or published.

Otherwise preserve the Universe. Project-link cascades may still detach the removed test project.

### Storage objects

The selected projects are expected to be empty. If project asset rows contain known storage paths, collect those paths before deleting the rows and remove the corresponding objects after database deletion. Storage cleanup is reported separately and does not turn a confirmed database deletion into a false failure.

## Failure handling

- Zero affected rows means `not_found_or_forbidden`; it is never reported as deleted.
- The server returns exact per-project successes and failures because the four source tables cannot be deleted through one generic table operation.
- The client removes only entries returned in `deleted`.
- Empty-Universe checks run only for successfully deleted primary projects.
- A storage-object cleanup warning is visible in server logs and the response summary, while the deleted project remains deleted.

## Testing

1. Server authorization: allowed email succeeds; any other email receives `404`.
2. Ownership: selected rows owned by another user are never deleted or reported as successes.
3. Batch behavior: valid selections are grouped by source and returned as exact deleted identities.
4. Related cleanup: project-scoped non-FK rows are deleted before the primary row.
5. Universe rules: exclusive empty Universe is deleted; shared, non-empty, published, or foreign Universe is preserved.
6. UI gating: cleanup controls render only for the test account.
7. UI flow: multi-select, select-current-results, one confirmation, partial-result handling, and local-cache removal.
8. Regression: ordinary archive and safe-delete flows remain unchanged for all users.
9. Run focused project-library tests, TypeScript/build validation, and an authenticated browser acceptance on the test account before production release.

## Non-goals

- No batch cleanup for ordinary accounts.
- No automatic age-based deletion.
- No deletion by project title or loose test-name matching.
- No deletion of a non-empty or shared Universe.
- No redesign of the project cards outside selection-mode controls.
