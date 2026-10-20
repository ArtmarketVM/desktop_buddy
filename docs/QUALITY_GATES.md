# Quality gates and visual handoff

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

```powershell
npm ci
npx playwright install chromium
npm run test:visual:list
# Provisional local candidates; review before accepting any images.
npm run test:visual:update
# Strict comparison: missing images and diffs fail; never rewrite expectations.
npm run test:visual
npx playwright show-report
```

Canonical candidates: dispatch the existing **Windows build** workflow on this branch with `visual_candidates=true`. Download the `visual-windows-2022` artifact and inspect every candidate alongside the application at the recorded base. Capture twice in that same job: the second run must compare with zero differing pixels. Preserve the runner image/version artifact with the review record. Human reviewers must approve all 34 images before committing them under `visual/baselines/`. Never automatically approve snapshots from a pull request or hide changed areas with screenshot masks. Future updates use the same procedure and must explain each intentional visual change in the PR.

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

## Validation and outstanding work

Results are recorded here as checks complete. No installers, release versions, signing configuration, or updater trust keys are changed by this infrastructure branch. Existing acceptance and Windows x64 / Apple Silicon macOS 14.5+ build paths remain required.

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
