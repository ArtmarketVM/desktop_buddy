# Desktop Buddy 0.32.0

## Sidebar and window controls

- Simplified sidebar hierarchy: Settings, Updates, Feedback, theme and Quiet mode sit above the supporting AI services section and the profile name. Removed redundant workspace labels and the profile avatar/caret.
- The plain sidebar icon now sits beside native window controls on macOS and beside the sumi brand on Windows. It stays fixed while the sidebar collapses. Cmd/Ctrl + backslash remains available.
- Quiet mode uses a soft accent fill and an explicit On/Off label. Browser preview toggles are interactive without changing installed-app preferences.
- Service labels and status indicators keep their vertical positions when the sidebar collapses.

## Shared goal and chat improvements

Includes the reviewed goal-workflow changes from a8c687f: planned goals with details, filtered search, scheduling, step reordering and selection, confirmed checklist restart, preserved-progress reopening, scoped single-edit undo, checkpoint updates and saved-research inspection. Research suggestions become unfinished steps only on explicit request.

Chat renders safe HTTP(S) source links and read-only Markdown checklists. Existing structured action validation, destructive confirmation, privacy checks and trusted updater channels are retained.

## Coaching foundation

Includes a3340dc's persistent, revision-checked coaching-session service and tiny-habits strategy. This is backend groundwork: coaching is not yet connected to the chat planner, UI, provider gateway or background notifications. It must not be described as an available interactive coaching feature. Its independent migration adds session/request tables and target revision tracking; it does not replace existing goals or history. Memory and deletion controls cover the new stored workflow data.

## Platforms and update safety

One coordinated release targets Windows x64 and Apple Silicon macOS 14.5+. Intel and universal Mac packages are not produced. The reviewed persistent internal Mac signing certificate, immutable credential helper and existing updater signing keys remain unchanged. Internal signing is not Apple Developer ID signing or notarization.

Use Updates to check for the new version and install it. Local goals, chats, preferences and provider credentials retain their storage paths. Both platform build/test and signed-asset verification gates must pass before publication. Automated checks do not establish perfect live model interpretation or installation/restart on every supported device.
