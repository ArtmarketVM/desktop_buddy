# Core experience and companion integration — 0.15.0

This version combines Developer 1's daily workspace with Developer 2's companion commit `d237c27`. The Windows release uses the normal signed release workflow; private signing credentials remain on the release owner's computer.

## Daily flow

- Today presents the Buddy composer, one to three chosen goals, expandable goals grouped into areas, and a positive daily summary.
- Goals can be edited, completed, reopened, deferred or deleted. Checking a step does not complete its goal. An explicit delete confirmation removes its local history too.
- Plan today selects saved goals; No plan today clears only today's selection. Previous days remain in Progress.
- Progress shows completed goals/steps and manual focus time by goal for today, previous days and seven-day ranges.
- The focus timer selects the compatibility active goal. It does not enable activity tracking. A native three-second heartbeat counts elapsed time while the workspace is hidden; sleep, large clock gaps and app restarts are skipped. Pause stops the timer.
- Onboarding requires only a name. Professional roles, email and installed app selection are optional legacy data, not prerequisites. Activity tracking starts only after explicit consent and requires a selected goal.
- Settings contains startup, working days/hours, check-ins, movement notes, companion visibility and theme. Existing companion controls, appearance, AI connection, local data and feedback remain available in expandable sections.

## Imports

Typing one goal per line saves directly without a provider. Text notes, PNG/JPEG/WebP images and PDFs can be attached. PDFs are read locally with PDF.js; scanned PDFs are rendered locally into images. Limits are 15 MB per file, 50 text PDF pages, four scanned pages/images, 16,000 text characters, 20 proposed goals and 20 steps per goal. Oversized input is rejected instead of silently truncated.

Voice records at most 60 seconds of mono 16 kHz PCM. Windows System.Speech creates a transcript locally using an installed Windows recognition language; an unavailable engine produces an actionable error. Check the transcript before saving or sharing. Live microphone and recognition quality still require manual validation on the target Windows machine.

Ask Buddy requires a checkbox confirming the currently visible text/images. The real Nebius HTTP request includes only that input, not profile details, existing goals or screen history. A structured proposal can be edited or discarded before confirming. Imports use a batch identifier so retrying a save does not duplicate goals. AI_MOCK returns a labeled local example and does not call a provider; it remains separate from DEMO_MODE activity.

Text requests use the existing runtime `NEBIUS_MODEL_ID`. Images require a vision-capable model ID in Settings, or runtime `NEBIUS_VISION_MODEL_ID`. No model credentials are embedded in frontend assets. Live provider responses and image-model compatibility require the configured provider/key; tests use a local HTTP fixture.

## Shared data contract

Core metadata lives in additive `core_areas`, `core_goals`, `core_days`, `core_day_items`, `core_events`, `core_time` and `core_import_batches` tables. Goal IDs and plans stay in the existing `goals` and `goal_plans` tables. Parallel core goals use `open`; only the explicitly selected compatibility goal is legacy `active`. Other open goals remain available instead of being replaced.

Both editors use the same optimistic plan revision. `goals::save_goal_plan` records step transitions in core history in its transaction, including confirmed mini-chat completions. Legacy deferral/completion updates core status and stops a matching timer. Core changes invalidate stale companion proposals without implementing new screen detection or desktop mechanics.

Core preferences are stored under `core_preferences`; weekdays use Sunday=0. They drive workspace planning prompts. Developer 2's existing tracking hours and companion quiet controls remain separate. Native notifications retain Developer 2's rules. The workspace movement note uses accumulated manual focus time and does not inspect the screen.

Explicit history clearing removes manual time, daily selections and completion events and stops the timer while retaining open/deferred core goals. Retention removes older core history alongside existing activity history. Resetting the local profile preserves goals as before.

The workspace listens for the existing `buddy://navigate` event. `focus` opens Today and `activity` opens Progress. All companion commands and CSS remain registered. Mini chat keeps its local inbox, explicit task confirmation and selected-text shortcut.

Core code: `src/core/`, `src-tauri/src/core.rs`, `core_import.rs`, `core_tests.rs`. Shared integration changes are limited to command registration/native heartbeat, storage initialization/retention, plan/goal transition hooks and the application shell. See [COMPANION_MVP.md](COMPANION_MVP.md) for the retained desktop contract.
