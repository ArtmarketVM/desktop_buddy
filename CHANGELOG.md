# Changelog

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
