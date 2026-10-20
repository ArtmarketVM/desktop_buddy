# Quality gates and visual handoff

## Final handoff: 20 October 2026

Infrastructure is published on `codex/quality-gates`. Merge this branch first; Developers 1 and 2 should then rebase onto it. Application source remains unchanged from the agreed base. No Linux, Docker, installer release, version bump, Pages-setting change, or direct developer messaging was used.

| Area | Final result and evidence |
| --- | --- |
| Visual baselines | All **34** captured and strictly compared in [Windows CI](https://github.com/ArtmarketVM/desktop_buddy/actions/runs/39488577476), with zero differing pixels. The owner reviewed and explicitly approved all 34 in chat on 20 October. Exact CI PNGs, environment and SHA-256 hashes are committed under `visual/baselines/`; provenance and approval are in `review.json`. |
| Visual gate | Blocking after baseline approval; comparison never updates expectations. Failed screenshots/diffs/traces and a clickable review gallery are retained as CI artifacts. |
| Windows native checks | [Native build job](https://github.com/ArtmarketVM/desktop_buddy/actions/runs/39488229545/job/118854177460) passed acceptance, Rust formatting and Windows x64 installer validation on `f5ab8ff8852e6ee2cae6c98f3240429489428861`. The initial visual job in that run failed due to shallow history; it was fixed and passed separately in the visual run above. |
| macOS native checks | [Apple Silicon CI](https://github.com/ArtmarketVM/desktop_buddy/actions/runs/39487091175) passed acceptance, formatting, `.app` and `.dmg` validation on `71d556390085dbe3e583da3c29098d5430633866`: 242 frontend and 606 Rust tests passed, 2 Rust tests ignored. |
| Lint rollout | Non-blocking. ESLint: 16 errors / 16 warnings. Local Windows Clippy: 61 unique warnings; macOS CI Clippy: 79. Detailed reports are CI artifacts. No blanket suppressions or application rewrites. |
| Privacy | **Integration blocker remains explicit:** the app constant is owned by Developer 2 and still opens the 404 URL. Developer 2 must set `/docs/privacy.html`; merge the policy/font assets into `main` for existing Pages publication, then run `npm run verify:privacy`. The canonical URL currently returns 200 but the public page still has Google Fonts. |

CI native results remain valid for this handoff: later changes affect only visual tests, reviewed PNGs, review tooling, CI orchestration and documentation; application source, Rust dependencies and production npm dependencies are unchanged. Native builds are CI validation artifacts, not installed signed releases or complete manual product acceptance. Existing manual/live-account acceptance cases remain required.

Developer 1: at width 720, Settings Privacy already clips at the right edge. The owner approved this as the unchanged starting appearance; treat a layout fix as an intentional change and request review of updated screenshots. Developer 2: inspect the intermittent `NoticedWork` title test described below; do not weaken its assertion to accommodate stale data.

### Shared-state integration

PR #36 reached main before this infrastructure merge. Its shared queries batch initial reads on a 20 ms timer, so a fully paused browser clock leaves the workspace loading. The visual harness now advances the fake clock by 100 ms after mounting and navigation, allowing those reads while staying below the avatar's 500 ms frame interval. Production timing, fixtures, assertions and the 34 approved PNGs are unchanged. Validate this integration with strict comparison in the documented Windows CI environment; macOS screenshots do not establish a Windows visual pass.

## Shared base and ownership

- Branch: `codex/quality-gates`; isolated worktree: `.tools/worktrees/quality-gates`.
- Exact agreed application base: `11760017314095d75374449690c2a1c42c5af08a` (v0.39.0).
- Fetched `origin` before implementation; `main` and `origin/main` both matched this commit, with a clean original working tree.
- Developer 3 owns dependency manifests, test/lint configuration, CI, fixtures, and public policy assets. Application TSX and application CSS remain with Developers 2 and 1.
- Merge infrastructure first. Developers 1 and 2 then rebase onto it. Dependency requests should be coordinated through Developer 3.

## Visual contract for Developer 1

The owner explicitly requested **no Linux** on 20 October 2026. The canonical capture and comparison environment is the `windows-2022` visual job in the existing Windows workflow, using Node 24 and locked Playwright 1.56.1 / its bundled Chromium. Local Windows screenshots are provisional; only captures produced and compared in that CI environment can become reviewed baselines. Do not use macOS screenshots as Windows expectations.

Application rendering stays at the agreed base until initial candidates are captured. Do not land CSS changes before reviewing and approving those candidates. If work proceeds independently, keep the base available for capture using the infrastructure files without application changes.

Matrix: 8 screens × 2 themes × 2 viewport sizes, plus 2 collapsed-sidebar captures = **34 screenshots**. Screens: Today, My progress, All goals, Chats, Settings General, Settings AI, Settings Privacy, and the buddy companion window with chat open. Viewports: **1280×873** and **720×873**, scale factor 1; collapsed Today is wide only, in both themes. There are no extra browser/platform combinations.

Fixtures live exclusively in `visual/`. The test HTML imports Tauri `mockIPC` / `mockWindows`, sets the Tauri detection flag, then dynamically imports the unchanged application entry. No production mock mode or build alias is introduced. The fixed clock is `2026-10-20T10:00:00.000Z`, locale `en-GB`, timezone `UTC`. The read-only IPC allowlist supplies a named profile, three goals, seven days of progress, one conversation, provider statuses without keys, settings and buddy state. Unknown IPC fails, including credentials, AI generation and update installation. Automatic sidebar connection probes receive a deterministic no-key fixture reply; no actual provider HTTP call is made. Browser requests outside the local Vite origin are blocked and asserted absent. Tests wait for local Instrument Sans and Silkscreen fonts; reduced motion, disabled animations/transitions, and a hidden caret stabilise capture.

The browser clock also pauses JavaScript timers before application startup. Fixing `Date` alone left the Settings avatar gallery unstable; pausing the clock prevents those frame changes without modifying application code or masking any UI. The candidate runner forwards CLI options, so `npm run test:visual:candidates -- --workers=2` generates and strictly compares all 34 captures with two workers.

```powershell
npm ci
npx playwright install chromium
npm run test:visual:list
# Provisional local candidates; review before accepting any images.
npm run test:visual:update
# Strict comparison: missing images and diffs fail; never rewrite expectations.
npm run test:visual
npx playwright show-report
# Build a full-size clickable gallery in the repository or an extracted CI artifact.
node scripts/visual-review.mjs
node scripts/visual-review.mjs PATH_TO_EXTRACTED_VISUAL_ARTIFACT
```

Canonical candidates: dispatch the existing **Windows build** workflow on this branch with `visual_candidates=true`. Download the `visual-windows-2022` artifact and inspect every candidate alongside the application at the recorded base. Capture twice in that same job: the second run must compare with zero differing pixels. Preserve the runner image/version artifact with the review record. Human reviewers must approve all 34 images before committing them under `visual/baselines/`. Never automatically approve snapshots from a pull request or hide changed areas with screenshot masks. Future updates use the same procedure and must explain each intentional visual change in the PR.

The visual job explicitly fetches the agreed base commit because Actions' default shallow checkout does not include it. To iterate browser infrastructure while a full native run is already validating the same application source/dependencies, dispatch with `visual_only=true`; the default remains false, and normal push/PR/full-dispatch native checks remain intact. A visual-only run never counts as native validation.

CI always uploads the HTML report, actual/expected/diff images, traces, candidate images and environment metadata, including failures. Browser visual coverage does **not** validate native Tauri window behaviour, updater, signing, credentials, permissions, or macOS rendering.

## Initial lint rollout

`npm run lint` uses ESLint recommended TypeScript and React Hooks checks. `npm run lint:rust` runs `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --message-format=json -- -W clippy::all`. No blanket suppressions or automated application rewrites are introduced. Existing lint findings remain visible. Both native CI workflows start with non-blocking lint steps and always upload detailed JSON, counts and compiler logs from `.tools/quality/`.

Initial measurements on unchanged application source at the exact base:

| Check                | Result                                         | Coverage                                                                |
| -------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| ESLint 10.13.0       | 16 errors, 16 warnings across 15 files; exit 1 | TypeScript / TSX, fixtures and Playwright config                        |
| Clippy / Rust 1.98.0 | 0 errors, 61 unique warnings; exit 0           | Windows x64, all Rust targets; repeated target diagnostics deduplicated |

ESLint rules: 13 unused-variable findings, 16 effect-dependency warnings, 1 useless assignment, 2 control-character regex findings. Developer 2 should review these in `src/api/memory.ts`, `src/App.tsx`, `src/companion/Conversation.tsx`, `src/components/{Onboarding,PrivacySettings,ProfileFields}.tsx`, `src/core/{Composer,Experience,GoalOrder,Goals,GoalWorkContext,NoticedWork,Progress,Settings}.tsx`, and `src/data/profile.ts`. Some underscore destructuring and intentional sanitisation regexes may need narrow, reasoned rule decisions by their owner; no suppressions have been added here.

Rust findings include 19 dead-code warnings, 8 functions with too many arguments, 7 needless borrows, 6 default-field reassignments and 1 `await_holding_lock` warning in `src-tauri/src/coaching/gateway/tests.rs:102`. Developer 2 should review that test lock warning; this branch does not perform broad Rust cleanup. Full reports are regenerated by the commands above and retained by CI.

Report initial counts before proposing blocking gates. Compiler failures are distinguished from warnings; an unavailable tool or failed compilation is not a clean lint result. Application findings go to Developer 2. CSS remains with Developer 1; existing 600-weight font imports in `src/style.css` are a typography review item, not an ESLint finding.

## Privacy handoff for Developer 2 and owner

Verified by real HTTP requests on 20 October 2026: the configured app URL `https://artmarketvm.github.io/desktop_buddy/privacy.html` returns **404**; `https://artmarketvm.github.io/desktop_buddy/docs/privacy.html` returns **200** with the current policy (updated 18 October 2026, applying to 0.35.0 and later). The public page still loads Google Fonts at verification time.

Developer 2 must change only `PRIVACY_POLICY_URL` in `src/core/Settings.tsx` to the `/docs/privacy.html` URL and update affected assertions on their branch. Developer 3 deliberately does not edit the TSX file while it is being refactored. Developer 3 replaces Google Fonts with locally hosted, licensed font files in `docs/fonts/`. These assets must reach `main` and the existing Pages publication before the public font fix is complete.

Run `npm run verify:privacy` after integration/publication. It fetches the actual app URL and canonical URL, requires HTTP 200, compares the response to the local policy, and reports external Google Fonts references. A prepared workflow or local edit is not evidence that the live app link is fixed.

Pages currently publishes `main` from `/`, exposing repository-root files as website paths. Whether this broad website publication is intentional is **unconfirmed and needs the owner's decision**. Do not change Pages settings. Alternatives to discuss: use `/docs` as the source, or publish only policy assets through a dedicated Pages deployment. Either changes public website content/paths and needs owner approval.

## Validation chronology and intermediate findings

The checkpoints below retain the investigation history, including intermediate failures and pending states. The final status table above supersedes those intermediate pending states. No release versions, signing configuration, or updater trust keys are changed by this infrastructure branch. Existing acceptance and Windows x64 / Apple Silicon macOS 14.5+ build paths remain required.

- Initial baseline review and canonical Windows CI execution: pending.
- Public app URL correction: pending Developer 2 integration.
- Public self-hosted font publication: pending merge/Pages publication.
- macOS native validation: not performed from this Windows machine.
- `npm run build`: passed on Windows (version check, TypeScript and Vite production build), unchanged application source at the base plus infrastructure changes.
- First sandboxed `npm test`: blocked before test collection by temporary-file rename `EPERM` in the sandbox. This is not recorded as a test pass.
- `npm test` rerun outside that sandbox restriction: **45 files / 242 tests passed**. Source: unchanged application at the base plus infrastructure changes; later edits affect only the separate Playwright harness and documentation.
- Visual tests use their own Vite port **1437**, avoiding the application's development port 1420 and other developers' sessions.
- Local Windows visual smoke: eight wide/light cases passed together; All goals then passed in an affected-case rerun after adding the missing voice-language fixture. All nine wide/light cases have captured successfully. The other themes/viewports, strict repeat comparison, canonical Windows CI capture and human review remain pending. Provisional local PNGs are not committed as reviewed baselines.
- Existing full acceptance and native installer builds have not been rerun for this infrastructure handoff. Their existing CI commands are preserved. No cross-platform release is claimed.

### Follow-up on 20 October 2026

- GitHub branch published: `https://github.com/ArtmarketVM/desktop_buddy/tree/codex/quality-gates`. Authentication required explicitly selecting the saved `ArtmarketVM` account because two GitHub accounts were present. No credentials were logged or committed.
- Local `npm run test:visual:candidates -- --workers=2`: **34 passed / 2 intentionally skipped** in generation and again in strict comparison, with zero different pixels. Both narrow collapsed-sidebar variants are skipped intentionally to keep the matrix at 34. Coverage: local Windows only, on base application source plus the paused-clock harness change. These local PNGs are not accepted as canonical Windows CI baselines.
- Full Windows acceptance invoked through `scripts/acceptance.ps1 --output .tools/acceptance/quality-gates`, with repository-local Cargo/Rustup and the installed MSVC developer environment: tooling 9 passed, versions passed, release checks 18 passed, TypeScript passed, bundle passed, Rust **603 passed / 2 ignored**. Frontend **241 passed / 1 failed** in this run, so this full acceptance attempt is not a pass.
- Developer 2 finding: `src/core/NoticedWork.test.tsx`, test "recovers noticed work, displays measured minutes, and lets the user rename it before confirmation", observed `Handle unrelated emails` submitted instead of `Reply to customer emails`. Earlier full `npm test` passed all 242 tests on identical application source. Investigate the initial suggestion/title effect and test scheduling before changing application logic or weakening assertions; this branch does not suppress or retry the failure automatically.
- macOS CI run `https://github.com/ArtmarketVM/desktop_buddy/actions/runs/39487091175` on `71d556390085dbe3e583da3c29098d5430633866`: acceptance and Rust formatting passed; Apple Silicon app/DMG build was still running at this checkpoint. Subsequent paused-clock changes affect browser test files only, so they do not invalidate this native source/dependency validation.
- Canonical Windows CI captures, their human review, and final CI job results remain to be recorded. Developer handoff is through this branch/document, as requested by the owner; no direct messages to other chats are required.
- macOS CI completed successfully: the run above passed acceptance (**242 frontend / 606 Rust passed, 2 Rust ignored**), formatting, and the Apple Silicon `.app` / `.dmg` validation build. Runner: macOS 15, Darwin 24.6.0 arm64; deployment target 14.5. This validates the CI build, not an installed, signed release or a manual test on macOS 14.5. Its lint report has 16 ESLint errors / 16 warnings and **79 unique Clippy/Rust warnings**, all visible and non-blocking.
- The failing Windows `NoticedWork` file subsequently passed all **5 tests** in isolation without source changes. Retain the original failure evidence and treat it as an intermittent finding for Developer 2; no automatic retries or changed expectations were introduced.
- Pages configuration independently verified through GitHub API: legacy publication, `main`, `/`, built successfully from `11760017314095d75374449690c2a1c42c5af08a`. Repeated `npm run verify:privacy` confirms the configured app URL still returns 404, canonical `/docs/privacy.html` returns 200, and the public page still references Google Fonts. Required actions remain Developer 2's constant change and publication of this branch's policy assets through the existing Pages source. No Pages settings were changed.
