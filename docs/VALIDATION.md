# Validation record

## Buddy AI, Tavily and tracking — 0.18.0

Validated on the second Windows computer on 2026-10-06: 66 frontend tests, 134 backend tests (one optional credential-vault test ignored), six update/signing tests and the TypeScript/Vite production build passed. Release versions are synchronized across all five files; trust epoch 2 and the published 0.17.1 bridge are unchanged.

New backend checks cover classification and structured suggestions over real HTTP to isolated test servers, conditional/no-search behavior, advanced Tavily request/authentication and safe 401 handling, source/evidence validation, revoked sharing consent, common conversation persistence after SQLite reopening, bounded retention, measured overrun/deadline triggers, completed-goal suppression and separate timer/observed totals. Existing tracking checks now verify the ActivitySegment contract after reopening the database, including domain-only URLs, tab titles and duration/state attribution.

Browser checks used mock IPC, synthetic responses and a separate localStorage history, with no provider calls or production database access. Ctrl+Enter issued one send; messages rendered on the intended sides; chat worked with no active goal; a simulated provider failure kept the message draft. The preview is a UI test rather than a native application or provider smoke test.

Local Windows speech discovery returned only `en-US`. Phrase-selection tests cover Russian/English segments, competing overlaps and uncertain/noisy input. Russian/mixed microphone quality remains unverified until a Russian recognizer is installed. See [AI_BUDDY_TAVILY_TRACKING.md](AI_BUDDY_TAVILY_TRACKING.md) for setup and remaining live checks.

Optimized Windows x64 compilation and NSIS packaging passed on 2026-10-06. Both executable version fields report 0.18.0. Installer: `Desktop Buddy_0.18.0_x64-setup.exe`, 5,474,577 bytes, SHA-256 `9e5ceaac553375418fae210effaa8f2d023c26f15373b3c52b1d40ab3635b125`. The actual installer and its trusted version comment verify as signer `developer2` against the unchanged epoch-2 trust. The private key was decrypted only for the local signing process and remains outside the repository.

All six update/signing checks passed again after packaging. The generated legacy and epoch-1 manifests exactly preserve the compatibility archive; epoch 2 offers 0.18.0. The public 0.13.0 and 0.17.1 bridge installers were downloaded and cryptographically verified as `primary` against historical epoch-1 trust, and the public 0.17.1 manifests match the retained channels. SHA256SUMS.txt covers the new installer, its signature and all three manifests. The release assets are ready for publication; native installation and an existing user's full update/restart flow were not exercised.

## Primary-signed transition artifact — 0.17.1 (local, unpublished)

Validated on the original Windows computer on 2026-10-06: 58 frontend tests, 121 backend tests (one optional credential-vault test ignored), six release/signing tests and eight contact tests passed. TypeScript/Vite compilation and the signed Windows NSIS build passed. The executable reports 0.17.1. Installer: 5,335,602 bytes, SHA-256 `453af89db3d58f60d6f800d8c3594548a57cd4f48d2b7d0605fa4ffd1564f620`.

The actual artifact signature verifies as `primary` against both the historical epoch-1 trust and the current epoch-2 trust. Epoch 2 retains `primary` and adds `developer2`. Both generated epoch channels offer the same 0.17.1 artifact; `updates/compatibility.json` archives the primary-signed epoch-1 bridge for future releases. The legacy channel remains the unchanged 0.13.0 bridge. The private key was used locally and was not exported. The installer has not been installed or published during this verification.

## Second-computer signing transition — 0.17.1 (prepared, unpublished)

Validated on 2026-10-05 after integrating the complete 0.17.0 source from `3b68228`: 66 frontend tests, 121 backend tests (one optional credential-vault test ignored), and six release/signing tests passed. The TypeScript/Vite production build and synchronized-version/trust-epoch check passed. Rust required new deep-link/single-instance dependencies; its initial sandboxed download failed, and the authorized retry outside the sandbox succeeded.

All 0.17.0 frontend/backend feature files, the browser extension, and the AI contract remain unchanged. Dependency declarations and lock entries are preserved apart from the root application version. The `desktopbuddy` protocol configuration is preserved. Trust epoch 2 contains the unchanged primary public key and the second computer's `developer2` public key, verified against its local public file. The epoch-1 trust snapshot and legacy 0.13.0 compatibility bridge are preserved.

The `developer2` key's Windows DPAPI round trip and overwrite guard were verified during initial local setup. Its protected private file remains outside the repository on the second computer. No installer was built or published. The original computer must sign the 0.17.1 transition with `primary` and publish all updater channels before `developer2` can sign later releases. See [RELEASE_0.17.1.md](RELEASE_0.17.1.md).

## Goals / Today core — 0.17.0 (local, unpublished)

Validated on 2026-10-06: 58 frontend tests, 121 backend tests (one optional credential-vault test ignored), six release/signing tests, TypeScript/Vite production build, Rust formatting and signed Windows NSIS build passed. The core tests cover revision conflicts, atomic deadline edits, metadata preservation across step saves, completion/reopening, carryover dismissal across days, date selectors, retry-safe quick entry and persistence after closing/reopening SQLite. Draft intake tests cover bounded/validated URLs, review-before-creation and discard/retry behavior.

Native UI validation used a separately seeded `.tools/goals-qa-0.17.0/buddy-demo.db` with DEMO_MODE and AI_MOCK enabled. Cold and warm URL launches produced reviewed drafts; the warm launch forwarded to the running process without leaving a second app instance. A confirmed draft became a Today goal, an inline step persisted, and carryover dismissal persisted without deleting the goal. A UTC deadline displayed in local time; resaving deadline/priority through the editor preserved the step. The editor overlay was visually checked after correcting its missing fixed positioning. Isolated debug validation skips startup-entry synchronization so the production installation is unaffected.

