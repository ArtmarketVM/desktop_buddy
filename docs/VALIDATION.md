# Validation record

## App rules and observed daily time — 0.6.0

Optimized Windows build and NSIS packaging succeeded at `src-tauri/target/release/bundle/nsis/Desktop Buddy_0.6.0_x64-setup.exe`. Rust formatting, Prettier and whitespace checks passed. The installer was built but not installed during verification.

Automated checks: 35 frontend tests and 54 Rust tests passed; the optional credential-vault test remains ignored. TypeScript/Vite build passed. Tests cover goal-specific normalized rules and removal, explicit-rule priority over automatic AI, opt-in local reminders and quiet controls, shared budget/cooldown/day rollover, real observed sample accounting without legacy backfill, exclusions/idle/gaps/clock changes, local-midnight splitting, retention/deletion, and database reopening. Frontend checks cover rendered categories, daily/current-goal totals, saved checklist progress, empty/demo disclosure and IPC payloads.

No user database or live provider keys were used. Static rendering and backend tests do not verify installed interaction, native overlay timing, or Google Meet screen sharing.

Manual acceptance: upgrade from 0.5.0 and confirm goals and keys remain intact. Set a process to Distraction for one goal and Work for another, restart and verify both rules. Enable local reminders without AI keys; remain in one distraction window for two active minutes, pause input briefly, and check the rule explanation. Verify pause, DND, snooze, meeting/fullscreen suppression, zero-card mode, shared cooldown and restart persistence. Switch windows/apps/goals, idle for over a minute and pause/resume tracking; daily totals must only accumulate observed intervals. Check saved-step progress separately from explicit goal completion. Validate retention/deletion using disposable history. Browser rules cover the whole browser, not individual sites.

## Goal planning — 0.5.0

Optimized Windows build and NSIS packaging succeeded: `src-tauri/target/release/bundle/nsis/Desktop Buddy_0.5.0_x64-setup.exe`. The installer is unsigned and was not installed during this verification.

Automated results: 29 frontend tests and 45 Rust tests passed; one optional credential-store test was ignored. TypeScript/Vite production build, Rust formatting, Prettier and whitespace checks passed. Tests used isolated temporary/in-memory databases and mocked HTTP endpoints, not user data or live credentials.

Adds local completion criteria, ordered steps, current-step context, explicit completion/deferral/resumption, and optional one-off goal refinement. Upgrade uses an additive `goal_plans` table, retaining old goal records and statuses. Tests exercise the legacy initialization path, disk reopening, plan limits, stale revision rejection, current-step validation, lifecycle transitions, retention/cascade behavior, and a real HTTP request to a mock Nebius server that sends no activity and does not save the proposal.

Frontend tests cover the rendered plan controls, completion confirmation, saved-goal statuses, and command payloads. They do not simulate native clicks. Real provider refinement quality, installed upgrade behavior, and visual/interactive goal editing have not been verified in this milestone. No live keys or user database were used during tests.

Manual acceptance: upgrade from 0.4.0 and confirm the old active goal remains. Add/reorder/check steps and select a current step; save and restart to verify persistence. Inspect the privacy preview. Start another goal and resume the deferred one, checking that resumption leaves tracking paused. Confirm completion explicitly. Request an AI proposal, reject it, then request another, confirm replacement and edit/save the draft. Confirm completed checkboxes never automatically complete a goal and unsaved edits block goal switching. Check retention and deletion using disposable history only.

## Recommendation controls — 0.4.0

Optimized Windows build and NSIS packaging succeeded at `src-tauri/target/release/bundle/nsis/Desktop Buddy_0.4.0_x64-setup.exe`. Rust formatting, Prettier, and whitespace checks passed. The installer was built but not installed during verification.

Automated checks: 26 frontend tests and 37 Rust tests passed, with the optional credential-store test ignored. TypeScript/Vite build passed. Tests cover command arguments, history empty/rated rendering, frequency options, rating replacement/removal, snooze suppression/expiry, and interval changes. The existing worker-dispatch regression guard also passed.

The local browser preview rendered the workspace, history empty state, and snooze controls. Browser automation could not open Settings (clicks left the UI unchanged); native controls are intentionally disabled in browser preview. No live provider calls or changes to user history were made. Native end-to-end interaction remains unverified.

Manual acceptance: install 0.4.0, verify a changed search interval survives restart, rate an existing recommendation Helpful/Not helpful and clear the rating, and verify persistence. Use Not now on a card; tracking must continue while Buddy is hidden. Resume from the workspace and confirm DND/paused tracking remain unchanged. History should respect retention/deletion; URLs must open only on explicit click. Recheck Google Meet screen sharing against the retained 0.3.1 fix.

## Native event-thread deadlock fix — 0.3.1

Automated checks: 35 Rust tests passed with the optional credential-store test ignored; 17 frontend tests passed; TypeScript/Vite build, Rust formatting, and `git diff --check` passed.

Code inspection identified a lock inversion: the background Buddy update holds `AppState::inner` while native window getters wait for the event thread. A default synchronous IPC command such as `get_dashboard` can occupy that event thread waiting for the same mutex. All application IPC commands now explicitly use worker dispatch (`#[tauri::command(async)]`); tray and close callbacks already dispatch stateful work off the event thread.

Source-level regression tests enforce worker dispatch across all registered command modules and reject default synchronous dispatch. These tests guard the dispatch policy; they do not reproduce Windows, WebView2, or screen sharing. No user data or running processes were modified for verification.

Manual acceptance: install 0.3.1 after quitting the old version, enable the persistent companion, leave dashboard polling active, repeatedly switch foreground windows, drag Buddy, toggle pause/DND and settings, then start/stop Google Meet screen sharing. Confirm both windows and tray remain responsive. The specific reported incident has not been reproduced under a debugger, so other causes of unresponsiveness are not ruled out.

