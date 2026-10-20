# Shared frontend data flow

Developer 2 base: `11760017314095d75374449690c2a1c42c5af08a` (`origin/main`, version 0.39.0). Branch: `codex/shared-state`, isolated worktree. Existing checkouts and their changes are untouched.

## Verified starting map

- Dashboard: App in both main and buddy windows reads `get_dashboard` every 3 seconds; settings, sidebar, Today and mascot consume it. Most settings/goal/focus/tracking/companion commands change it. Appearance has its own event; other mutations mostly have no invalidation event.
- Workspace: Experience reads `get_core_snapshot(anchor, period)` plus `get_core_drafts` every 5 seconds, again after every mutation, on page/revision changes and on goal-analysis/completion/draft events. Progress keys use the selected anchor and day/week/month/year; Today uses null/week.
- Chat: Conversation reads current-conversation history and AI preferences every 5 seconds, on busy transitions and chat events. Chats independently reads conversation summaries on that same event and after mutations. CoachingPanel separately inspects a session keyed by conversation id. The history endpoint reads the globally selected conversation; selection must invalidate every cached history before new data is displayed.
- Activity: Timeline reads the latest 500 activity segments every 15 seconds and filters by local day. WindowActivity reads explicit UTC date bounds plus optional goal id every 10 seconds. Core progress and goal rows also consume recorded time.
- Service status: sidebar and AI Settings independently read the same local status every 30 seconds and on focus. Actual provider checks remain explicit/startup calls, not cache reads. Engine diagnostics reads every 5 seconds only while expanded/live.
- Work noticed reads the current offer every 5 seconds and on its dedicated event; its mutation creates completed work and transfers intervals.
- Eight backend event names exist at the base: the six `buddy://` events in the task notes, plus `goal_match_suggestion` and `unplanned_work_suggestion`. Per-window stores cannot depend on local invalidation to refresh the other webview.
- Clock/display timers: Avatar animation; TrackingStatus clock; MessageMeta relative timestamps. Permission checks (2 seconds) and updater checks (4 hours) are intentionally separate. None should be removed to reduce request counts.

## Ownership and coordination

No dependencies, manifests, lockfiles, CI, CSS, class names or selectors are changed. Developer 1/3 were not identifiable in available chats. The user explicitly deferred the privacy URL; `PRIVACY_POLICY_URL` stays unchanged. Rebase after Developer 1's CSS lands and run Developer 3's visual checks when available; no visual harness was supplied at this base.

## Implementation and validation

Work in progress. This document will record migrated resources, retained polling, exact commands/results and platform limits before handoff.
