# Desktop Buddy 0.36.0 validation

- **Help me start** opens a voluntary Tiny Habits session from an unfinished goal
  or the full chat's goal picker. The selected goal and optional step are explicit.
- Coaching controls cover readiness, barriers, a 10–60 second suggested action,
  ease, an optional anchor, commitment and a user-reported result. Sessions survive
  restart and support pause, resume and stop; ordinary chat stays available.
- Real AI suggestions respect existing AI, sharing and memory settings. Invalid
  responses have one bounded repair attempt; provider failure leaves the saved
  step available for manual retry. Changed goals, privacy or sessions invalidate
  in-flight proposals. Providers never submit user replies or confirm completion.
- Result memory requires an explicit choice and the existing memory permissions.
  Completing a micro-action does not complete its goal or checklist. Conversation
  clearing, scoped forgetting and retention include coaching records.

Version 0.36.0 is synchronized across package, Cargo and Tauri metadata.
Windows x64 and Apple Silicon macOS 14.5+ must pass native validation before
one coordinated signed release. Trusted
updater keys, signature checks and the reviewed macOS identity are unchanged.

## Validation

Verified on Windows x64:

- `cargo test --locked --manifest-path src-tauri/Cargo.toml`: 531 passed,
  zero failed, two existing opt-in tests ignored. This includes eight new gateway
  tests using synthetic SQLite data and local HTTP fixtures.
- `npm test -- --exclude '.tools/**'`: 218 tests across 38 files passed. Only the
  ignored local historical checkout under `.tools` is excluded. Five new UI tests
  cover the complete structured flow, explicit entry, provider failure, in-flight
  pause and memory/target restrictions.
- `npm run build`: passed, including the synchronized-version check.
- `npm run test:release`: 18 passed; signing configuration and updater trust checks
  remain intact.
- Rust formatting and `git diff --check`: passed.

HTTP fixture tests require running outside the network sandbox. The automated tests do
not make paid live-provider requests or write to the user's installed database.
They verify the real HTTP adapter contract, rather than live model quality.

Native tests and signed installer validation run on both platforms through
`.github/workflows/release.yml`; consult that workflow run for the final delivery
result. Manual installation/restart checks on both platforms remain outstanding.
Browser visual QA was blocked because
the installed browser bridge could not connect; automated UI tests do not establish
visual layout quality. Signed release validation is tracked separately below.

## Release preparation

The first Windows and macOS CI runs passed their Rust suites, but acceptance
SEC-08 referenced a UI test removed during the previous Settings redesign. The
mapping now uses the existing forget-confirmation/cancel test, with the same
backend preservation test. A source-evidence regression guard prevents stale
frontend test names from silently breaking the acceptance report again.

`--check-coaching` is an explicit real-provider diagnostic using only a synthetic
in-memory goal and synthetic replies. It never opens the installed database.
Final signed-build and publication results are available in the release workflow
and the immutable `v0.36.0` release assets.
