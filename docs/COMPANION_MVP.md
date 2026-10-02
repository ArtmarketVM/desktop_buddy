# Desktop companion MVP — 0.14.0

This module implements the Developer 2 companion/tracking brief without replacing Developer 1's Goals UI. Version 0.14.0 is a local build until explicitly published.

## Using Buddy

- Click the desktop character once to open mini chat. Drag at least six pixels to move it; dragging does not open chat. The character has no Workspace label, blue glow or bouncing body.
- Right-click for Add task, Ask Buddy, Research selected topic, Hide Buddy or Open full app. The tray offers Open Buddy, Show/Hide companion, Pause/Resume tracking, Settings and Quit. Closing the workspace keeps the tray running.
- Mini chat supports text, Ctrl+Enter, local task creation, AI answers, research links and Open app. Adding a task appends an unfinished step to the active goal. Without an active goal, it saves to a local Buddy inbox. It never silently creates or switches goals.
- Voice uses [Windows voice typing](https://support.microsoft.com/en-us/accessibility/windows/use-voice-typing-to-talk-instead-of-type-on-your-pc), equivalent to Windows+H. The text field is focused first; Windows controls microphone access and its [speech privacy settings](https://support.microsoft.com/en-us/windows/privacy/speech-voice-activation-inking-typing-and-privacy). Buddy does not record audio or provide its own transcription service.
- Select text in an accessible Windows application, then press Ctrl+Alt+B. This P2 prototype offers Add task, Research, Explain and Save. Unsupported controls show a paste fallback. It does not install a system-wide context-menu extension or read the clipboard. A conflicting shortcut is reported in mini chat.

## Consent and interventions

Settings → Desktop companion contains the pause switch, daily check-ins, quiet hours, full-screen hiding and the optional stretch invitation. Stretch invitations are off by default. Pausing suggestions leaves manual chat available.

Automatic task/completion detection is separately **off by default**. To use it, enable **Suggest tasks from visible text**, activity tracking and AI check-ins, with a runtime Nebius connection. The Windows adapter samples at most 3,000 characters of accessible visible text from the foreground application, plus the active goal and checklist. It does not take screenshots or perform OCR. Password/edit controls, password managers and sensitive window titles are excluded from automatic sampling; common credential lines are filtered. These heuristics cannot guarantee that ordinary documents contain no sensitive information: only opt in for applications whose visible content you intend to share. Sample text is not saved in SQLite or logs.

Manual Ask/Explain sends only the submitted message and goal context to Nebius after Send. Research sends the submitted query to Tavily; opening a returned link requires a click. Local task/inbox actions do not call a provider. `DEMO_MODE` and `AI_MOCK` retain separate meanings; mock replies are explicitly labelled, and automatic screen detection is disabled in either mode.

Detection requires confidence ≥0.90 and valid structured output. Closing a window or a generic “done” is insufficient completion evidence. New tasks show Add/Ignore; suspected completions show Yes/Not yet. Completion affects exactly one confirmed checklist step, never the whole goal. Goal ID, plan revision and consent/window context are rechecked before applying delayed results. Stale confirmations fail safely.

Automatic prompts share a persisted budget of at most **three per local day**, at least **60 minutes apart**, including the existing resource/focus nudges. A dismissal starts the same cooldown. Content fingerprints prevent repeat task suggestions across restarts. Scheduled offers occur at most once per daily slot:

| Offer                      | Conditions                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| Plan today / No plan today | No active goal; configured startup delay, default 10 minutes                              |
| Review progress            | 12:00–15:00; active goal at least three hours old; no confirmed progress for three hours  |
| End-of-day wrap-up         | 17:00–19:00; active goal; review progress, defer unfinished goal or open Activity summary |
| Stretch                    | Explicit opt-in; at least two hours after launch                                          |

The delay starts when Buddy launches, not when Windows boots. Quiet hours default to 19:00–09:00; equal start/end disables quiet hours. Meeting/presentation heuristics, full-screen apps, idle time, hidden/paused companion, DND, snooze, open mini chat and recent dismissal suppress automatic prompts. Detection is heuristic, not call transcription or proof of completion. No blocking, shaming, countdowns or fabricated progress are introduced.

Visual states include idle, sleeping, listening, thinking, success and attention; the optional stretch uses a brief arm gesture. Light/dark themes and reduced-motion preferences are respected.

## Boundary for Developer 1

Rust owns `src-tauri/src/companion/`; React owns `src/companion/`. The existing goal storage is the integration adapter. Companion code does not mount, edit or navigate internal Goals components. Navigation requests use `buddy://navigate` (`focus`, `activity`, `settings`), and the workspace decides how to display them.

`get_companion_goal_context` returns `{ "goal.list": savedGoals, "goal.active": activeGoalOrNull, "plan": activePlanOrNull }`. Active goal is separate from the saved-goal list. Each plan has `goal_id`, `revision`, `done_when`, `steps: [{id,text,done}]` and `current_step`. Existing goal commands emit lifecycle notifications and the companion also reads the latest storage state on every tick; events are notifications, not an alternative source of truth.

All notifications use Tauri event **`buddy://event`** with `{type,timestamp,payload}`. Timestamp is RFC3339 UTC. Subscribe with `listen<BuddyEvent>` from `@tauri-apps/api/event`; use the TypeScript types in `src/companion/types.ts`.

| Type                                                                   | Payload                                                                                                                                             |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activity`, `activity.started`                                         | `{type:"activity", app, window_title, timestamp, context, confidence, idle, fullscreen, meeting, simulated}`                                        |
| `activity.stopped`                                                     | `{app}` of the previous application; emitted when switching away/stopping                                                                           |
| `task.detected`, `task.completion_suspected`, `intervention.requested` | Intervention `{id,kind,text,confidence,goal_id,plan_revision,step_id,expires_at}`; proposal only                                                    |
| `goal.active`, `goal.created`                                          | Goal `{id,text,status,created_at}`, or null for no active goal; resume commands can send `{id,action:"resume"}` before the refreshed snapshot       |
| `goal.completed`, `goal.deferred`                                      | Existing goal commands send `{id,action}`; companion deferral sends the previous goal snapshot. Reload context for the final persisted status       |
| `settings.updated`                                                     | Complete companion preferences                                                                                                                      |
| `task.created`                                                         | Manual creation: `{id,goal_id,text}`. Confirmed detected task: intervention snapshot; reload the current plan to obtain the newly persisted step ID |
| `task.completed`                                                       | Confirmed intervention snapshot including the completed `step_id`                                                                                   |

`get_companion_view` returns preferences, current proposal, inbox, activity, chat intent/seed, notice and shortcut availability. `open_companion_chat`, `close_companion_chat`, `set_companion_preferences`, `companion_submit`, `respond_companion_intervention` and `update_companion_inbox` are exposed by `src/api/tauri.ts`. Manual task creation supplies the expected goal ID and plan revision. Proposal responses supply its ID and an action: `accept`, `ignore`, or end-of-day `tomorrow`/`summary`. Proposals expire after two minutes. Storage's optimistic revision checks preserve concurrent Developer 1 edits.

Local settings keys: `companion_preferences`, `companion_memory`, `companion_inbox`. Only bounded hashes/counters, preferences and deliberately saved inbox text persist. Existing profile/goals and provider-key storage are retained. Provider keys stay runtime-only.

## Validation and limitations

See [VALIDATION.md](VALIDATION.md). Tests cover cooldown/dedup, quiet hours, scheduler, explicit completion, stale revisions, goal changes, local inbox and real HTTP request construction with mocked servers. This verifies provider transport without sending production content.

For isolated native QA, debug builds alone accept `BUDDY_TEST_DATA_DIR` when **both** `DEMO_MODE=true` and `AI_MOCK=true`; the fixture remains under ignored `.tools`. Release builds ignore this override. Never use the production database for automated QA.

Voice recognition, live provider detection and selected text across all Windows applications need manual end-to-end verification. Pixel-only/custom controls are unsupported; selected text depends on UI Automation. The current module has no screenshot analysis, meeting transcription, calendar ingestion or new remote account service.
