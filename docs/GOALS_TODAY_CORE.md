# Goals / Today core — Developer 1

## Delivered scope

- Today starts with goals and a compact direct-entry form. Imports and existing AI composition remain available through a secondary action and the Import page.
- Goal rows expose completion, focus, Today membership and inline step creation. The overflow menu exposes editing, setting aside/reopening and confirmed deletion.
- Deadlines, optional priority and descriptions persist locally. UTC RFC 3339 dates display in the user's timezone. Creation and completion timestamps come from the existing goal records.
- Planning shows unfinished goals previously selected for another day. Nothing rolls over automatically. Dismissal persists for that calendar day; a later day can offer the goal again.
- Goal history filters by planning date. It shows the current status of the goals originally selected on that date, not a historical snapshot of their former titles or steps.
- Progress displays minutes/hours; less than a minute displays `<1m`. Storage and tracking retain second precision.
- Selected text becomes a local draft requiring explicit confirmation. Drafts survive restart and never invoke AI.

## Storage and compatibility

`core_goal_details` stores deadline/priority/description without rewriting existing goals. `core_carryover_dismissals` stores per-day choices. `core_quick_batches` prevents duplicate direct-entry/capture retries, including retries after deletion. Existing SQLite tables and saved plans remain readable; initialization is idempotent.

Goal edits use the existing plan revision. Metadata edits and step edits share the same revision check and transaction. Ordinary step saves preserve metadata. Completion records `completed_at`; reopening clears it. Deletion cascades goal metadata and date membership. History retention clears dated carryover dismissals along with dated progress.

`get_core_snapshot(anchor)` now includes `selected_date`, `date_goals`, and `carryover`; `today` remains tied to the real current local date. `Storage::core_goals_for_date` is the date selector. `dismiss_core_carryover` dismisses a candidate for today. Quick entry adds to Today while fewer than three goals are selected; extra goals remain in All goals.

## Developer 2 contract

Import `GoalAnalysisInput`, `GoalAnalysisResult`, `GoalEnhancement` and `analysisInput` from `src/core/analysis.tsx`. Supply `enhancement={{ onImprove, onResearch }}` to `Experience` (or individual `GoalRow`/`GoalAreas`). Each callback accepts the documented input and returns a promise of the analysis result.

`goalId` is a string representation of the SQLite numeric ID. The input contains title, optional description/deadline/priority, a copy of existing steps, and an optional context reference. No profile or screen activity is automatically attached. Developer 2 is responsible for consent, provider configuration, real network calls and response validation. Developer 1 makes no new LLM or research calls.

Results display improved title, estimated duration, difficulty, suggested steps, warnings and resources. Source links accept only HTTP(S) without embedded credentials. Titles and steps are applied only through explicit acceptance. Results are transient and cleared when the goal revision changes; late responses for a changed/unmounted goal are ignored. Accepted step source links are displayed in the proposal, but are not stored in the existing `Step` model. Buttons remain visibly unavailable until a callback is connected.

## Selected text on Windows

For Chrome/Edge install the unpacked extension in `browser-extension`:

1. Install the new Buddy installer so Windows registers `desktopbuddy://`.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable Developer mode, choose Load unpacked, and select `browser-extension`.
4. Select text, right-click, choose **Add as goal in Buddy**.
5. Allow the browser to open Buddy (or click Open Buddy on the bridge page). Edit and confirm the draft in Today.

The extension reads only the explicitly selected text and has no page-reading or network permissions. Its local bridge opens `desktopbuddy://goal?text=...`; Buddy validates the scheme, destination, parameters and size before creating a draft. A single-instance plugin forwards links to the already running app. No public server or API key is involved.

For other Windows applications, select text and press **Ctrl+Alt+G** while Buddy is running and setup is complete. This uses Windows accessibility selection; unsupported applications can require copying/pasting instead. **Ctrl+Alt+B** remains the existing companion shortcut. Captured companion text can also be sent via its **Add selected text as goal** menu action. A Windows app cannot add an item to every third-party application's own context menu; the extension and accessibility shortcut cover these separate environments.

Drafts accept up to 4,000 characters and the queue holds 20 items. Before creating a goal, long selections must be shortened to the existing 500-character goal limit. Dismissing a draft creates no goal. No selected content is sent to an AI provider by this module.

## Boundaries

No new Tavily, Nebius, screen tracking, transcription, external-service integration or AI day planner is implemented in this work. Existing features are preserved. Release version is 0.17.0; publishing remains a separate authorized operation.