## Privacy controls — 0.3.0

Frontend: 17 tests passed; TypeScript/Vite production build passed. Rust: `cargo test --locked --manifest-path src-tauri/Cargo.toml` passed with 33 tests and one optional credential-store test ignored. Rust formatting completed successfully.

Optimized Windows build and NSIS packaging succeeded: `src-tauri/target/release/bundle/nsis/Desktop Buddy_0.3.0_x64-setup.exe`. Prettier and `git diff --check` passed. The installer is unsigned and has not been installed as part of this verification.

Regression coverage includes retention boundaries, deletion preserving the active goal and settings, minimized preview context, authenticated GET connection checks without private context, and provider errors that do not expose response bodies. Storage tests use isolated databases; no user history was deleted and no live provider keys were exercised.

Manual checks still required: install over 0.2.0, verify existing goals/settings survive, inspect the local preview, exclude a process, test each saved provider key, and verify confirmation-gated deletion using disposable history. Test tray reopen/quit and companion placement on multiple monitors. Browser/static-render tests do not verify native behavior. The unfinished history/rating/frequency UI from roadmap items 1–3 is not included in this milestone.

## Desktop companion — 0.2.0

Implemented persistent display preferences, a transparent draggable companion, a 45-second expanded card, pause/DND suppression, and opt-in Nebius-to-Tavily suggestions with a 15-minute attempt interval. Search query validation, stale consent/session rejection, and per-goal URL deduplication have regression coverage. Release versions are checked across npm, Cargo, lockfiles, and Tauri.

Frontend checks: 8 tests passed; TypeScript/Vite build passed. The compact character was visually inspected in the browser via the fallback browser connection. Browser rendering does not verify native transparency, dragging, focus behavior, or monitor boundaries. Real provider recommendation quality and the installed end-to-end workflow require user verification.

Rust checks: 25 passed, with the opt-in credential-store integration test skipped. Rust formatting passed. Optimized Windows build and NSIS packaging succeeded at version 0.2.0.

Manual release check: install 0.2.0; start a goal; uncheck **Show Buddy only with suggestions**; minimize the workspace; drag Buddy across the desktop; confirm pause/DND hide it. Configure both keys and explicitly enable **Proactive suggestions**; verify a resource opens only when clicked, the card expires after 45 seconds, the selected display mode returns, and no duplicate URL is offered for the same goal. Restart to verify preferences persist while tracking starts paused. Exclusive fullscreen and secure desktops are unsupported.

## Nebius response-format fix — 2026-09-26

Requests now specify a strict `response_format` JSON schema for focus decisions and allow 2048 output tokens instead of 500. The parser accepts a single Markdown-fenced JSON response while retaining enum, confidence, and reason validation. Truncated completions, refusals, empty content, and invalid JSON produce separate safe errors without logging or displaying provider content. No automatic format-repair requests or fabricated decisions are used.

Regression tests cover fenced JSON, truncation (including syntactically valid but incomplete completions), refusal, empty/malformed output, and the schema/token limit in the actual HTTP request. Live verification with the user's provider account remains outstanding; the original failed response was not retained, so its exact cause is unconfirmed.

Reference: [Nebius structured output documentation](https://docs.tokenfactory.nebius.com/ai-models-inference/json).

## Provider Settings update — 2026-09-26

- Frontend: 6 tests passed; TypeScript and Vite production build passed.
- Rust: 18 standard tests passed; the opt-in Windows Credential Manager round-trip test also passed outside the sandbox. It created, replaced, read, and removed an isolated dummy credential, without touching provider credentials. The sandbox initially denied the credential write.
- Rust formatting and Prettier checks passed.
- Optimized Windows executable and NSIS installer rebuilt successfully with Settings.
- Live provider authentication and the interactive installed Settings flow still require manual verification.
- Manual check: install the updated package, open Settings, save each provider key, close and reopen the app, run an explicit search/focus check, replace a key, and remove it. Confirm AI remains off until consent is enabled, errors do not echo keys, and environment fallbacks are understood.

## Initial MVP

Verified locally on Windows on 2026-09-25.

| Check                                                    | Result                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| TypeScript compilation and Vite production build         | Passed                                                                               |
| Frontend tests                                           | 4 passed                                                                             |
| Rust tests with mocked HTTP servers                      | 16 passed                                                                            |
| Rust formatting and Prettier checks                      | Passed                                                                               |
| PowerShell helper syntax                                 | Passed                                                                               |
| npm dependency audit after installing final dependencies | 0 vulnerabilities reported                                                           |
| Optimized Windows executable build                       | Passed                                                                               |
| NSIS x64 installer packaging                             | Passed                                                                               |
| Release startup smoke                                    | Process remained alive for seven seconds, then was stopped; tracking and AI were off |
| Browser preview                                          | Rendered correctly, including the narrow layout; desktop-only controls were disabled |

The Rust tests include the simulated activity-to-decision-to-feedback sequence, reopening saved SQLite data, nudge suppression rules, strict model response validation, real HTTP request construction against mock servers, retries, and search result normalization.

Artifacts:

- `src-tauri/target/release/desktop-buddy.exe`
- `src-tauri/target/release/bundle/nsis/Desktop Buddy_0.1.0_x64-setup.exe`

Not yet verified: paid/live Nebius and Tavily requests (no runtime credentials were provided), the native interactive popup workflow, and installing the NSIS package on a clean machine. The startup smoke is not a substitute for the manual end-to-end checklist in [DEMO.md](DEMO.md). The GitHub Actions workflow has been authored but has not been run remotely.
