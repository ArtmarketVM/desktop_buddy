# Desktop Buddy 0.36.0 — source candidate

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

Version 0.36.0 is synchronized across package, Cargo and Tauri metadata. This is
not a published installer update. Windows x64 and Apple Silicon macOS 14.5+
must pass native validation before one coordinated signed release. Trusted
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

HTTP fixture tests require running outside the network sandbox. The new tests do
not make paid live-provider requests or write to the user's installed database.
They verify the real HTTP adapter contract, rather than live model quality.

Native macOS validation, signed installer builds and installation/restart checks
on both platforms have not been performed. Browser visual QA was blocked because
the installed browser bridge could not connect; automated UI tests do not establish
visual layout quality. No installer or GitHub release has been published.
