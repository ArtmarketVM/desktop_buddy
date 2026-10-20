# Desktop Buddy 0.37.0

## Gentle overdue goal check-ins

The desktop character can now ask about an unfinished goal after its deadline, including goals carried over from earlier days:

> “Prepare the demo” is past its deadline. Finished, or do it today?

- **Mark complete** confirms completion of that goal and its steps.
- **Do today** puts it on Today and moves its deadline to the end of the current local day, without changing the current focus.
- **Not now** leaves the goal unchanged.

Reminders respect existing quiet hours, working hours, pauses, attention/privacy rules, notification cooldowns and daily limits. Their history survives restart, so the same goal/deadline is not offered repeatedly on the same day. Changed or expired suggestions cannot modify a stale goal. Deadline checks are local and require no additional AI request.

## Agent reliability

- Research synthesis selects verified, backend-owned source excerpts instead of relying on the model to reproduce exact quotations. Invalid source and excerpt indices are rejected.
- Repair instructions remain specific to the failed operation.
- Slow optional response wording/review after a committed action falls back to the verified action receipt.
- macOS speech errors better distinguish Dictation configuration, unavailable on-device language assets, permissions and unclear speech. Recognition still requires working local speech support; this does not guarantee Russian recognition on every Mac.
- Add an isolated real-provider hero rehearsal and a native demo runbook for developers.

## Platforms

One synchronized release for Windows x64 and Apple Silicon Macs running macOS 14.5 or later. macOS uses the existing internal signing identity; it is not Apple Developer ID signing or notarization. No Intel Mac installer is provided.

No provider key migration, signing-key change, or database migration is required.
