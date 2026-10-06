# Desktop Buddy 0.18.0

This Windows update keeps the Goals / Today workflow and adds AI assistance, a persistent Buddy conversation and consent-based tracking support.

- Analyze goals with Nebius. When research is useful and web access is enabled, Tavily provides sourced prerequisites and resources. Suggested changes require your confirmation.
- Keep one shared Buddy conversation across sessions and goals, including text/PDF attachments and editable voice input.
- Preserve tracking consent and pause choices when switching goals. View observed activity separately from the manual focus timer.
- Receive bounded midday help for overdue goals or measured overruns against your own time estimates.
- Choose an installed Windows speech language for local voice imports. Russian recognition requires an installed Russian speech recognizer; paste and retry remain available.

AI, context sharing and web search are off by default. Configure a Nebius key in Settings for AI assistance, and a Tavily key for optional web research. Provider keys stay in the local Windows credential vault.

## Installation and updates

Download `Desktop.Buddy_0.18.0_x64-setup.exe`, or use the application's update flow. Version 0.17.1 already trusts the `developer2` signing key used for this update. Older installations continue through the unchanged signed compatibility releases (0.13.0 and 0.17.1, as applicable) before reaching 0.18.0. Existing goals and settings are retained.

The release contains the installer, its updater signature, three compatibility manifests and `SHA256SUMS.txt`. Signing was performed locally; the private signing key is not included in the release.

## Verification

66 frontend tests, 134 Rust tests and six update/signing tests passed; one optional credential-vault integration test was skipped. The production build and signed Windows x64 NSIS packaging passed. The actual installer signature was verified against trust epoch 2.

Live Nebius/Tavily response quality, Russian/mixed microphone recognition and installation through an existing user's updater still require real-environment verification. See [the setup guide](https://github.com/ArtmarketVM/desktop_buddy/blob/v0.18.0/docs/AI_BUDDY_TAVILY_TRACKING.md) for provider and speech setup.
