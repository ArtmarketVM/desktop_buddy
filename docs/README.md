# Documentation index

Current reference: app **0.49.4**, source audit **29 October 2026**. The root [README](../README.md) is the product/setup entry point. Installation, source reproduction, architecture and dated test reports are different kinds of documentation.

## Current guides

| Document | Purpose |
| --- | --- |
| [JUDGES_START_HERE.md](JUDGES_START_HERE.md) | Ready-made installers and a short native testing path |
| [AI_ARCHITECTURE.md](AI_ARCHITECTURE.md) | Current components, provider routing and decision diagrams |
| [PERSONAL_AI_OBSERVATION.md](PERSONAL_AI_OBSERVATION.md) | Foreground text/images, goal matching, evidence and limits |
| [LOCAL_VOICE.md](LOCAL_VOICE.md) | Whisper weights, microphone input and optional transcript cleanup |
| [DAILY_ACTIVITY_REVIEW.md](DAILY_ACTIVITY_REVIEW.md) | Time attribution, encrypted evidence and summary cleanup |
| [MASCOT_NOTIFICATIONS.md](MASCOT_NOTIFICATIONS.md) | Character-only delivery, quiet schedules and queue priority |
| [DEADLINE_REMINDERS.md](DEADLINE_REMINDERS.md) | Current deadline phases and exact card actions |
| [SUPABASE_GATEWAY.md](SUPABASE_GATEWAY.md) | Built-in versus personal keys, server boundaries and quotas |
| [AI_SERVICE_AVAILABILITY.md](AI_SERVICE_AVAILABILITY.md) | Daily minimal authentication/model availability monitor |
| [FEEDBACK.md](FEEDBACK.md) | Current email-draft feedback, local usefulness feedback and unused rating API |
| [CONTACT_SERVICE.md](CONTACT_SERVICE.md) | Optional separate contact-service template and deployment boundary |
| [HACKATHON_DEMO_RUNBOOK.md](HACKATHON_DEMO_RUNBOOK.md) | Backend rehearsal versus the manual native demo |
| [DEMO.md](DEMO.md) | Evidence levels, preparation and current demo entry points |
| [ACCEPTANCE_AUTOMATION.md](ACCEPTANCE_AUTOMATION.md) | Acceptance runner commands and evidence interpretation |
| [ACCURACY_CHECKS.md](ACCURACY_CHECKS.md) | Opt-in fixture-based model matching/coaching evaluation |
| [MACOS.md](MACOS.md) | Current Apple Silicon setup, permissions, signing and packaging |
| [COMPACT_MACOS.md](COMPACT_MACOS.md) | Short pointer to the canonical macOS guide |
| [RELEASE_PROCESS.md](RELEASE_PROCESS.md) | Change-aware CI, proof reuse and coordinated release publication |
| [RELEASING_MACOS.md](RELEASING_MACOS.md) | Both-platform release secrets and independent signing boundaries |
| [TEAM_SIGNING.md](TEAM_SIGNING.md) | Optional Windows trust enrollment, not required contributor setup |
| [SECOND_SIGNER_QUICKSTART.md](SECOND_SIGNER_QUICKSTART.md) | Advanced owner-approved Windows updater signer procedure |
| [MACOS_PERMISSION_PERSISTENCE.md](MACOS_PERMISSION_PERSISTENCE.md) | Reviewed internal identity and bounded historical experiment |
| [QUALITY_GATES.md](QUALITY_GATES.md) | Current blocking gates followed by dated infrastructure evidence |
| [UI_LAYOUT.md](UI_LAYOUT.md) | Shared layout, palette, sidebar and transparent companion contract |
| [TYPOGRAPHY.md](TYPOGRAPHY.md) | Shipped reading sizes, font weights and approved exceptions |
| [BRANDING.md](BRANDING.md) | Current sumi names, mascot presets and compatibility exceptions |
| [SUMI_TONE_OF_VOICE.md](SUMI_TONE_OF_VOICE.md) | Grounded user-facing wording and button contract |
| [SESSION_HANDOFF.md](SESSION_HANDOFF.md) | Short current development handoff |
| [DOCUMENTATION_AUDIT.md](DOCUMENTATION_AUDIT.md) | This source audit, corrections, checks and remaining limits |

## Plans and remaining work

- [COMPLETION_RELIABILITY_PLAN.md](COMPLETION_RELIABILITY_PLAN.md): Remaining completion-detection work; a plan is not a delivered capability.

## Historical records and design artifacts

The [history index](HISTORY.md) lists milestone/validation reports and version-specific release notes. They are retained as evidence of what was implemented or tested at their recorded source, not as current installation commands or promises. The old Phase 10 architecture diagram is historical; use [AI_ARCHITECTURE.md](AI_ARCHITECTURE.md) for the current diagrams.

The [design exploration directory](../design-qa/README.md) and [0.10.0 design QA](../design-qa.md) are historical. Current visual baselines are governed by QUALITY_GATES.md, not those HTML prototypes. Delivered release assets and compatibility history must not be renamed or deleted as document cleanup.

## Other READMEs

- [Selected-text browser extension](../browser-extension/README.md): optional Windows intake and its actual legacy menu labels; it is not screen observation.
- [Immutable macOS credential helper](../src-tauri/native/credential-helper/README.md): security/maintenance boundary, not ordinary user setup.

When a historical report conflicts with a current guide, check the named source and current implementation. A green unit/CI/provider-health result does not establish a full native live workflow. No screenshot or diagram should be represented as evidence of an unperformed action.
