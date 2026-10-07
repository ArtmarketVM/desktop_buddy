# Desktop Buddy

A local-first focus companion for Windows and macOS. Set an intention, see your foreground activity, and optionally let NVIDIA Nemotron on Nebius offer a gentle check-in. Tavily provides on-demand web search when you need help.

Version 0.20.0 adds three-step onboarding, a shared Today/desktop conversation, saved goal ordering, multiple AI-step acceptance, structured settings and quick Do Not Disturb. Nebius Token Factory can identify the active goal without a running timer after a separate opt-in. See [Daily UX and automatic goal matching](docs/UX_ONBOARDING_GOALS_SETTINGS.md), [Core experience](docs/CORE_EXPERIENCE.md) and [Companion MVP](docs/COMPANION_MVP.md). **Updates** checks real GitHub Releases; **Update available** appears for a newer signed Windows installer. Select **Update & restart** to download, verify and install it. See [Windows updates and local signing](UPDATES.md) and [design QA](design-qa.md).

## Role selection and workspace — 0.12.0

Nine illustrated role cards scroll continuously in either direction using arrows, the wheel or a touchpad. **Other** accepts a custom role, and any role can include up to 20 declared app names. These names describe a profile; they do not create tracking rules. Settings discovers installed Windows apps separately and lets you edit each app's category for the current goal.

The workspace includes Light/Dark themes, a separate profile menu, an automatically saved checklist, a desktop-companion visibility switch that preserves its workspace preview, and expanded **Share an idea** feedback. The companion stays available when tracking is paused and the workspace closes; its body stays still.

Optional role research shares only the entered email, role and declared apps with a configured private contact service after explicit consent and email confirmation. It does not subscribe the address to marketing. The backend template is prepared but **not deployed**; data stays local until a service is connected and sharing is requested. See [private service setup](docs/CONTACT_SERVICE.md), [developer handoff](docs/DEVELOPER_HANDOFF.md) and the [Russian update guide](docs/DEVELOPER_HANDOFF_RU.txt).

## macOS — 0.21.0

The shared app now includes macOS adapters and an Apple Silicon build with a minimum system version of 14.5. See [macOS installation, permissions and build instructions](docs/MACOS.md) and [validation results](docs/MACOS_VALIDATION.md). Windows remains in the same repository with its existing installer workflow.

```bash
npm ci
npm run build:macos
```

## Quick start

Requirements: Windows 10/11, Node.js 22.13+ or 24+ (required by PDF.js), Rust stable with the MSVC target, Visual Studio C++ Build Tools with a Windows SDK, and Microsoft Edge WebView2. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```powershell
git clone https://github.com/ArtmarketVM/desktop_buddy.git
cd desktop_buddy
npm ci
Copy-Item .env.example .env
# Edit .env locally to add your runtime API credentials.
npm run tauri dev
```

If Rust was installed in this checkout's ignored `.tools` directory, use `./scripts/dev.ps1` to activate it for this process. The helper also discovers Visual Studio's C++ environment. Use `./scripts/dev.ps1 -Task test` for checks or `./scripts/dev.ps1 -Task build` for a personal installer without a signing key. Official signed releases use `-Task release`; see [team signing](docs/TEAM_SIGNING.md). No global PATH changes are required.

For the UI-only browser preview, run `npm run dev`. Desktop actions are intentionally disabled outside Tauri.

## Onboarding and profile (0.9.0)

First launch starts with a companion (cat, dog, seal or bird and a color), then a professional role, name and required email, then your first goal. The profile screen includes a clearly marked draft privacy notice and an acknowledgement before identity is saved. Identity stays in the local SQLite database; no remote registration service is connected. The notice must be replaced with a reviewed final policy before public release.

Only after saving the goal does Buddy offer to enable activity tracking or continue paused. Windows foreground APIs have no separate OS permission dialog. The existing planner remains available afterward, including explicit Nebius refinement. Setup progress survives restarts; goal draft text is persisted with **Save goal draft**.

Open the **Settings gear** for profile, appearance/visibility, app rules, working hours, notification controls and startup. Eight professional roles supply starter process rules; Figma belongs to Design. Manual overrides and unclassified apps survive role changes for the current goal. Installed Windows builds enable sign-in startup by default after setup, launching in the tray with tracking paused; development/test builds never register for startup.

Settings and explicit goal completion offer 1–5 stars with optional text. Feedback is saved locally, subject to history retention/deletion, and is not sent to providers. Voice feedback is reserved for a future implementation. See [onboarding contracts, affected files and native QA](docs/ONBOARDING.md).

## Tracking update (0.8.0)

