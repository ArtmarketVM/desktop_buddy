# Validation record

## Signed combined Windows update — 0.15.0

Revalidated on 2026-10-03 after fast-forwarding to Developer 1 commit `abc7dfc`, which includes companion commit `d237c27`: 51 frontend tests, 113 Rust tests (one optional credential-vault test ignored), six release/signing tests and eight isolated contact contract tests passed. TypeScript/Vite production compilation, Rust formatting, debug build and signed NSIS release build passed. Node.js 24.19.0 was used for the final pipeline because PDF.js requires Node.js 22.13+ or 24+; dependencies were installed from the committed lockfile without engine warnings.

Native Windows verification used only the existing isolated companion fixture with DEMO_MODE and AI_MOCK, activity tracking disabled and no live provider calls. The new Today and Goals screens loaded at 0.15.0. The existing 0.14.0 fixture goal and its unfinished checklist step were retained and displayed in the new Goals UI. The migrated character opened mini chat with the same active goal. A read-only SQLite check confirmed plan revision 1, the original step text and the additive open core-goal record. The test process and preview server were stopped; production profile/goals were not used or changed.

The 5,277,433-byte installer reports 0.15.0. Its existing-owner updater signature verifies and altered bytes are rejected. SHA-256: `4e33f2cb6e3ed26e70fea1d44073e8a36d21134633ceaced566e4b9df5861d93`. The current epoch-1 channel points to 0.15.0; the archived legacy bridge remains byte-for-byte 0.13.0. No key was enrolled or rotated. Private signing credentials remain local. Changed files and frontend assets contain no local provider or signing keys. Release publication uses a draft, verifies uploaded asset sizes/digests, then publishes. The pre-existing Russian handoff modification remains outside the release commit.

Microphone recognition, live AI/vision quality, app-specific selected-text behavior and a full updater install/restart cycle remain manual checks. This release validates packaging, signature integrity, retained local fixture data and the combined interface; it does not claim these untested end-to-end scenarios have passed.

## Combined core workspace and companion — 0.15.0 (source, unpublished)

Validated on Windows on 2026-10-02 against companion commit `d237c27`: 59 frontend tests, 113 Rust tests (one optional Windows credential-vault test ignored), six release/signing tests and the TypeScript/Vite production build passed. No installer was built or published for this source version.

New coverage checks parallel goals without replacing the compatibility focus, Today limits/no-plan days, atomic/idempotent imports, optimistic plan revisions, manual time across sleep/restart/fractional ticks, history cleanup, bounded PCM, local attachment limits, name-only onboarding, and completion/deferral across the workspace and companion. Provider requests use real HTTP against a local fixture, without production content.

Headless Edge verification used isolated test data and a fake IPC transport, with no production database or provider credentials. It verified expandable goal steps, no save before import confirmation, successful confirmation, composer drafts surviving navigation, retained companion settings, and layouts at 1280 and 800 pixels without horizontal overflow. Screenshots were inspected. This is browser UI verification; live microphone recognition, PDF/vision provider quality and native desktop mechanics still require the relevant manual checks described in [CORE_EXPERIENCE.md](CORE_EXPERIENCE.md) and [COMPANION_MVP.md](COMPANION_MVP.md).

## Desktop companion MVP — 0.14.0 (local, unpublished)

Verified on Windows on 2026-10-02: 46 frontend tests, 104 Rust tests (one optional credential-vault test ignored), six release/signing tests and eight isolated contact contract tests passed. The final frontend change to synchronize companion settings was followed by all 46 frontend tests and a TypeScript/Vite production build. Rust formatting and the debug/release builds passed; dependencies are unchanged.

New regression coverage includes quiet hours, startup delay, midday progress gating, persisted cooldown/daily budget/deduplication, explicit completion tied to an unfinished step, stale revisions, changed active goals, local inbox behavior, opt-in sampling gates, sensitive-text filtering and Nebius HTTP request construction against a mock server. Provider transport tests use real HTTP with simulated servers; they do not send production content.

Native UI verification used a separate debug-only fixture under ignored `.tools`, with both DEMO_MODE and AI_MOCK enabled, tracking disabled and no live provider calls. A single character click opened mini chat. Add task saved “Review companion draft” to the existing fixture goal; a read-only SQLite check confirmed one unfinished step, revision 1 and no extra goal. Light native chat and the dark browser preview at 380 × 560 were inspected. The isolated process and preview server were stopped. Production profile/goals and provider credentials were not used. Native dragging, tray/context-menu actions, microphone recognition, selected-text handling across applications and live task/completion detection still require end-to-end manual checks. Intervention policy and task-storage behavior are covered by automated tests.

