# Art Workbench Assistant Collapse Design

## Goal

Make the KK Art Assistant collapsible on desktop while preserving the existing 38:62 assistant-to-repository split whenever it is expanded.

## Scope

- Add a local collapsed state to `ArtWorkbench`.
- Add an accessible toggle in the assistant header.
- Keep the expanded desktop workspace at exactly 38fr / 62fr, including the intermediate desktop breakpoint.
- Collapse the assistant to a 48px rail that retains the KK icon and an expand control.
- Keep the existing mobile layout unchanged: at 760px and below the panels stack vertically.

## Out of scope

- Changes to asset-card density, image aspect ratios, global navigation, data loading, or assistant chat behavior.
- Persisting the collapse preference.

## Interaction

The workspace starts expanded. The toggle sets `aria-expanded` and an accessible label appropriate to the next action. In collapsed mode, all assistant content except the icon/control is hidden from layout and the repository occupies the remaining width.

## Layout rules

| Viewport | Expanded | Collapsed |
| --- | --- | --- |
| Above 760px | `38fr 62fr` | `48px minmax(0, 1fr)` |
| 760px or below | Existing vertical stack | Existing vertical stack |

## Verification

- A focused Node test verifies the exported layout-state helper for expanded and collapsed class names and accessibility values.
- Run that test, then `npm run build` to type-check and compile the page.

## Review

The scope is intentionally limited to the assistant collapse interaction and the required desktop ratio; no unrelated visual restyling is included.