Chrome/Edge activity now includes a best-effort active-tab title and domain through Windows UI Automation; Firefox is supported when its address-bar accessibility ID is exposed. Only the hostname is retained, without URL paths/query strings/fragments. Unknown, edited or inaccessible address bars fall back to the foreground title. No browser extension or page-content inspection is required.

Settings → **Tracking and working hours** controls domain metadata, idle threshold and local working hours (09:00–18:00 by default). Automatic productivity cards and check-ins stay quiet outside hours and during confirmed system media playback. Default local state detection pauses after 5 minutes without input and marks an unchanged context as drifting after 3 minutes with at least 2 minutes without input. Local reminders remain opt-in.

The completed-goal history API exposes observed app/site/tab time, idle/drifting intervals, event counts and retained goal-specific recommendations. Old records are preserved without invented historical durations. See [tracking contracts, limitations, migrations and Windows QA](docs/TRACKING.md).

## Runtime configuration

| Variable          | Meaning                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------- |
| `NEBIUS_API_URL`  | Full HTTPS chat-completions endpoint, including `/v1/chat/completions`                  |
| `NEBIUS_API_KEY`  | Nebius runtime API key                                                                  |
| `NEBIUS_MODEL_ID` | Model ID available in your Nebius account; example: `nvidia/nemotron-3-super-120b-a12b` |
| `TAVILY_API_URL`  | Full HTTPS search endpoint, normally `https://api.tavily.com/search`                    |
| `TAVILY_API_KEY`  | Tavily runtime API key                                                                  |
| `DEMO_MODE`       | `true` simulates three activity segments; defaults to live Windows activity             |
| `AI_MOCK`         | `true` explicitly replaces Nebius with labeled demo decisions; defaults to real HTTP    |

For installed Windows apps, open **Settings** (or **Manage API keys**), enter a Nebius or Tavily API key, and select **Save key**. Changes apply immediately. Keys are stored per Windows account in Windows Credential Manager and are never returned to the frontend. Password inputs are cleared after saving or closing Settings. Keys are not embedded during builds, saved in SQLite, or logged. Saving does not enable AI consent or verify provider access; use a focus check or search to exercise the corresponding service.

Saved credentials override environment keys. **Remove saved key** removes only the Credential Manager entry, restoring any environment fallback; it does not revoke the provider credential or cancel in-flight requests. Development also reads `.env` from the project root; packaged builds support process environment variables as a developer fallback. `.env` is gitignored. Standard provider endpoints and the default Nebius model are built in; `NEBIUS_API_URL`, `NEBIUS_MODEL_ID`, and `TAVILY_API_URL` remain optional runtime overrides. Provider billing and model access belong to the user's account. A future iteration will replace bring-your-own-key setup with a server-backed service.

