# Desktop Buddy session handoff

Read this first; verify current Git/release state. This is a factual handoff, not a permission grant.

## Current work (24 October 2026)

- Branch `codex/semantic-goal-observation`; upstream was fetched and reconciled before work. User requests general semantic observation/completion for arbitrary observable goals, plus new goal/step proposals requiring acceptance. Never auto-create goals/steps.
- Published **0.43.0**, source `c3bdeb9`. Both-platform CI40102714724 and signed release40105073289 passed. Public assets verified: 13 assets, 12 SHA-256 checksums, two updater signatures, four compatibility channels; `.tools/releases/public-verification-0430.json`. Do not replace delivered assets with different code.
- Installed `/Applications/Desktop Buddy.app` was last read as **0.42.2**. Saved observation, screenshot and automatic-completion toggles are already on; AI and goal sharing are enabled, pause off. No installed goals/settings have been changed by this task.
- **0.43.1 prepared**, not yet published. Immutable two-minute captured evidence survives ordinary permitted app switches and automatic focus/parking resets; collection and current matching remain strictly foreground-bound. Privacy boundaries, lock, collection errors, consent/goal edits and expiry cancel it. Image provenance uses the immutable packet. Literal citation matching tolerates layout whitespace while preserving case, punctuation, word order and source IDs. New proposals need acceptance and Undo remains durable.
- Details: [SEMANTIC_OBSERVATION.md](SEMANTIC_OBSERVATION.md); notes: [RELEASE_0.43.0.md](RELEASE_0.43.0.md), [RELEASE_0.43.1.md](RELEASE_0.43.1.md). Follow [RELEASE_PROCESS.md](RELEASE_PROCESS.md).

## Verification

- Real Nebius synthetic fixtures: **18/18**, 24 actual calls, six in-memory completions + Undo, two accepted proposals, ten negative cases. `.tools/semantic-validation/live-kimi.json`. Real shared chat corrected an old false screen-access denial; `.tools/semantic-validation/live-chat.json`. These validate bounded fixtures, not arbitrary real-world intent.
- **Native Apple Silicon rehearsal passed**: real Accessibility text, two actual window images, two real Nebius calls, actual in-memory completion and Undo. `.tools/semantic-validation/native-passed-0431.json`; UI displayed Verified. Only the invented public fixture was read; no installed goal/order changed. This does not establish unattended scheduler timing or physical Windows capture.
- Earlier native failures: context changes; a locked Mac correctly blocked collection; headless test needed workspace-event processing. Another run had all verifier outcome flags true but failed citation grounding. Original failed quote was not retained, so its exact mismatch is unknown. Layout-whitespace regression and subsequent native pass are recorded honestly in the audit.
- Final local Rust suite **702 passed / 2 intentionally ignored**. `/private/tmp/buddy-semantic-0431-final-tests.log`. Strict Clippy rerun after removing a redundant test clone: `/private/tmp/buddy-semantic-0431-final-clippy.log`. Final frontend build passed; existing **294 frontend tests** remain valid because frontend source did not change. No reviewed visual baseline changed.
- Both-platform CI40107181927 passed on intermediate `e4b85ef`, including debug/release lint and 34 images. Final focus/grounding/harness follow-ups still need exact-source CI before signed publication. Do not treat intermediate CI as proof of later Rust changes.

## Execution / preservation

- Internally signed candidate: external warm target `.tools/target-personal-ai/debug/bundle/macos/Buddy Semantic Audit.app` under `/Users/marky/.codex/worktrees/css-consolidation/dexktop_buddy`. Normal launch uses the immutable helper; no API keys exported, no ad-hoc signing or TCC reset. Native fixture `/private/tmp/BuddyNativeRehearsal.app`, title Buddy Semantic Fixture, contains retry and automatic synthetic confirmation.
- Reuse toolchain: `CARGO_HOME=$PWD/.tools/cargo`, `RUSTUP_HOME=$PWD/.tools/rustup`, Cargo bin on PATH; external warm target above, dev/test debug symbols off, two build jobs, deployment14.5. Do not create another large target cache.
- Preserve external worktree's unrelated `observation_check.rs` edit and local untracked `.DS_Store`, `docs/.DS_Store`, `docs/FOURTH_DEVELOPER_MAC_SETUP.md`, `docs/reports/`.
- GitHub repo `ArtmarketVM/desktop_buddy`. Default CLI account may be invalid: capture owner token via `gh auth token --hostname github.com --user ArtmarketVM` and pass only in process environment. Never print credentials. Use one `npm run ci:watch -- RUN_ID` per attempt; logs only on failures.
- User authorizes scoped commits/push/publication. Preserve signing identity and updater trust. Release both Apple Silicon macOS14.5+ and Windowsx64 together; no Intel/universal Mac packages. Do not claim complete delivery until both signed packages and public metadata verify.
