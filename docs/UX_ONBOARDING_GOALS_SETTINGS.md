# Daily UX and automatic goal matching — 0.20.0

## Onboarding and workspace

Setup has three steps: preferred name and optional local email, one of four Buddy characters, and optional activity tracking. It does not create a goal or require a timer. Email is kept in the local profile; entering it does not enroll the user in research, subscribe them, send it to AI, or enable email reports. After setup, a dismissible overview explains the menu, goals and Buddy for five seconds.

Today shows goals alongside a conversation. The header's Quick goal action opens Today and focuses its input from any workspace page. The existing limit of three Today goals remains: additional quick goals are saved in Goals. Goals can be renamed, have their steps and priority edited, completed, reopened, deferred or deleted during the day. Deletion has an explicit confirmation. Drag handles and up/down controls reorder goals; the global order is saved in SQLite preferences and reflected on Today and within each area on Goals. Reordering rejects a stale or incomplete goal list.

AI suggestions are separate proposals. Up to five suggested steps are shown; users can select and add several in one revisioned save. Accepting a step or batch removes accepted suggestions while preserving the remaining suggestions and selections. Steps can be added, edited, removed and checked. The focus timer remains optional and measures manual focus separately from observed activity.

Today and floating Buddy use the same persisted conversation. Each window refreshes local history and AI preferences every five seconds; polling preserves an unchanged history and does not force a reader back to the bottom. A failed send keeps the user's draft. The floating card can be dragged by its header, positioned independently of Buddy with arrow controls, and resized using its lower corner. The native window also supports resizing in chat mode. Card geometry and native chat window dimensions are saved and constrained to the available viewport. Dragging Buddy moves the native window.

## Settings and quiet controls

Settings sections are Profile, Buddy, Appearance, Activity & Privacy, Nudging, Startup, Integrations / AI and About. Section links open their corresponding section. Profile, avatar, startup, working hours and vision model drafts use Save preferences; tracking, theme, visibility, AI and nudging controls save when changed. Exclusion text entry is hidden in this workflow; existing exclusions continue to be respected. Local data retention and deletion remain available under Activity & Privacy. Feedback has its own navigation entry. Quit remains available in the system tray.

Today exposes Do not disturb. It pauses automatic notifications until switched off in the current app session while preserving chat and tracking. A separate one-hour pause uses the persisted Buddy snooze. Disable automatic nudging is a persistent companion preference; its cooldown and quiet-hour controls remain in Nudging. Workspace movement notes respect Do Not Disturb, snooze and the persistent pause. The default interface uses a muted green accent with light and dark themes.

## Nebius automatic goal attribution

Enable activity tracking, Allow Buddy AI assistance, and Let Nebius identify the active goal under Integrations / AI. No timer or manual goal selection is required. This is separate consent from chat goal-context sharing. Keys remain runtime-only; production calls use the existing real Nebius Token Factory endpoint and model configuration.

The collector samples the foreground context while tracking is enabled. Automatic matching waits for a stable eligible context for 15 seconds and starts at most one matching attempt per minute. The existing HTTP client may retry transient errors. It sends up to 20 open goal IDs/titles and their next three unfinished steps, prioritizing Today goals, plus the foreground app and the first 160 characters of its window title. It does not send profile/email, screenshots, browser URLs or entire pages. Window titles may contain sensitive information; the opt-in explains this sharing.

Only a supplied open goal ID with confidence at least 0.8 can receive activity. A switch of app/title, idle/excluded context, changed goals, paused tracking or revoked consent invalidates a pending result. Matches expire after a minute unless refreshed. Ambiguous responses, missing keys, provider errors and disabled AI leave activity unassigned; unassigned samples are transient and are not credited retrospectively. Matching switches the compatibility active goal for shared chat/coaching while preserving other open core goals. Manual timer measurements remain separate.

`DEMO_MODE` supplies simulated activity. `AI_MOCK` supplies mock provider output and does not call Nebius. Mock attribution conservatively leaves activity unassigned. The UI labels simulated activity and mock responses independently.

## Integration and scope

The agreed `GoalAIResult` and `GoalProgress` types are available through `src/ai/contracts.ts` and re-exported by the goal enhancement UI. `adaptGoalAIResult` maps suggested titles, steps and source reasons to the existing provider-independent goal enhancement UI. Existing real AI improvements/research continue through their current backend contract.

This milestone includes the automatic analysis, relevant progress, activity timeline and chat event updates delivered on main in 0.19.0. Cached automatic suggestions and manually requested suggestions share one view, with Add selected steps and Add all steps. Existing AI assistance, goal-context and web-research preferences keep their main defaults; cloud activity matching defaults to off and requires a separate opt-in. When cloud matching is off, the existing conservative local matcher continues to operate. When it is on, accepted Nebius matches feed relevant progress and retained activity segments directly, without requiring a second keyword match. Idle and explicitly distracting activity never add relevant progress. Today ordering cannot replace a cloud-selected open goal outside Today.

Clipboard suggestions, selected-text OS/browser expansion, app-exclusion redesign, monthly email reports and a password/local lock remain backlog. The existing selected-text integration is preserved.

Version fields in package.json, package-lock.json, Cargo.toml, Cargo.lock and tauri.conf.json are synchronized at 0.20.0. This source milestone does not replace or publish an existing installer.

## Verification

After integration with main, 73 frontend tests, 156 Rust tests and six signed-update checks pass, as does the production build. Rust tests use the locked dependency graph; two existing smoke tests remain ignored. Browser verification of the UX milestone used isolated mock IPC and disposable fixture data, covering onboarding, quick creation, reordering, immediate editing, completion/reopening, batch suggestions, shared chat, draft recovery and Settings navigation. The real HTTP request contract is tested against a local test server, and additional integration tests verify cloud-attributed progress and preservation of a matched goal outside Today. A live Nebius account and native Windows card drag/resize were not exercised end to end for this milestone; these remain release smoke checks.
