# Changelog

## 0.21.0 — macOS support

- Add a shared macOS application with an Apple Silicon build (with an optional universal build) targeting macOS 14.5 and later.
- Add native foreground/idle tracking, bounded Accessibility context, Keychain credentials, app inventory, login startup and Command + Option selection shortcuts.
- Adapt role app rules, permission controls, voice input and platform wording for macOS. On-device speech requires supported installed language assets.
- Preserve the Windows installer/updater and add macOS CI artifacts in the same repository. Initial macOS installation is manual and locally ad-hoc signed; Developer ID notarization and exact 14.5 hardware validation remain separate requirements.


## 0.18.0

- Connect Goal Analyzer to Nebius with conditional Tavily research, sourced prerequisites, relevant resources and conservative time/difficulty estimates.
- Add explicit AI/context/web permissions, direct Ask Buddy, and visible Tavily key/connection controls.
- Replace the mini chat modes with a shared persistent conversation, attachments, editable voice input, source explanations and retained local inbox actions.
- Preserve tracking consent and pause choices across goal switches; expose collection errors and activity segments, and show observed time separately from the manual timer.
- Offer bounded midday help for overdue goals or measured overruns against user estimates; keep task changes explicitly confirmed.
- Improve local Russian/English phrase selection, reject uncertain recognition and show installed speech languages with retry/paste fallbacks.
- Preserve signing trust epoch 2 and the published 0.17.1 update bridge.

## 0.17.1

- Preserve all 0.17.0 Goals / Today features while enrolling the owner's second Windows computer as update signer `developer2`.
- Advance signing trust to epoch 2, retaining the primary key and verified update paths for older installations.
- Handle Tauri key-generation warnings in Windows PowerShell without aborting setup or exposing captured signing output.

## 0.17.0 — local, unpublished

- Simplify Today around goals with direct entry, inline steps and clear goal actions.
- Add deadlines, priority and descriptions without rewriting existing goals.
- Offer unfinished goals during planning, with persistent per-day dismissal.
- Add goals by planning date and minute/hour progress formatting.
- Receive reviewed selected-text drafts through Windows accessibility and a Chrome/Edge context-menu extension.
- Provide Developer 2 with goal analysis callbacks and suggestion/warning/resource rendering.

## 0.16.1

- Initialize the database and managed command state before creating either webview, preventing startup requests from reporting unmanaged state.
- Clear recovered dashboard and goal-loading errors without dismissing failed user actions.

## 0.16.0

- Check for and apply signed updates at startup before workspace editing; keep the installed version usable if GitHub or installation fails.
- Keep background update checks as notifications, and check again when connectivity returns.
- Pin updater installations to the running executable's folder and block downgrades in newly generated Windows installers.

## 0.15.1 — local, unpublished

- Remove decorative section frames and the repeated Progress heading; use spacing and a date-range toolbar to establish hierarchy.
- Keep selected days visible with theme-aware accents, readable time totals and a horizontally scrollable seven-day strip on narrow windows.
- Simplify Today sections, align page headings with the workspace and retain visible input and keyboard focus affordances.
- Correct the empty preview's dates and replace undefined surface colors with the existing light/dark theme tokens.

## 0.15.0

- Combine the core workspace with the 0.14.0 desktop companion and its existing consent controls.
- Add parallel goals and areas, editable steps, a one-to-three-goal Today plan and optional no-plan days.
- Add reviewed text, image, PDF and local Windows voice imports; AI proposals require explicit sharing and confirmation.
- Add a manual focus timer, day/week progress and a positive daily summary without requiring screen tracking.
- Simplify onboarding to a name, intentions, first goals and optional tracking; keep provider and companion controls in Settings.
- Share plan revisions, completion history and goal transitions between the workspace and mini chat.

## 0.14.0 — unpublished

- Add single-click companion mini chat, local quick tasks/inbox, explicit AI help, Windows voice typing and a selected-text shortcut prototype.
- Replace the Workspace label with native context actions and a persistent Open/Show/Hide/Tracking/Settings/Quit tray menu.
- Add unified activity events, opt-in visible-text task/completion proposals and confirmation with concurrent-plan guards.
- Add gentle daily check-ins, persisted cooldown/deduplication, a shared three-per-day prompt budget and meeting/full-screen/quiet-time suppression.
- Add calm companion states and an optional stretch invitation; keep light/dark and reduced-motion support.
- Document the Developer 1 boundary in `docs/COMPANION_MVP.md`.

## 0.13.0

- Separate personal Windows builds without signing credentials from official signed releases.
- Add local protected developer key setup and reviewed enrollment of multiple trusted update signers.
- Preserve verified update paths for existing installations through pinned compatibility channels.
- Include the avatar hover and compact-window fixes prepared for 0.12.1.

## 0.12.1

- Keep the desktop avatar background transparent on hover and use a muted keyboard focus outline.
- Fit the avatar and Workspace button inside the compact companion window so ears remain fully visible.

## 0.10.0