The signed Windows x64 NSIS installer was built locally. The executable reports 0.14.0; its updater signature verifies and changed installer bytes are rejected. The current epoch-1 manifest targets 0.14.0, while the archived legacy bridge remains 0.13.0. Installer SHA-256: `003991b078dac265d5423590bc31b92132160e735ee5373d08a93f3d5021e288`. Changed source, new files and frontend assets contain no local provider/signing keys. No install or release publication was performed during validation; source was prepared for the subsequent authorized commit and push. Pre-existing Russian handoff edits were preserved byte-for-byte.

The Developer 1 integration contract, consent controls and MVP limitations are documented in [COMPANION_MVP.md](COMPANION_MVP.md).

## Final Windows release packaging — 0.13.0

On 2026-10-02, after synchronizing the avatar fixes from GitHub main, the final Windows x64 NSIS installer was rebuilt from the reviewed 0.13.0 source with `./scripts/dev.ps1 -Task release`. Production frontend compilation passed. The existing primary key signed the installer locally; its signature and signed version verified, and altered installer bytes were rejected. Both `latest.json` and `updates-epoch-1.json` refer to this exact artifact. The generated public compatibility archive is committed with the release source. Private keys were not uploaded. The installed copy remains 0.12.0; a live install/restart through the published updater is still a separate check.

## Personal builds and trusted team signers — 0.13.0 (prepublication validation)

Prepared locally on Windows on 2026-10-02, while the installed and published application was 0.12.0. This milestone adds a no-key personal installer task, a separate signed release task, local DPAPI-protected developer key setup, reviewed public-key enrollment, multiple trusted updater signers, signed version binding and pinned compatibility channels for users who skip transition releases. No second developer is enrolled; the production public list contains only the existing primary key. No private key was shared or uploaded.

Automated checks: 44 frontend tests, 94 Rust tests (one optional credential-vault test ignored), six release/signing tests and eight contact contract tests passed. TypeScript/Vite production build and PowerShell helper parsing passed. Two independent disposable signer fixtures verify; unknown keys, altered content/comments, wrong signed versions, duplicate enrollment, self-authorized transitions, missing bridges and replacement of archived bridge versions are rejected. Test fixture private keys were removed; only public keys and signatures are in source.

The real `setup-signing-key.ps1` was exercised with a uniquely named disposable signer. DPAPI round-trip and signing passed; rerunning setup refused to overwrite its protected key. Its protected/private files were removed afterward without touching the owner's existing key. The independent proof signature verified with the public key.

Both Windows x64 NSIS builds passed: the signed installer in `src-tauri/target/release/bundle/nsis/` and the personal installer without an updater signature in `.tools/builds/development/release/bundle/nsis/`. The official artifact's signature and signed 0.13.0 version verified, altered installer bytes were rejected, and the initial legacy/team manifests matched. The personal build did not replace the signed artifact. Neither installer was installed during this milestone. Source/bundle checks found no local provider or signing keys.

Before pushing, main was synchronized with commits `841ef96` and `59906d1`: the 0.12.1 avatar hover and compact-window fixes are included in the 0.13.0 source. All 44 frontend tests, the production build and six release/signing tests passed again after synchronization; Rust code and dependencies are unchanged from the validated state above. The installer checks above preceded those fixes; unpublished signed artifacts were preserved under ignored `.tools/pre-sync-artifacts-0.13.0/`, and the pending compatibility archive was reset. Build the final merged installer and generate its bridge archive before publishing. Publishing the initial bridge and a reviewed transition with the other developer's public key are still needed before existing users accept that developer's updates. Live multi-release download/install transitions and key revocation are not verified. Instructions are in [TEAM_SIGNING.md](TEAM_SIGNING.md). Pre-existing edits to the Russian handoff were preserved.

## Continuous roles and private research — 0.12.0

Verified on Windows on 2026-10-02: 44 frontend tests, 91 Rust tests (one optional credential-vault test ignored), eight isolated contact contract tests and the release-manifest test passed. TypeScript/Vite production build and Rust formatting passed. Tests cover custom-role/app limits, legacy profile compatibility, persistence and preset rules, carousel index/rebase boundaries, separate research consent, payload minimization, confirmation purpose, expired/repeated links, scanner-safe GETs and research removal without marketing changes. Contact contract tests simulate dependencies and send no email.

Browser checks covered nine accessible role buttons, repeated forward/reverse wraparound, direct Other selection, horizontal scrolling, custom-role/app inputs, and 760 × 600 without document overflow. Rapid arrow clicks originally displaced the selected role; preserving the navigation target during smooth scrolling fixed this. Role-specific background art uses local vectors. Light-theme cards and wheel navigation were also inspected in the native workspace.

