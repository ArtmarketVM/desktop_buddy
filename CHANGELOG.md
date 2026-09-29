# Changelog

## 0.5.0

- Add editable completion criteria, up to 20 ordered checklist steps, and one current unfinished step per goal.
- Save plans locally with revision checks; preserve existing goals on upgrade.
- Defer the previous goal when starting another. Explicit completion requires confirmation; completion, deferral and resumption leave tracking paused.
- Include the saved criterion and current step in consented AI focus and recommendation context, including the local privacy preview.
- Offer optional Nebius goal refinement without activity history. Proposals never save automatically: replacing a checklist requires confirmation, then an explicit save of the editable draft.
- Keep deferred plans during automatic retention; explicit history deletion removes inactive goals and their plans, while preserving the active plan.

Known limits: completed statuses from older versions remain unchanged and may reflect the old automatic-completion behavior. No deadlines, project hierarchy, streaks, or automatic outcome verification. Native end-to-end interaction and live refinement quality require manual validation.

## 0.4.0

- Expose 5/15/30/60-minute automatic recommendation intervals in Settings, separately from focus checks.
- Show the latest 100 retained recommendations with their goals, timestamps, and reversible helpful/not-helpful ratings.
- Add a one-hour Not now action to floating cards and explicit snooze/resume controls in the workspace. Snooze preserves tracking and DND state.
- Retain the 0.3.1 worker-dispatch fix and add regression coverage for rating updates, interval changes, and snooze suppression.

## 0.3.1

- Dispatch IPC commands outside the native event thread to prevent a lock inversion between dashboard polling and Buddy window updates.
- Add a regression guard covering every registered command module, including settings and privacy commands.
- Preserve existing data, consent settings, and provider behavior; no new tracking capabilities.

The deadlock path is identified in code. Reproducing the reported Google Meet screen-sharing incident and verifying the fix in that native workflow remain manual checks.

## 0.3.0

- Add a local preview of the minimized context used by AI requests.
- Add excluded applications, optional 7/30/90-day retention, and confirmed local-history deletion that pauses tracking while preserving the active goal and provider keys.
- Add explicit provider connection checks without sending goals or activity, and safe actionable HTTP errors.
- Add tray actions, close-to-tray behavior, persisted companion position, and scheduling foundations from the ongoing desktop-reliability work.
- Add model-assisted resource selection and stored recommendation records; history, rating, and frequency controls are not yet exposed in the UI.

Known limits: native tray/monitor interactions, live provider access, and install-over-existing-data still need manual verification. History deletion is logical deletion, not secure erasure, and cannot remove data already sent to providers. Automatic updates and installer signing are not implemented.

## 0.2.0

- Move Buddy into a transparent, always-on-top, draggable desktop window.
- Add persistent intermittent/always-visible display preferences and CSS animation.
- Add separately consented Nebius-generated Tavily searches, 15-minute pacing, per-goal URL deduplication, and stale-result rejection.
- Add expiring resource cards, pause/DND suppression, and a return-to-workspace action.
- Synchronize release versions and enforce consistency during frontend builds.
- Add regression tests for preferences, scheduling, consent changes, and companion rendering.

Known limits: position persists only during the current run; closing the workspace exits the app; native overlay interactions and live recommendation quality still need manual verification.

## 0.1.0 — prototype baseline

- Add a Windows-first Tauri/React focus dashboard and Win32 foreground activity collection.
- Persist goals, activity, decisions, and feedback in SQLite.
- Integrate Nebius focus analysis with structured responses and manual Tavily search.
- Add provider Settings with Windows Credential Manager storage.
- Add a separate focus-nudge popup, explicit AI consent, pause, and DND.
- Add simulated activity and clearly labeled mock AI, tests, and Windows CI/NSIS packaging.

## History note

Development started before the first Git commit. The repository begins with a single commit of version 0.2.0. The 0.1.0 section documents earlier prototype work, including provider Settings and response-format fixes; it does not represent a separate Git commit or tag.
