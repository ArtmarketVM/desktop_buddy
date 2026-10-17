# Desktop Buddy 0.34.1

- Hiding the desktop character no longer disables check-ins or focus analysis. A check-in can appear without showing the character. Quiet mode, snooze, privacy, idle, fullscreen and meeting gates still apply.
- Meeting suppression requires foreground call evidence. Opening the Google Meet home page, Zoom Workplace home or Teams chat/calendar alone no longer suppresses check-ins. The shared rule is used by both macOS and Windows collectors. This remains a conservative window-context heuristic, not calendar integration or guaranteed call-membership detection.
- Stretch check-ins count adjacent observed active work instead of application uptime. Idle, media playback, excluded/private context and collection gaps reset this clock. Merely leaving Buddy open does not qualify.
- Background reasoning uses its own repair instructions and a schema that does not advertise explicit action execution. Malformed replies receive one bounded repair attempt; failures remain fail-closed and respect cooldowns.
- AI Monitor records specific safe failure categories for malformed reasoning, provider access/billing/quota, network failures and stale/cancelled requests. Provider bodies, secrets and private prompts are not logged.
- Check-ins use smaller speech bubbles with a subtle tail toward the character. The redundant “BUDDY · YOUR CHOICE” label is removed. Confirmation and research consent controls are preserved.
- An explicit `--check-agent-background` diagnostic runs real provider checks using synthetic in-memory goals without opening the user's database.

One coordinated update for Windows x64 and Apple Silicon macOS 14.5+. Existing saved consent and automatic goal-matching preferences are preserved. The reviewed macOS app identity, immutable credential helper and trusted updater signers are unchanged. Internal signing does not provide Apple notarization.
