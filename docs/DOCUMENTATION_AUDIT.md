# Documentation audit — 29 October 2026

## Source and scope

Fetched `origin` before edits. The clean starting branch and `origin/main` both matched `54fa6074337982bf898b79937a0a5cebb3c7cd35`; public release was **v0.49.4**. Inspected all 149 initially tracked Markdown files for inventory/links/diagram sources, then checked current guidance against implementation entry points. This is a documentation/source audit, not a new live-provider, microphone, installed-app or cross-platform execution audit.

The three initially tracked READMEs were the root product guide, browser extension and immutable credential helper. Two initially tracked Mermaid diagram sources were the root README and the historical Phase 10 report. No standalone tracked Mermaid source was found. Older release notes and dated validation evidence retain their original scope; historical design HTML/GIFs are not the current UI.

## Findings and corrections

| Finding | Current source | Correction |
| --- | --- | --- |
| Root/setup/demo guides still described Apple Speech/Windows installed recognizers and Dictation setup | `local_voice.rs`, `core_import.rs`, Cargo whisper dependency, LOCAL_VOICE.md | Document shared local Whisper, first-use verified weights, CMake build requirement and microphone-only input path |
| macOS guides mixed Apple Silicon-only policy with Intel/universal commands, ad-hoc releases and missing Mac updater publication | `scripts/build-macos.sh`, `release.yml`, signing/compatibility manifests | Replace contradictory setup with reviewed internal signing and coordinated Apple Silicon/Windows publication |
| CONTRIBUTING claimed a tag-triggered Windows-only release; UPDATES linked removed build-windows.yml | Current automatic CI and dispatched release workflows | Correct triggers, both-platform gates, immutable versions and proof reuse |
| Deadline docs/root summary advertised obsolete completion/reschedule buttons, OS banners and former presentation quotas | `companion/deadlines.rs`, engine/queue, InterventionCard.tsx | Describe three phases and I’m on it / Reschedule / Chat, no native notifications, five-minute freshness and durable phase deduplication |
| README conflated personal model overrides with Built-in AI routing | `http.rs`, `shared_ai.rs`, gateway handler | Scope environment overrides to the personal connection; describe automatic server routing separately |
| Contact/feedback documents claimed no Supabase project and a removed endpoint settings field | FeedbackCard.tsx, contact.rs, core Settings, shared_ai.rs | Separate actual email-draft UI, unused star-rating/subscription UI contracts, optional backend contact template and deployed AI gateway; do not invent contact deployment |
| Current guides still mentioned working-hour delivery gates | Companion preferences, mascot policy | Document quiet hours/days, pause and context suppression; legacy working-hours fields are not the mascot schedule |
| Notification/review docs said not released despite delivered versions | Current source and release history | Replace stale candidate headers while preserving dated validation limits |
| Branding asserted every extension label had changed; layout doc called attention dots violet | Actual extension sources and compact.css | Record remaining legacy menu/email wording and actual lime/red/grey dot rules without changing UI code |
| Old artwork prompts prescribed unrelated characters/colors | Avatar/ProfileFields and branding rules | Label art exploration historical and state shipped Lime/Violet/Cloud presets |
| Milestone reports were easy to mistake for current instructions | Versioned file contents and phase/report diagrams | Add historical scope notices; create current guide/history indices and a current two-diagram architecture reference |

## GitHub page findings

The public repository About description, homepage and topic list were empty when read through GitHub's API. This audit does not change repository settings. Suggested description for an owner-approved update:

> sumi is a local-first AI desktop companion for goals, contextual memory and gentle work support, powered by Nebius and NVIDIA models.

At the original audit, a download landing page had only been discussed. Follow-up on 30 October: [the public landing page](https://artmarketvm.github.io/desktop_buddy/) is published from the dedicated `gh-pages` branch; its video, latest-release downloads and maintenance are documented in [LANDING_PAGE.md](LANDING_PAGE.md). GitHub Releases remains the installer host. Do not put provider keys, tokens or private account details into About/README.

## Validation and boundaries

Validation: 154 Markdown files have no broken local Markdown links or unbalanced fenced blocks. All four Mermaid blocks parse with Mermaid 11.12.2 (syntax validation, not screenshot rendering). Current setup/release commands and source links were checked against the checkout. The privacy-source check passes; the public policy returns HTTP 200, matches the local policy and has no external fonts. Git diff whitespace checks pass. A final fetch still shows 0/0 against origin/main, and public release 0.49.4 has uploaded Apple Silicon DMG and Windows x64 EXE assets. See SESSION_HANDOFF.md for commands/results and the source boundary. Application source, dependency manifests, versions, approved screenshots, signing identities, service configuration and installer assets are unchanged. Documentation-only work does not require recompiling Rust or rebuilding installers.

Some old reports reference ignored local logs that are no longer present in this checkout; they are historical evidence paths, not downloadable artifacts or commands for judges. Historical results have not been re-run or upgraded into current claims.

Remaining product limits are preserved: foreground best-effort capture, model uncertainty/timeouts, unavailable/transient text or pixels, OS permissions and suppressed presentation can all prevent a suggestion. No universal arbitrary-goal completion guarantee is introduced. Contact deployment, model accuracy, physical native acceptance and future planned reliability work need their own checks.