- Refresh the Windows workspace with a compact sidebar, neutral dark surfaces, consistent typography and dedicated Focus, Activity, Resources, Goal history and Settings views.
- Group settings with progressive disclosure and accessible switches. Preserve drafts when navigating between workspace views.
- Add real GitHub Release checks and a blue Update available indicator for newer published Windows versions. Separate unpublished releases and connection errors from successful checks.
- Download and verify signed installers only after an explicit Update & restart action. Keep local data and saved provider credentials across upgrades.
- Add a signed release workflow, version-pinned updater manifests and regression coverage for concurrency, offline checks and failed-install retries. See UPDATES.md for signing-key setup.

## 0.9.0

- Add resumable first-run setup: character/color, role/name/required email with a clearly labeled draft privacy notice, and a goal using the existing model. Ask about activity tracking afterward, with an option to continue paused.
- Share eight role presets between React and Rust, including Figma in Design. Apply starter app rules per goal while preserving manual overrides and explicit unclassification.
- Extend the existing companion with cat, dog, seal and bird appearances, state-driven expressions, color selection and complete visibility control.
- Consolidate profile, app rules, hours, startup and notification controls under the Settings gear. Enable installed Windows autostart by default after onboarding; development builds never register for startup.
- Add local star/text feedback in Settings and after goal completion, with a repository boundary for future feedback storage. Keep identity and feedback out of provider requests.
- Add profile validation, onboarding persistence, migration, preset and feedback regression coverage. See `docs/ONBOARDING.md` for affected files and native QA.

Known limits: the privacy notice is a placeholder awaiting a reviewed final policy. There is no remote registration/feedback service or voice recording. Windows sign-in startup and native companion interactions still need the manual QA checklist.

## 0.8.0

- Add foreground-browser title/domain metadata through a bounded Windows UI Automation adapter; retain only normalized hostnames and fall back to titles.
- Add deterministic focused, paused, drifting and resumed states, plus goal-completed events for the avatar API. Default idle threshold is five minutes.
- Suppress all automatic productivity notifications outside configurable local working hours (09:00–18:00 by default) and during confirmed system media playback.
- Extend observed usage tracking with disjoint app/site/tab and idle intervals, goal-completion timestamps and a typed goal-history API. Keep recommendations goal-scoped and persistence-safe.
- Add backward-compatible SQLite migrations and regression tests for transitions, media/hours suppression, overlap rejection, completion/restart, retention and legacy data.

Known limits: address-bar availability depends on browser/version/language; only domain/title metadata identifies pages. System media playback is confirmed only for exact executable identities. Unobserved transitions, sleep, app downtime and manual-pause durations are not inferred. See `docs/TRACKING.md` for Windows QA.

## 0.7.0

- Prioritize the saved current step and completion criterion in both recommendation query planning and resource selection.
- Use up to ten rated titles and ten recently offered titles from the current goal in both stages; query goal-scoped history directly instead of filtering the latest 100 global recommendations.
- Allow query planning and resource selection to abstain. Require a short, concrete next action for each selected resource and retain it in the existing recommendation reason.
- Deduplicate retained history and each result batch using URL identities without fragments or known tracking parameters (`utm_*`, `gclid`, `fbclid`, `msclkid`). Keep functional parameters and original link destinations intact; support legacy saved URLs without rewriting history.
- Update privacy disclosures and the local preview to include the recommendation memory actually sent to Nebius. Existing consent, cooldown and stale-response checks remain in place.

Known limits: semantic relevance and avoidance of similar content depend on the model and search snippets, not full-page verification. Different aliases/redirects and unknown tracking parameters may still represent duplicates. Deduplication is per goal and only covers retained history; retention/deletion can allow a resource to appear again. Live provider quality remains a manual check.

## 0.6.0

- Add per-goal Work, Distraction and Neutral process rules. Explicit rules override automatic AI focus judgments; unclassified apps retain the consented AI path.
- Add opt-in, provider-free distraction reminders after two active minutes in the same window. Explain the user's rule in each reminder; do not block apps or inspect browser domains.
- Apply a persisted, shared daily card limit (default 8) and minimum interval (default 15 minutes) to reminders, AI focus cards and recommendations. Quiet controls still apply; manual focus checks remain available in the workspace.
- Add sampled daily foreground time across goals and for the current goal, plus saved checklist progress. Do not infer past usage from legacy cumulative activity rows.
- Skip unobserved gaps, app/goal switches, pauses, excluded apps, Buddy itself and detected idle periods. Split samples at local midnight. Demo data stays in its separate database.
- Include daily usage in retention and confirmed history deletion. Keep active-goal rules and card-budget settings on history deletion.

Known limits: time is approximate, not whole-device usage; passive reading without input becomes idle after 60 seconds. Browser tabs share one process rule. Daily buckets retain their collection-time local date when the time zone changes. Card slots are reserved before native display, so a failed native show can conservatively consume a slot. No live provider or installed/native end-to-end verification is implied by automated tests.

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
