# Desktop Buddy 0.49.1

- Windows snapshots capture the active window's own surface even when the companion or another window overlaps it, without including the covering window's pixels.
- Connected AI service indicators use the original lime palette again; errors remain red and pending checks remain gray.
- Capture failures report specific safe diagnostic categories for permission, unsupported capture, graphics device, protected window and worker failures. Failed capture cannot leave the status at `capturing`.
- The 20-second observation cadence and existing consent, foreground, session and evidence-retention checks remain in place.

Windows window-specific capture requires Windows 10 version 1903 or newer. Windows may display its capture border during a snapshot. Goal completion still depends on sufficient observable evidence.

This patch does not change goal-observation reasoning, completion criteria or task extraction from messages.
