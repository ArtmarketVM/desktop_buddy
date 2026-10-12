# Desktop Buddy 0.24.2

The sidebar toggle stays in the same position when opening or closing the sidebar. Navigation icons and footer controls also keep their positions, so the next click lands where expected.

- A 44 × 44 pixel button in the top-left header replaces the small, moving control below the brand.
- Sidebar width and workspace spacing animate together. Reduced-motion preferences disable this animation.
- Cmd + Backslash on macOS and Ctrl + Backslash on Windows toggle the sidebar. Enter and Space work on the focused button; focus stays on the control.
- The saved sidebar preference survives restarting the app. Narrow windows use the same explicit open/closed state as the button.
- Navigation, Updates, theme and profile controls remain available in the collapsed rail.

This coordinated release contains signed updates for Windows and macOS, including Apple Silicon with macOS 14.5 or later. Existing update signing keys and trust channels are unchanged.

## Validation

- Frontend tests, production build and release verification tests.
- Browser interaction checks: repeated clicks, keyboard activation, persistence after reload, light/dark themes, and 1280/760/650 pixel layouts.
- The toggle remains at (14, 16) with a 44 × 44 target, and the first navigation icon remains at (27.5, 113.5), in both states at the tested desktop sizes.
- The release workflow tests and builds Windows and macOS before publishing the shared version.

## Interaction references

- [Notion sidebar navigation](https://www.notion.com/help/navigate-with-the-sidebar): explicit sidebar controls and Cmd/Ctrl + Backslash.
- [ChatGPT sidebar update](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): sidebar transitions and persistent access to settings, described in the November 22, 2024 update.
- [WAI disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/): native button activation and accessible expanded state.
