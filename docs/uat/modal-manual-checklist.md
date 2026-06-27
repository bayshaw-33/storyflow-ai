# PRD-001 Modal Manual UAT Checklist

## Scope

Manual validation for the adaptive workspace modal entry. No Vitest, Puppeteer, Radix, Tailwind, or external toast dependency is used.

## Desktop

- Open `/`.
- Click the hero primary CTA.
- If signed in, verify the workspace modal opens in under 500 ms.
- Verify the large idea input is visible in the upper modal area.
- Verify five workflow cards render: Novel, Script, Storyboard, Video, OST.
- Click Novel and verify navigation to `/novel-workbench?new=1`.
- Reopen the modal and click Script; verify navigation to `/projects/demo?template=demo`.
- Reopen the modal and click OST; verify navigation to `/song-workbench`.
- Reopen the modal and click Storyboard; verify there is no navigation.
- Reopen the modal and click Video; verify there is no navigation.
- Hover Storyboard and Video; verify the tooltip/title reads `Coming in Phase 0 Q2`.
- Press `Esc`; verify the modal closes.
- Click outside the modal; verify the modal closes.
- Tab through controls; verify focus stays inside the modal while open.

## Logged-Out Flow

- Sign out.
- Open `/`.
- Click the hero primary CTA.
- Verify the auth modal opens.
- Complete sign in.
- Verify the workspace modal opens after auth state updates.
- In DevTools, verify `sessionStorage.postLoginAction` is cleared after the workspace modal opens.

## Responsive

- Width below `768px`: verify the modal is full screen.
- Width `768px` to `1024px`: verify compact layout with compressed card spacing.
- Width above `1024px`: verify standard centered modal layout.

## Visual Hierarchy

- Verify Script, Storyboard, and Video read as the three core workflow cards.
- Verify Novel and OST read as secondary/extended workflow cards.
- Verify Coming Soon cards are opacity-reduced, grayscale, dashed, and not navigable.