Installer: `Desktop Buddy_0.17.0_x64-setup.exe`, 5,327,969 bytes, SHA-256 `07c35dc608a89a9c8480d1e1f5d3a8f5dd2cd4862757178bf5084ab92acaa4ff`. The generated updater manifest verifies the artifact signature against trust epoch 1. Versions are synchronized across all five release files. The existing Tauri 2.11.6 dependency graph is retained; only the compatible deep-link/single-instance plugins and their required dependencies were added.

The installer was built locally, not installed or published. The browser context-menu extension is provided unpacked with setup instructions; installation and the browser-to-OS permission prompt were not exercised. Arbitrary Windows applications can expose different accessibility selection support or reserve Ctrl+Alt+G. AI analysis callbacks and proposal rendering are implemented; live analysis generation remains Developer 2's responsibility under this task's scope. See [Goals / Today core](GOALS_TODAY_CORE.md).

## Managed-state startup repair — 0.16.1

Validated on 2026-10-04: 54 frontend tests, 115 backend tests (one optional credential-vault test ignored), six release/signing tests and eight isolated contact tests passed. Production frontend compilation, Rust formatting and the signed Windows NSIS build passed.

The Tauri 2.11.6 startup implementation creates configured webviews before invoking the application setup hook. Both window configurations now disable automatic creation; application and updater state are registered before those windows are built explicitly. The regression test drives Tauri's mock startup lifecycle with the real window configuration and an in-memory database, asserts that no webview opens before initialization, and invokes `get_dashboard` through IPC immediately afterward. Backend tests run as an explicit Cargo test target so the Windows Common Controls manifest can be linked to the test executable without duplicating production resources.

Dashboard and goal polling errors clear after a successful retry. User-action errors have separate state and are retained across successful background polls. The signed installer reports 0.16.1; SHA-256 is `7f64d8be627ddd649aa47a4a7a65880c223cae8af5c9a16941b7e760894238fa`. Its signature and epoch-1 update manifest verify. The existing legacy bridge remains 0.13.0. Native installation was not performed during validation; source and artifacts were prepared for subsequent authorized GitHub publication. The running production copy remains 0.16.0, and its profile, goals and provider credentials were not changed.

## Startup updates and installation repair — 0.16.0 (installed locally, unpublished)

Validated on 2026-10-03: 54 frontend tests, 114 Rust tests (one optional credential-vault test ignored), six release/signing tests and eight isolated contact tests passed. Production compilation and the signed Windows NSIS build passed. New coverage verifies one-time startup checks/install, offline/download fallback, notification-only checks during a session and safe installation-directory arguments. The generated NSIS script sets `ALLOWDOWNGRADES` to false.

The installer is 5,279,266 bytes, SHA-256 `4934defd06498a165e597c32c8913c283b05fb275ef26cf6124dd6fa3df92530`. Its owner signature verifies and modified bytes are rejected. Version 0.16.0 was installed under the real `mkors` account at `C:\Users\mkors\Applications\Desktop Buddy`. Registry metadata, desktop/Start Menu shortcuts, startup command and the launched executable all refer to this installation. Native UI showed Installed version 0.16.0. The native screenshot is saved locally at `.tools/installed-0.16.0.png`; logs are in `.tools/startup-0.16.0-tests.log` and `.tools/startup-0.16.0-release.log`.

Before installation, SQLite backup/integrity validation and installation/shortcut/startup backups were saved outside OneDrive under `%USERPROFILE%/.desktop-buddy/backups/20261003-install-repair`. Eighteen previous installer/signature files were archived in a ZIP and hash-verified before removal from the bundle folder. The inactive 0.10.0 installation was moved into the same private backup root. The bundle folder retains only the 0.16.0 installer/signature pair. A read-only post-install check verified database integrity and that every original goals/goal_plans row remains present. Credentials were neither exported nor modified.

Automatic startup fallback/controller behavior is tested, and native launch/current-version checks succeeded. A future newer signed release installing/restarting through the live updater has not yet been tested end to end. Version 0.16.0 remains unpublished, and old GitHub release assets/compatibility channels were retained. Newly built installers reject downgrades; previously delivered installers cannot be retroactively changed. Offline operation uses the last installed version rather than guaranteeing the newest remote release.

## Minimal workspace design — 0.15.1 (local, unpublished)

Validated on 2026-10-03: 51 frontend tests, 113 Rust tests (one optional credential-vault test ignored), six signing/release tests and eight isolated contact tests passed. The final TypeScript/Vite production build and signed Windows NSIS build passed using Node.js 24.19.0. No dependencies or Rust behavior changed.

Current-run in-app browser screenshots compare Progress and Today before and after the changes. Light/dark Progress, day selection, visible keyboard focus, retained composer drafts across navigation and the Settings input layout were checked. At the native minimum width of 760 pixels, the day strip scrolls independently; a sidebar overflow found during inspection was corrected. Screenshots and step notes are saved locally in `.tools/design-audit/REPORT.md`. These checks cover the browser interface with empty preview data, not a native installation, live AI, microphone input or full screen-reader compliance. The existing installed app and production data were not changed.

The local installer reports 0.15.1 and is 5,276,249 bytes. SHA-256: `07ba85c2e5e0e3abec4ff49914b139de8ada7c75de249f34c9f7ec188efde140`. Its existing-owner updater signature verifies; altered bytes are rejected. The local current channel targets 0.15.1 while the compatibility bridge remains 0.13.0. Credentials remain local, and the source/frontend scan found no provider or signing keys. No commit, push or GitHub release was made for this design update.

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
