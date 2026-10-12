# Desktop Buddy 0.25.0

Desktop Buddy stays visible when its desktop setting is enabled, even while the main workspace is open or brought into focus. Opening the full app and reopening a running instance no longer hide the companion. Its window is restored if its actual visibility differs from its cached state.

- Explicit hide, snooze and full-screen preferences are preserved. Manually opened Buddy chat remains available in full-screen apps.
- Settings → Privacy contains a compact activity status. Expand Tracking details for the current goal, unfinished step, confirmed step count, last successful activity sample and automatic progress-check status. Today remains focused on tasks without an added status panel.
- Collection status reflects a real successful collector sample. Paused, blocked, stale and awaiting-match states do not claim that goal work is being recorded.
- Settings → General shows the companion's display state and offers Reset Buddy position.
- The expanded sidebar is narrower: 192 px, or 184 px in smaller desktop windows. Its stable 44 × 44 toggle has a visible background and Hide / Menu labels.
- Asking Buddy about a goal now opens the goal-specific compact input in the native app. Native companion chat receives keyboard focus.

Local tracking still requires the operating system's permission. AI checks require the configured provider and explicit consent; proposed completions always require confirmation. No new data destinations or automatic completion permissions are introduced.

The same version is delivered for Windows and macOS, including Apple Silicon with macOS 14.5 or later. Update trust and signing keys are unchanged.

## Validation

Frontend tests and production build; Rust backend tests with synthetic local HTTP servers; release manifest and signature tests. UI checks cover compact settings diagnostics, disclosure, active/blocked/paused/stale states, both themes, narrow desktop widths and the stationary sidebar toggle. CI validates Windows and macOS before the coordinated signed release is published.