Endpoint references: [Nebius API](https://api.tokenfactory.nebius.com/docs), [Tavily Search](https://docs.tavily.com/documentation/api-reference/endpoint/search). Model availability depends on the account and must be verified with a real call.

## How it works

1. Onboarding asks for activity-tracking consent after saving the first goal. Starting later goals follows that choice. Tracking is off at application startup, even when a saved goal exists; use Resume tracking to start a session.
2. Rust polls the foreground process, title, and idle time every three seconds. Contiguous activity is aggregated into SQLite segments; idle periods do not count toward active time.
3. AI check-ins are off by default. Enabling them permits sending the goal and up to ten recent segments to Nebius. Titles are limited to 160 characters. Automatic checks run at most once per minute (20 seconds with simulated activity).
4. A validated model decision is stored locally. High-confidence interventions or offers of help may show a separate, always-on-top Buddy window. Do not disturb suppresses popups; dismissing or marking activity related starts a ten-minute nudge cooldown.
5. Manual search sends the typed query to Tavily. Optional **Proactive suggestions** separately permits sending the goal and up to five recent window titles to Nebius to generate a search query, then sending that query to Tavily. Nebius selects an unseen result using its title and snippet, or declines to recommend one; it does not independently verify the page. No URLs are invented by the model. Attempts default to 15-minute spacing, persisted across restarts, and are suppressed while paused, idle, snoozed, in DND, or in an excluded application. Meeting/fullscreen detection is heuristic. Mock AI mode disables this real-provider feature.

## App rules and daily activity (0.6.0)

Assign Work, Distraction or Neutral to a process in the current goal's app categories. Select Unclassified to remove the rule. Rules persist per goal and override automatic AI focus judgments for that process. A browser rule applies to all its tabs; no websites are blocked and no page content is inspected.

Enable **Local distraction reminders** in Settings to receive provider-free reminders after two active minutes in the same window of a distraction app. Default: off. All floating cards share a persisted daily limit (default 8; 0 disables cards) and minimum interval (default 15 minutes), including AI focus cards and resource recommendations. Snooze, DND, excluded apps, meetings, fullscreen and input-pause settings still apply. Limits are global across goals; the daily count resets by local date, but cooldown carries across midnight. Proactive resource recommendations remain a separate opt-in regardless of app category.

**Today** shows approximate observed foreground time across goals and for the current goal. Time is recorded only between valid samples while tracking, excluding detected idle periods, gaps, excluded apps and Buddy itself. Activity before this version is not backfilled. Saved checklist progress is shown separately: checking every step does not complete a goal. Daily totals follow retention/deletion, while active-goal rules and the card budget survive history deletion. The demo database remains separate and the UI labels simulated sessions.

## Goals and steps (0.5.0)

An active goal has an optional **Done when** criterion and up to 20 editable steps. Mark steps completed, reorder them with Up/Down, and choose one unfinished step with **Working on this**. **Save plan** persists the edits; unsaved edits do not change Buddy's AI context. Starting or resuming another goal is disabled while the editor has unsaved changes. Text fields are limited to 500 characters.

Starting a new goal defers the old one instead of claiming it is complete. **Continue later** defers the active goal. **Complete goal** requires explicit confirmation of the outcome, even if steps are still unchecked. Neither tracked time nor AI completes a goal automatically. Saved goals lists up to 100 entries, with deferred goals first; resuming one defers the currently active goal. Completion, deferral and resumption stop tracking; use Resume tracking when ready. Legacy completed statuses are preserved, including statuses created by the old automatic-completion behavior.

**Refine with AI** is an explicit one-off request sending the saved goal, criterion and full checklist to Nebius, without activity history. It does not enable automatic AI check-ins. Read the proposal, confirm checklist replacement, use it as an editable draft, then save it. Replacement resets step completion marks and the selected current step. **Keep original** discards the proposal. Mock AI mode returns clearly labeled demo suggestions without a provider call. Manual planning needs no provider key.

For consented focus checks and proactive recommendations, goal context now includes the completion criterion and current unfinished step, not the entire checklist. The local privacy preview uses the same minimized context. Automatic retention preserves active and deferred plans; explicit Clear local history removes completed and deferred goals with their plans but preserves the active plan. Existing activity and keys are not migrated or sent anywhere during upgrade.

## Privacy controls

Settings includes a local-only preview of the goal and minimized recent activity used for focus checks and proactive query planning. Generating this preview does not send a request. Query planning and resource selection both use up to ten rated titles and ten recently offered titles for the current goal; this memory appears in the preview. Resource selection additionally sends up to five search-result titles, URLs and snippets to Nebius. Tavily receives only the typed or generated query, not raw ratings or history.

### Recommendation quality (0.7.0)

Both stages prioritize the saved current unfinished step, then the completion criterion and goal. If no step is selected, Buddy supports the stated goal without inventing a step. Ratings guide the approach, while recent titles help avoid repetitive topics; a negative rating does not ban an entire domain. Buddy can skip the search or decline all candidates instead of offering a generic link. Every selected resource includes a concise **Try this** action, saved with the explanation in recommendation history.

Local URL deduplication ignores fragments and known marketing parameters while preserving functional query parameters and the original destination. It checks both retained per-goal history and the current batch; it does not resolve redirects or guarantee semantic uniqueness. History deletion/retention removes this memory too. Selection is based on titles/snippets, not a claim that Buddy has read or verified the full page. Existing snooze, daily card limits and consent controls are unchanged.

Exclude applications by executable name, such as `passwordmanager.exe`. Matching is case-insensitive. Excluded activity is not newly stored and existing matching records are filtered out of future AI context; previously saved records are not automatically deleted. Already transmitted requests cannot be recalled.

Retention is off by default. Choose 7, 30, or 90 days to delete old history immediately, at startup, and hourly while running. Confirmed **Clear local history** deletes recorded activity, decisions, feedback, recommendations and inactive goals, and pauses tracking. The active goal, settings and provider keys remain. This is logical database deletion, not forensic erasure; backups and provider-side records are unaffected.

Use **Test saved connection** to check the saved key (or environment fallback), not unsaved input. Nebius checks model-list access and whether the configured model is listed; Tavily checks usage access. Neither sends your goal/activity or performs generation/search. A successful check does not establish billing readiness or guarantee later inference/search success.

## Recommendation controls (0.4.0)

Settings offers automatic resource-search intervals of 5, 15, 30, or 60 minutes. These are minimum intervals between attempts, including failures; they do not change AI focus-check frequency or guarantee a suggestion.

The workspace shows the latest 100 retained recommendations across goals. Open a resource explicitly, mark it Helpful or Not helpful, or click the selected rating again to clear it. Ratings persist locally and may be included in future Nebius selection requests for the same goal when proactive suggestions are enabled. Retention and history deletion apply to this list too.

**Not now · 1 hour** on a floating card snoozes Buddy: it hides the character and suppresses automatic check-ins and recommendations while preserving tracking. The workspace displays the snooze end time and allows early resumption. Resuming does not disable DND or restart paused tracking. Manual searches and explicit focus checks remain available subject to their existing requirements.

## Desktop companion

- Click the character once for mini chat, quick tasks and AI help. Drag to move it; right-click for context actions. **Show on desktop** and the tray Show/Hide switch control visibility independently of tracking. Position is saved locally and restored within an available monitor's work area.
- Manual chat remains available when tracking or automatic suggestions are paused. Suggestions expand the always-on-top window without taking keyboard focus. The new task/completion confirmations require an explicit response and expire after two minutes; existing resource cards expire after 45 seconds.
- Enable **Proactive suggestions** and configure both Nebius and Tavily to receive resource links. This consent and the display preference persist locally. AI check-in consent remains separate and resets at startup. Tracking always starts paused. Generated queries may still contain sensitive context; model instructions to omit private details are not a guaranteed redaction filter.
- Closing the workspace hides it to the tray. Use the tray to reopen it, show/hide the companion, pause/resume tracking, open Settings or quit. Links open only after clicking **Open resource**. Previously offered URLs are recorded per goal in SQLite to avoid exact repeats, ignoring URL fragments.
- Animation is CSS-based and honors reduced-motion preferences. Exclusive fullscreen applications and secure Windows desktops are not supported overlay targets.
- Each delivered installer must receive a new version. Patch bumps cover fixes; minor bumps cover features. The build checks that npm, Cargo, lockfiles and Tauri versions match; the UI reads the native package version.

The existing focus model sees window titles. Separately opting in to **Suggest tasks from visible text** allows bounded accessible foreground text plus goal/checklist context to be sent to Nebius while tracking and AI check-ins are enabled. This feature starts disabled and never changes a task without confirmation. Window titles and visible documents may contain sensitive text; review the consent before enabling AI. See [Companion MVP](docs/COMPANION_MVP.md) for mini chat, Windows voice typing, selected text, suppression rules and the Developer 1 event contract.

## Architecture

```text
React UI -> Tauri commands -> Rust application state
                              |-- Windows/macOS collector -> SQLite
                              |-- Nebius -> validated focus decision -> Buddy window
                              |-- Tavily -> normalized search results
```

`src/components` contains GoalInput, ActivityTimeline, and DesktopBuddy. `src/api/tauri.ts` is the typed bridge. `src-tauri/src` contains commands, the Buddy scheduler/window controller, collector adapters, storage, models, and HTTP integrations. SQLite lives in the per-user application data directory under `com.artmarketvm.desktopbuddy/buddy.db` (on Windows, normally `%APPDATA%`). Goals, activity segments, decisions, feedback, Buddy preferences, and offered URLs persist across restarts. AI check-in consent, tracking, and DND reset on restart.

Simulated activity uses a separate `buddy-demo.db` database so rehearsal data cannot mix with live activity. SQLite is local but not encrypted. Use the privacy controls above for retention and history deletion. No screenshots are captured. Browser metadata uses a bounded Windows UI Automation adapter; macOS uses a bounded Accessibility collector; no Linux collector is implemented.

## Tests and builds

```powershell
npm test
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
npm run tauri -- build -- --locked
```

Rust tests cover duration aggregation, process parsing, SQLite, strict decision parsing, transient failures, and mocked Nebius/Tavily HTTP calls. Unit tests do not require API keys. The Windows workflow builds and uploads the executable and NSIS installer. A `v*` tag additionally creates a GitHub Release. Builds are unsigned; Windows may show a SmartScreen prompt.

## Demo

See [the manual checklist](docs/DEMO.md). A demo can simulate activity while making **real** Nebius and Tavily calls. Never present `AI_MOCK=true` as a live provider integration.

## Current scope

Version 0.9.0 adds resumable onboarding, local profiles, role app presets, companion appearances, Windows autostart and local product feedback, on top of the 0.8.0 tracking/history update. Resource selection ranks real search results with Nebius; this is not independent fact-checking. There is no app/site blocking, project hierarchy, deadline engine, streak system, server-side account system, encrypted activity database, automatic updater, signed installer, or screenshot analysis.

See [the changelog](CHANGELOG.md) for milestones and [contribution conventions](CONTRIBUTING.md) for commits and release versioning.
