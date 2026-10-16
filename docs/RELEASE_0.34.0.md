# Desktop Buddy 0.34.0

- One typeface everywhere: Zen Maru Gothic for titles, the wordmark and all text; the serif is gone. Four sizes (34/18/14/11) and two weights, documented in docs/TYPOGRAPHY.md. Text is ink or muted; green marks only links and the selected option of a control.
- Dark theme "Paper at night": warm charcoal surfaces with green kept for the accent, tags and the mascot.
- Settings: no subtitle or repeated headings; quiet mode and snoozing live only in the sidebar; the Appearance tab is gone (the theme switch stays in the sidebar). Companion options are one line each and on by default; one "Remind me to move every 45 minutes" toggle drives both reminders. macOS-sized switches and tighter rows.
- Companion colour: "Choose the color of your companion" shows six animated states (working, listening, thinking, done with confetti, resting with a breathing mouth, stretching) and a Custom colour wheel; any colour is kept. Marks beside the mascot follow the theme text colour and are no longer clipped.
- Goals page: the field searches saved goals or adds a new one, like Today; rows match Today with no separators; Active and Archive page ten rows at a time with the shared Pager; Import sits on the heading line.
- Today: clicking the blank part of a row opens its steps; step ideas while typing continue the typed text and say when they are loading, empty or unavailable; the goal menu is left-aligned.
- Progress: Details is "Tracked activity" with ten-row pages and an empty state; the period controls are one height; the focused-time figure uses the heading size.
- Chats: heading level with the chat pane, plus button in the search field, plain title, flat composer icons, solid row menu, list items in ink.
- Local macOS test builds must be internally signed and versioned above the latest release (AGENTS.md); an ad-hoc build cannot read saved provider keys.

One coordinated release for Windows x64 and Apple Silicon macOS 14.5+. The internal macOS signing identity, the credential helper and the trusted updater signers are unchanged. Internal signing is not Apple Developer ID signing or notarization.
