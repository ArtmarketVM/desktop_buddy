# Desktop Buddy 0.35.0

- New look: white, ink, lime and violet on a pixel grid. Instrument Sans everywhere, Silkscreen only for small captions; pixel sidebar icons; a pixel app icon.
- sumi, the mascot, is now a pixel frame animation with six states: working, listening, thinking, done, resting and stretching. The companion colour is picked with filled chips; the mascot is also the sidebar mark and stays visible when the sidebar is collapsed.
- Sidebar: Today, My progress, All goals, Chats; AI service dots under the pages; utilities as an icon row; hover labels; the profile name with a pixel head and the Settings gear beside it. The collapsed sidebar stacks every control.
- Progress: an ink focus tile, one block per goal in the chart, a flush warning callout, squared pager; Tracked activity moved to Settings · Privacy as an activity log with a goal filter.
- Today: finished goals show a violet square; the day summary is a plain stats row; goal rows match the Goals page spacing.
- Chats: deleting a chat is instant with an Undo toast, like deleting a goal; Cmd+Z (Ctrl+Z) undoes the newest undoable action while its toast shows.
- Settings has five tabs. General: the sumi block plus two cards (On your desktop, Nudges). AI: provider rows with the real check state, Test / Replace key / Remove, the model shown inside the Nebius row, two AI switches and a Memory card with hinted switches and per-goal forgetting. Privacy: one Tracking card (switch, status, Accessibility access, working days and hours, keep history, Clear all local history) and a plain-language sentence about what sumi knows and sends, with buttons for the activity log, what sumi remembers, raw data and the privacy policy. About: version, Check for updates, Diagnostics (tracking status and the Personal AI Engine panel). Memory selection diagnostics is removed.
- Square pixel switches, squared buttons and chips, pixel-style scrollbars throughout.
- A privacy policy page is published from `docs/privacy.html` and linked from Settings · Privacy.

One coordinated update for Windows x64 and Apple Silicon macOS 14.5+. Saved preferences, keys, goals and memory are preserved; the two AI switches that left the UI (goals in chat, web research) keep their stored values and default on. The reviewed macOS app identity, immutable credential helper and trusted updater signers are unchanged. Internal signing does not provide Apple notarization.
