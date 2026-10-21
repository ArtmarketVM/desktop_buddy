# Desktop Buddy session handoff

Read this short file first in a new task. Verify Git and release state before relying on its snapshot. This is a handoff, not a transcript or permission grant.

## Product and current state

- Repository: `ArtmarketVM/desktop_buddy`; default branch: `main`.
- **0.41.0 is published for both supported platforms**: [release](https://github.com/ArtmarketVM/desktop_buddy/releases/tag/v0.41.0). Source/tag: `883b6c14582b3938e2af9d2239941935dd04c3f1`, merged through [PR #47](https://github.com/ArtmarketVM/desktop_buddy/pull/47).
- [Main validation](https://github.com/ArtmarketVM/desktop_buddy/actions/runs/39687383493) and [signed publication](https://github.com/ArtmarketVM/desktop_buddy/actions/runs/39688319644) passed, including publish. Frontend: 243 tests per platform; Rust: 649 macOS / 646 Windows passed, two intentionally ignored each; 34 approved visual comparisons; debug/release Clippy and zero lint gates passed. Acceptance retains 11 manual and 55 partial items; automated reports do not establish those manual scenarios.
- Public asset signatures and SHA256SUMS passed after download. Current Windows epoch 3 and separate macOS epoch 1 channels return HTTP 200 and version 0.41.0. Windows transition channels retain exact published 0.13.0 / 0.17.1 / 0.23.1 manifests, verified by the release verifier. No trust epoch or compatibility file changed.
- Published Apple Silicon app verified: version 0.41.0, arm64 only, minimum macOS 14.5, pinned internal signature and immutable credential helper. This is internal signing, not Apple Developer ID/notarization.
- **Physical update/restart not verified for 0.41.0**: this Mac was locked during final updater testing and the installed app was last observed at 0.40.0. No Windows computer or remote installation was available/confirmed. Downloaded-package verification is not an installed-app test. Prior 0.40.0 native observation/provider validation remains documented separately.
- `npm run verify:privacy` passed after publication: configured app policy returns HTTP 200, matches local policy and uses no external fonts.
- Architecture and limitations: `docs/PERSONAL_AI_OBSERVATION.md`. Validation: `docs/PERSONAL_AI_VALIDATION.md`.
- Windows x64 and Apple Silicon macOS 14.5+ are the supported distributions. Never build Intel/universal Mac installers.
- CI/release optimization (shared validation, input-bound proof reuse, separate Cargo bundle caches, one monitor process) is described with measurements in `docs/RELEASE_PROCESS.md`.

## Decisions to preserve

- sumi copy uses active, user-centred language about concrete activity; avoid passive "time recorded" formulas and inferred completions. See `docs/SUMI_TONE_OF_VOICE.md`; the current source applies the rule to coaching and mascot templates.
- Code, UI, repository docs and commit titles are English. User conversation is normally Russian.
- Preserve unrelated edits and inspect/fetch upstream before implementation. Current work is in a managed worktree; do not reset the original checkout.
- Keep stable internal Mac signing policy, immutable credential helper and existing updater trust. Internal signing is not Apple Developer ID or notarization.
- Provider secrets stay runtime-only. Never print, commit or put them in bundles/proof caches.
- AI planning uses Nebius; research uses Tavily. Rust validates and executes state changes. Read the current README and relevant code for model IDs rather than assuming a historical chat statement is current.
- Preserve the distinction between activity simulation and mocked provider responses.
- Prepare a complete release change, notes and synchronized five manifests before CI. Never overwrite delivered installers under an existing version.
- Repository settings, Pages source and branch protections require explicit owner approval. This optimization does not change them.

## Current notification implementation

- Implementation branch `codex/mascot-notification-rules` started at `aeb1dd4cad5ce9d6a2171756ad61f983a3e80dff` and is merged. Worktree: `desktop_buddy-ci-docs`. A documentation-only follow-up records final release verification; it does not change the published app or installers.
- Policy and limitations: `docs/MASCOT_NOTIFICATIONS.md`. Removed OS notification delivery/plugin and retired proactive help/research/focus warnings. Working-hours/weekday controls are removed; Plan Today follows the first launch/open of each local day (including startup/resume), while summaries use an independent Nudges time setting defaulting to 18:00. Quiet hours (including overnight) and whole quiet weekdays are user-configurable; activity-based messages otherwise follow activity; Quiet mode forces resting with no bubbles or proactive toasts and leaves local tracking running; planning includes due-today goals; deadlines have before/now/after phases and explicit rescheduling; stretches use a saved interval; day-end summaries use factual local progress. Context buttons are primary, Chat secondary; existing poses follow message purpose.
- Deadline delivery uses a compact SQLite setting (`deadline_deliveries`) keyed by goal/current deadline and phase bits, separate from the bounded general-card history. No screen excerpts or goal titles are stored there; completed/deleted/changed deadlines are pruned on reservation.
- A single transient mascot queue now handles planning, deadline phases, completion/new-step/unlisted-work questions, stretches and medium-confidence goal matching. Priority: deadline now → completions/results → summary → other deadlines → activity/goal-match questions → stretch → planning. Scheduled producers submit all eligible candidates before selection. The old matching-toast producer is removed. Valid displaced cards can resume; already-shown planning never resurfaces without explicit Not now. Queue validation covers expiry, current phase, goal/focus/revision, consent and live source offers. Delivery/deduplication reservations are atomic and retryable on storage failure. Duplicate questions coalesce without extending expiry; no global cooldown/quota.
- Manual Quiet mode plus optional quiet hours/days is the only global silence control. The legacy global snooze command/state/UI is removed and saved `buddy_snooze` is ignored. Exclusions still prohibit observation/disclosure but allow unrelated reminders over the app. Media playback is not a blocker. Activity questions have a bounded input-pause courtesy delay (five seconds idle or ten seconds maximum wait); stretches/completions/timed cards do not wait for typing. An open mascot chat and detected meetings defer eligible cards. **Detected meeting time counts toward stretching, including no-input call time, without resetting the interval.** Only General’s `hide_fullscreen` switch controls fullscreen presentation, including chat; legacy blockers are inert. No changes to credentials, privacy/redaction sources or signing trust.
- Planning Not now persists one +30-minute reminder; ignoring either bubble schedules nothing. Daily planning/summary dates are durable independently of generic history rollover. Quiet clears all pending cards. Late deadline wording names its actual due time instead of saying “due now.” The summary still requires the app running within five minutes of the selected time and pending cards expire; it is not a later backlog.
- Local validation: `npm ci`, `npm test` (47 files / 243 tests), `npm run build`, `npm run lint`, `npm run lint:unused`, `npm run test:release` (18), `npm run test:acceptance:runner` (10), `cargo fmt`, full locked Cargo tests (649 passed / 2 ignored) and all-target Clippy passed. Main CI ran both native platform suites and debug/release Clippy successfully; linked above. Two renamed Rust test references in acceptance metadata were corrected without relaxing assertions.
- The owner reviewed all 34 annotated canonical Windows screenshots and explicitly approved: "all good - publish" (2026-10-21). Exact captures from [run 39682447958](https://github.com/ArtmarketVM/desktop_buddy/actions/runs/39682447958), source `44aeb854edb14dee2bae54c5de16d361921b22f7`, are recorded with hashes in `visual/baselines/review.json`. No application source changed after capture. Strict comparisons passed on PR, main and release.
- Public verification commands: `node scripts/verify-release.mjs <download-directory> v0.41.0`; `shasum -a 256 -c SHA256SUMS.txt`; `node scripts/macos-code-signing.mjs <extracted-app>`; `verifyHelper(<app>/Contents/Helpers/BuddyCredentialAccess)` from `scripts/credential-helper.verify.mjs`. All passed. All five public latest-download manifest URLs matched the downloaded release assets byte-for-byte. Local evidence: `../work/release-0.41.0-public/`; CI logs: `../work/release-0.41.0-{approved,main,publish}-watch.log`.

## Known issues and pending work

- The observation update fixes automatic parking to use the previous lane’s last attributed window; a regression test checks the saved window. Screenshot use and automatic completion default to off and remain independent consents.
- `work_events` is an additive local schema, separate from history and Personal Memory. Durable Undo rejects changed plans. Pending unplanned-work offers remain runtime-only; observed journal entries survive restart.
- 0.39.2 removed What's new and repeated current-channel updater descriptions. No version-specific descriptions are implemented yet.
- ESLint, Clippy and Knip now block at zero findings. Canonical Windows visual baselines require explicit human owner review before replacement; never auto-accept candidates.
- `rust-lint` also runs release-profile Clippy, because code gated on `not(debug_assertions)` is invisible to debug lint and tests; 0.39.3's first release run failed on exactly that. Do not delete release-only Rust code as unreachable without that check passing.
- Native microphone and full real-app end-to-end scenarios remain distinct from the passed observation/provider fixtures. Do not infer those passes from CI. Screenshots and automatic completion were verified OFF in the installed app; do not enable them without the user’s consent.
- The native audit required normal LaunchServices launch for correct macOS permission attribution. Avoid repeated permission requests based solely on direct executable invocation. Temporary audit bundle registration shares the production identity; do not reset TCC or remove that registration blindly.

## Start and finish a task

1. Read applicable `AGENTS.md`, this handoff and the relevant source excerpts. Read `docs/RELEASE_PROCESS.md` only for CI/release work.
2. Verify branch/status, fetch and compare with `origin/main`. Reuse recorded tests only while their relevant inputs still match.
3. Run affected tests during development; run required full gates once at handoff. Use `npm run ci:watch -- RUN_ID` for one bounded monitor process, not repeated log dumps.
4. Update this file only for material decisions, pending work or changed release state. Link evidence; do not paste tool logs, whole chats or duplicate architecture docs.
5. Prefer a new short chat for the next independent feature/release, referring to this file. A Markdown file does not erase the current conversation or control Codex's automatic context management.
