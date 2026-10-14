# sumi 0.29.0

This synchronized release supports Windows x64 and Apple Silicon macOS 14.5+. It preserves the existing updater trust and reviewed internal macOS signing identity.

## Reliable agent actions

- Structured planning is constrained by the requested operation and read-only intent. Rust still validates IDs, scope, state versions, privacy and confirmation before execution.
- Mutations use backend-owned instruction provenance for recognized requests. Goal and step targets have mutually exclusive JSON Schema alternatives.
- Action receipts and grounded read results are rendered from Rust results, without a second model call that could falsely report an action succeeded.
- Strict Nemotron JSON requests disable thinking and use an appropriate output budget; redundant registry schemas are removed from planner input.
- Search consent is owned by the backend preview. Research instructions distinguish source-supported requirements from optional configuration.

## AI Monitor

Open **Settings → AI Monitor** for a live, bounded event journal: observed context changes, queued events, inference, decisions, proposals, verified skills and rejection categories. Local refresh runs every five seconds while the panel is open and visible. It sends no inference requests.

Model metadata, response finish reason, token counts, latency, selected goal/step and suppression reasons distinguish configuration, connectivity and actual inference. The journal does not contain raw model reasoning, prompts, API keys or Accessibility text.

A manually requested isolated check exercises nine real AI commands using synthetic goals in an in-memory database, without changing personal goals or chats. It stops on failure and has a three-minute limit. Provider charges may apply. Safe inference health checks remain separate and manual.

## Window activity and Progress

- Local foreground-window/tab sessions are recorded while tracking is enabled, including when no goal is selected.
- Progress adds observed app time and a recent-window history for the selected period. Observation is kept separate from relevant goal time and confirmed completions.
- Existing Windows and macOS collectors provide window identity, bounded titles and optional sanitized domains. Private/excluded contexts, tracking-off periods and sleep gaps are omitted. History retention and clear-history controls cover the new table.
- Collection is sampled every three seconds. Brief switches between samples and background windows are not claimed as observed. The list shows the latest 500 sessions; app/time totals cover the full selected period.

## Today focus and queue

Today separates **In focus**, **Later today** and completed goals. Focus now selects one goal explicitly; opening a goal's details no longer changes focus. The focused goal moves first, remaining goals can be reordered by drag or keyboard, and the next goal follows the saved queue.

## Validation

Frontend, Rust, TypeScript, production build and release checks are required before publication. Live-provider checks and native installer validation are recorded separately from mocked contracts. Model/provider outages and ambiguous requests can still require clarification; elapsed time never completes a goal automatically.

Live verification on Apple Silicon passed all nine action checks against Nebius using `nvidia/nemotron-3-super-120b-a12b` (provider-reported metadata), including literal rename, completion and read-only remaining work. No personal database was used. Native Windows GUI, physical microphone transcription and real screen completion evidence are separate manual checks.
