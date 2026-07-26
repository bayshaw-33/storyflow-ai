# AI Chat Focus Mode

## Goal

Let creators enter a distraction-free, full-viewport conversation with Kiikis AI from any creation workbench that already has an AI chat panel.

## User experience

- Each supported chat header receives a clearly labelled focus toggle with an accessible label.
- Activating it keeps the current route, conversation, draft input, and in-flight AI response intact while presenting the chat above the rest of the workbench.
- The focused surface shows the workbench name and the existing current-stage context, gives the message thread the available height, and keeps the composer anchored at the bottom.
- Creators leave focus mode with the same button or `Escape` and return to the precise prior workbench state.
- On narrow screens, focus mode uses the full screen and preserves device safe-area spacing.

## Scope

The shared behavior will cover the novel, song, storyboard, video, production-art, and viral/remake workbenches where an AI conversation is present. It does not change AI request payloads, project persistence, navigation, billing, or non-chat panels.

## Implementation approach

Use a small reusable client component or hook to own the focus state, `Escape` handling, document-scroll locking, and accessible toggle semantics. Each existing workbench retains ownership of its message list and composer, so moving into focus mode does not remount or duplicate chat state. A shared CSS treatment provides the fixed overlay, readable max-width, responsive sizing, and reduced-motion-safe transition.

## Error handling and accessibility

- Focus mode is always reversible, including while a request is running.
- It does not clear or submit an unfinished draft.
- The toggle exposes its current state with `aria-pressed`; the focused container is labelled by its existing chat heading.
- Escape only exits focus mode when it is active.

## Verification

1. Automated tests prove the state toggles, Escape closes only an active focus mode, and cleanup restores document scroll behavior.
2. Type checking and the production build pass.
3. Manual browser verification confirms a creator can open, type in, close, and reopen focus mode without losing chat content, on desktop and a narrow viewport.
4. Deploy the validated main-branch commit to production and confirm the production bundle contains the feature.
