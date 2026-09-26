# Desktop Buddy

A Windows-first, local-first focus companion. Set an intention, see your foreground activity, and optionally let NVIDIA Nemotron on Nebius offer a gentle check-in. Tavily provides on-demand web search when you need help.

## Quick start

Requirements: Windows 10/11, Node.js 22+ (24 recommended), Rust stable with the MSVC target, Visual Studio C++ Build Tools with a Windows SDK, and Microsoft Edge WebView2. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```powershell
git clone https://github.com/ArtmarketVM/desktop_buddy.git
cd desktop_buddy
npm ci
Copy-Item .env.example .env
# Edit .env locally to add your runtime API credentials.
npm run tauri dev
```

If Rust was installed in this checkout's ignored `.tools` directory, use `./scripts/dev.ps1` to activate it for this process. The helper also discovers Visual Studio's C++ environment. Use `./scripts/dev.ps1 -Task test` for checks or `./scripts/dev.ps1 -Task build` for the installer. No global PATH changes are required.

For the UI-only browser preview, run `npm run dev`. Desktop actions are intentionally disabled outside Tauri.

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

1. Starting a goal enables the Windows collector. Tracking is off at application startup, even when a saved goal exists.
2. Rust polls the foreground process, title, and idle time every three seconds. Contiguous activity is aggregated into SQLite segments; idle periods do not count toward active time.
3. AI check-ins are off by default. Enabling them permits sending the goal and up to ten recent segments to Nebius. Titles are limited to 160 characters. Automatic checks run at most once per minute (20 seconds with simulated activity).
4. A validated model decision is stored locally. High-confidence interventions or offers of help may show a separate, always-on-top Buddy window. Do not disturb suppresses popups; dismissing or marking activity related starts a ten-minute nudge cooldown.
5. Manual search sends the typed query to Tavily. Optional **Proactive suggestions** separately permits sending the goal and up to five recent window titles to Nebius to generate a search query, then sending that query to Tavily. The first unseen search result is offered as a resource; it is not an independently verified recommendation. No URLs are invented by the model. Requests run at most once per 15 minutes per app run, starting after activity is available, and stop while paused, idle, or in DND. Mock AI mode disables this real-provider feature.

## Desktop companion (0.2.0)

- In Settings, **Show Buddy only with suggestions** defaults to checked. Uncheck it to keep a small animated character visible during tracking. Drag the character to position it on a monitor. Position is retained during the current run, not across restarts.
- Suggestions and focus nudges expand the transparent, always-on-top window into a card for 45 seconds. Dismiss returns to the selected mode. Pause and DND hide both modes. The app does not request keyboard focus when showing a suggestion; **Workspace** explicitly returns to the main window.
- Enable **Proactive suggestions** and configure both Nebius and Tavily to receive resource links. This consent and the display preference persist locally. AI check-in consent remains separate and resets at startup. Tracking always starts paused. Generated queries may still contain sensitive context; model instructions to omit private details are not a guaranteed redaction filter.
- Minimize the main window to keep Buddy running. Closing it exits the application. Links open only after clicking **Open resource**. Previously offered URLs are recorded per goal in SQLite to avoid exact repeats, ignoring URL fragments.
- Animation is CSS-based and honors reduced-motion preferences. Exclusive fullscreen applications and secure Windows desktops are not supported overlay targets.
- Each delivered installer must receive a new version. Patch bumps cover fixes; minor bumps cover features. The build checks that npm, Cargo, lockfiles and Tauri versions match; the UI reads the native package version.

The model sees titles, not page content. Window titles may contain sensitive text; review this before enabling AI. Ambiguous activity should not be treated as certain distraction. Failed AI requests leave local tracking available and show an error instead of fabricating a decision.

## Architecture

```text
React UI -> Tauri commands -> Rust application state
                              |-- Windows collector -> SQLite
                              |-- Nebius -> validated focus decision -> Buddy window
                              |-- Tavily -> normalized search results
```

`src/components` contains GoalInput, ActivityTimeline, and DesktopBuddy. `src/api/tauri.ts` is the typed bridge. `src-tauri/src` contains commands, the Buddy scheduler/window controller, collector adapters, storage, models, and HTTP integrations. SQLite lives in the per-user application data directory under `com.artmarketvm.desktopbuddy/buddy.db` (on Windows, normally `%APPDATA%`). Goals, activity segments, decisions, feedback, Buddy preferences, and offered URLs persist across restarts. AI check-in consent, tracking, and DND reset on restart.

Simulated activity uses a separate `buddy-demo.db` database so rehearsal data cannot mix with live activity. SQLite is local but not encrypted. This MVP does not automatically delete historical data. To remove it, close the app and delete its `buddy.db`, `buddy.db-wal`, and `buddy.db-shm` files (or the corresponding `buddy-demo` files). No screenshots are captured. Screenshot and UI Automation extension points are explicit stubs; no macOS/Linux collector is implemented.

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

Version 0.2.0 includes a focus dashboard, secure provider-key settings, a draggable animated desktop companion, and opt-in resource suggestions. There is no tray/autostart integration, server-side account system, encrypted activity database, automatic retention policy, or screenshot analysis. Closing the main application exits tracking.

See [the changelog](CHANGELOG.md) for milestones and [contribution conventions](CONTRIBUTING.md) for commits and release versioning.
