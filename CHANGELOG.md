# Changelog

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