The signed x64 NSIS installer built successfully. Its updater signature verified and modified installer bytes were rejected. The installed executable and workspace report 0.12.0; the existing desktop shortcut points to that executable. The first silent installation attempt returned success while retaining the old binary; retry after process shutdown completed the upgrade. Always verify the installed version after a silent installation.

Native verification used only a separate simulated fixture with tracking and live AI disabled: Other → Musician and Ableton Live/Canva saved successfully, then a read-only database check confirmed persistence and the retained goal/checklist. That fixture was backed up and removed afterward; the normal app was reopened. Production profile/goals and provider credentials were not used for these checks. Changed source and the frontend bundle were checked for the owner's provider and signing keys; none were found.

The private service is prepared but not deployed. Live cloud RLS, confirmation delivery and removal require an owner-controlled Supabase project and mail provider. A newer-version download/restart cycle through the updater remains untested in this release; local installer upgrade and signature verification passed. The Russian handoff distinguishes updating source from updating the installed app.

## Companion visibility and feedback — 0.11.2

Frontend tests: 41 passed. TypeScript/Vite build and the signed Windows x64 installer build passed. Dependency versions are unchanged. The updater signature verified and modified installer bytes were rejected. The installed workspace reports 0.11.2. Local silent upgrades wait for the previous process to exit before running `/S /UPDATE`.

The Focus companion card keeps its character preview when desktop visibility is off. A labelled keyboard-accessible switch controls only the desktop companion. Working and suggestion character states no longer move the body; blinking remains. Share an idea starts expanded and keeps its existing explicit draft/send behavior. Native verification uses an isolated cat fixture with tracking and live AI disabled; it does not modify production goals or send email.

## Workspace and contact integration — 0.11.1

Verified on Windows on 2026-10-02. Automated checks passed: 41 frontend tests, 89 Rust tests (one optional credential-vault test ignored), five isolated contact-server contract tests and the release-manifest test. TypeScript/Vite production build, Rust formatting, Prettier and whitespace checks passed. Contact tests use simulated HTTP dependencies and send no email.

The signed x64 NSIS installer built successfully at `src-tauri/target/release/bundle/nsis/Desktop Buddy_0.11.1_x64-setup.exe`. Its updater signature verified; modified artifact bytes were rejected. A local upgrade with `/S /UPDATE /D=<existing installation directory>` installed the new executable. The existing desktop shortcut was checked against the installed path and the native workspace displayed version 0.11.1. Use `/UPDATE` for silent upgrades to an existing installation.

Browser checks covered onboarding at 1280 pixels and 760 × 600, three fixed colors, horizontal role scrolling and wraparound arrows without page overflow. Native checks on an isolated demo fixture covered a saved checklist toggle, dark theme, showing/hiding the passive companion with tracking paused, and closing/reopening the workspace while the companion remained visible. Production profile and goal data were not edited for these checks. Test fixtures are separate from real activity.

The private contact schema, server function and desktop connection are prepared; no cloud service has been deployed. Live database access policies, feedback delivery, confirmation and unsubscribe require a configured Supabase project and mail provider. Without that service, feedback opens a draft addressed to `artmarket.vm@gmail.com`; opening a draft does not send it. No local profile emails are uploaded automatically.

The release has not been published to GitHub. An actual newer-version download/restart cycle remains to be checked after publishing a subsequent signed release. Character-generation prompts are in [BUDDY_ART_PROMPTS.md](BUDDY_ART_PROMPTS.md); the current app continues to use its SVG characters until approved artwork is supplied.

## Recommendation quality — 0.7.0

Automated checks: 35 frontend tests and 62 Rust tests passed; the optional credential-vault test remains ignored. TypeScript/Vite build passed. New tests cover structured current-step context, goal-scoped bounded feedback beyond the global history limit, tracking-parameter/fragment deduplication, legacy URLs, batch duplicates, provider abstention, required next actions, invalid/refused/truncated output, and both HTTP stages against an isolated mock server. Frontend tests verify the next action and updated privacy disclosure render.

No live provider keys or user history were used. Real recommendation relevance, native card layout, and installed upgrade behavior remain manual checks. Optimized Windows compilation and NSIS packaging succeeded at `src-tauri/target/release/bundle/nsis/Desktop Buddy_0.7.0_x64-setup.exe`. The installer was built but not installed during verification.

Manual acceptance: select a current step, enable proactive suggestions and inspect the local context preview. Rate resources and confirm later searches stay relevant to that step. Check that retained links do not repeat through known marketing URL variants. Each offered link should explain its relevance and propose a concrete action; irrelevant results should produce no card. Change the step or a rating during a request and verify stale responses are discarded. Retention/deletion intentionally removes recommendation memory.

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
