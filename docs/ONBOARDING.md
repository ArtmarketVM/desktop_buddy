# Onboarding and settings (0.9.0)

## Contracts and persistence

`UserSettings` lives in the existing SQLite preferences table, keyed by `user_settings`. Defaults are an incomplete onboarding, a visible green cat, and autostart enabled. The profile holds name, email, role, avatar and acknowledgement of notice version `draft-v1`. There is no remote user database. Identity is never included in existing Nebius/Tavily contexts.

The three product screens are companion, identity and goal. Steps 0–2 are saved through `save_onboarding`; identity validation is required before entering step 2. Back navigation is allowed. Avatar and identity save on Continue, while goal draft text has an explicit Save button. `create_onboarding_goal` uses the existing goal insertion transaction and atomically stores step 3 and its goal ID. Retries at that stage return the existing goal. An existing active goal is deferred, preserving its history.

At step 3, `finish_onboarding` records the choice to start monitoring or continue paused. The tray's Resume action cannot bypass unfinished onboarding. Startup remains paused; a later explicit Resume grants tracking consent. Creating later goals follows the saved consent. AI consent and proactive search remain separate existing controls.

`src/data/rolePresets.json` is the shared versioned catalog, imported by React and embedded in Rust. It contains eight roles and named app groups; Figma is Design. Groups describe the catalog, while actual tracking categories reuse Work/Neutral/Distraction. Browser defaults are Neutral because a process rule applies to every tab. Generated rules carry `preset_source='role'`; role changes replace those only. Manual rules clear that marker, and explicit Unclassified choices use goal-scoped `preset_exclusions`, so changing appearance or role does not restore unwanted rules. New goals receive the current role defaults. Old app rules migrate as manual rules.

The existing `BuddyView` exposes appearance and activity events. A reusable SVG renderer supplies four characters and working, paused, sleeping, completed and fun states. Visibility suppresses the native window, workspace avatar and automatic companion requests/reminders. Tracking and explicit manual provider actions remain available. Appearance changes invalidate in-flight automatic suggestions through the existing privacy revision.

Installed Windows release builds use the per-user [Windows Run registry key](https://learn.microsoft.com/en-us/windows/win32/setupapi/run-and-runonce-registry-keys) with a quoted executable and `--background`. Startup defaults on after onboarding; Settings can disable it. Debug/test builds never register executables. Paths exceeding the Windows Run command limit are rejected. Startup-registration failure is reported rather than silently claiming success. Removing the executable does not itself remove the registry value: disable startup before uninstalling if the installer does not clean it up.

`save_product_feedback` validates 1–5 stars, optional text (2,000 characters maximum), source and a completed goal when applicable. The local `FeedbackRepository` writes a separate `product_feedback` table, avoiding confusion with recommendation ratings and focus-decision feedback. `input_kind='text'` reserves an extension point; voice recording and an external service are not implemented. History retention/deletion also removes product feedback. Profile settings and app rules for the active goal remain.

The privacy notice is a labeled product placeholder, not a final legal policy. Replace the notice content and version when a reviewed policy is available. No personality/tone, new provider integrations or analytics services were added.

## Files changed for prompt 1

Feature files:

- `src/data/{rolePresets.json,profile.ts}`
- `src/components/{Onboarding,ProfileFields,ProfileSettings,Avatar,ProductFeedback}.tsx`
- `src/components/Onboarding.test.tsx`
- `src-tauri/src/{profile,profile_tests,autostart,product_feedback}.rs`
- `docs/ONBOARDING.md`, `README.md`, `CHANGELOG.md`

Shared/core files:

- `src/App.tsx`, `src/api/tauri.ts`, `src/types.ts`, `src/style.css`: first-run routing, Settings gear, typed IPC and rendering.
- `src/components/{Settings,DesktopBuddy,GoalPlanner}.tsx`: reuse existing settings, native companion and completion flow.
- `src-tauri/src/{lib,models,commands}.rs`: register IPC, dashboard settings, startup integration and tracking consent.
- `src-tauri/src/{storage,insights}.rs`: additive migration, shared goal insertion, role defaults, manual-rule precedence and feedback retention.
- `src-tauri/src/buddy.rs`, `src-tauri/src/buddy_tests.rs`: hide/suppress the companion using the existing scheduler.
- `src-tauri/src/threading_tests.rs`: enforce worker dispatch for the new command modules.
- `package.json`, `package-lock.json`, `src-tauri/{Cargo.toml,Cargo.lock,tauri.conf.json}`: synchronized 0.9.0 version and Windows Registry API feature.

Prompt 2's collector, browser adapter and history calculations are unchanged by prompt 1.

## Verification and manual QA

Automated coverage verifies preset references/Figma, identity validation, onboarding order and no duplicate goals, restoration after reopening SQLite, legacy goals, manual overrides/unclassification, avatar hiding, completed-goal feedback, retention and existing frontend/backend regression tests. TypeScript/Vite and Windows release compilation are also checked.

Browser QA covers character selection, profile navigation, empty/invalid email and missing acknowledgement errors, draft privacy disclosure and the goal screen. Browser mode does not create goals or save to SQLite; those behaviors are covered by Rust tests.

Native Windows checklist (requires running the app/installed build):

1. With a fresh demo database, select each character/color, complete profile, save a goal draft and restart at each stage. Verify restoration and no monitoring before the final choice; retrying goal creation must not duplicate it.
2. Choose Continue without tracking. Verify the workspace stays paused, Resume starts a session, and restart starts paused again. Verify AI refinement still uses the existing explicit proposal flow.
3. In Settings choose Designer, inspect Figma/Design and manually override or unclassify an app. Change the role, save appearance only, restart and start another goal; verify current-goal manual choices and new-goal defaults.
4. Hide the companion while a card is visible; verify no native character/card or workspace avatar remains. Re-enable it and check all four characters, drag, color, drifting/sleeping and completed expression. Check reduced motion.
5. Set hours and DND using Settings. Verify automatic notifications respect those controls and settings persist.
6. Submit a star rating with/without text from Settings and after explicitly completing a goal. Verify local feedback persists and clear/retention removes it.
7. In an installed release enable/disable autostart, inspect the per-user Run value and sign out/in: Buddy should start in the tray without a focused workspace and with tracking paused. Confirm no startup value is created by development/test launches.

Native overlay interaction and actual Windows sign-in startup remain manual checks; they are not established by unit tests or release compilation.
