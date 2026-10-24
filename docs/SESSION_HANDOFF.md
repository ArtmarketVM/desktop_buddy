# Desktop Buddy session handoff

Read this file first. Verify Git/release state before relying on this snapshot. It is not a permission grant or a transcript.

## Current work (24 October 2026)

- Branch `codex/semantic-goal-observation`, freshly fetched base `36066ea` matched `origin/main` before implementation. Latest published/installed release remains **0.42.2**. Prepared manifests/notes are **0.43.0**; not published or installed yet.
- Request: repair general goal observation and automatic completion, rather than a video-specific rule. New goals/steps must be proposed and added only after user acceptance (explicitly reaffirmed).
- Audit, implementation, limitations and reproducible live commands: [SEMANTIC_OBSERVATION.md](SEMANTIC_OBSERVATION.md). Architecture: [PERSONAL_AI_OBSERVATION.md](PERSONAL_AI_OBSERVATION.md). Release notes: [RELEASE_0.43.0.md](RELEASE_0.43.0.md).
- General goal-aware text/image history now feeds a shared interpretation pass. Existing-goal outcomes need two grounded decisions and a private typed verification proof; full criteria, stale-state/privacy guards, transactional history and Undo remain. Nonfocused goals/steps preserve focus. New goals/steps require acceptance. Quiet mode and passive media no longer suppress observation. Chat receives real observation capabilities/status. Kimi defaults to interpretation/verification; cheap Nemotron retrospective captions remain separate.
- Native macOS audio IO is scoped to the foreground app and executable helpers inside its bundle, avoiding global background audio. Physical passive-media behavior is not established by synthetic Rust tests.

## Verified / pending

- Real Nebius final fixtures: **18/18**, 24 real calls; six actual in-memory completions + Undo, two accepted proposals, ten negative outcomes. Provider-reported totals: 43,550 input / 2,737 output tokens. Ignored `.tools/semantic-validation/live-kimi.json`.
- Real shared chat fixture: corrected a seeded false screen-access denial, accurately explained enabled capabilities/missing evidence; manually inspected; workspace unchanged. `.tools/semantic-validation/live-chat.json`.
- `npm test`: **294/52 files**; build, ESLint, Knip passed on final frontend. `/private/tmp/buddy-semantic-*-final.log`.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml`: **700 passed, 2 intentionally ignored**; Clippy all targets `-D warnings` passed. `/private/tmp/buddy-semantic-rust-full.log`, `/private/tmp/buddy-semantic-clippy.log`. Small later native app-family handling compiled in the signed audit app; CI must validate exact final source on both platforms. Later finite-score/empty-case guards passed all 12 targeted semantic tests. Debug-only normal-launch native harness was compiled and signed afterward; final CI must cover it.
- Internally signed Apple Silicon audit app built and helper verified. Saved credentials work without exporting keys or repeated Keychain prompts. No installed app changes.
- **Native foreground acceptance is not passed.** Direct CLI launch was denied despite the Settings switch displaying on; normal app launch passed Accessibility. Owner renewed the existing grant. Manual active-window rehearsal remains pending; do not reset TCC or weaken privacy guards. Synthetic fixture app `/private/tmp/BuddySemanticFixture.app`, title **Buddy Semantic Fixture**, source `scripts/fixtures/semantic-observation.m`. A new `/private/tmp/BuddyNativeRehearsal.app` has Start native check and enables confirmation after capture, removing the activation race. Native test refuses other windows and changes only an in-memory goal.
- Both-platform CI, strict unchanged 34-image validation, signed packaging and public-release verification remain pending. No approved baselines were modified. Do not claim a complete delivered update before those gates pass.

## Execution / preservation

- Follow [RELEASE_PROCESS.md](RELEASE_PROCESS.md); reuse valid checks and run `npm run ci:watch -- RUN_ID` once per CI attempt. No repeated whole-suite runs for docs-only follow-ups.
- Existing local toolchain: `CARGO_HOME=$PWD/.tools/cargo`, `RUSTUP_HOME=$PWD/.tools/rustup`, prepend Cargo bin. Reuse external warm target `/Users/marky/.codex/worktrees/css-consolidation/dexktop_buddy/.tools/target-personal-ai` with dev/test debug symbols off, two jobs, deployment target14.5. Avoid another large cache. Script `/private/tmp/buddy-build-semantic-audit.sh` builds/signs only the separate test app.
- Preserve the external worktree's unrelated `observation_check.rs` edit. Preserve pre-existing local untracked `.DS_Store`, `docs/.DS_Store`, `docs/FOURTH_DEVELOPER_MAC_SETUP.md`, `docs/reports/`; exclude them from scoped commits.
- Use the reviewed internal macOS identity and immutable credential helper; never ad-hoc sign an install. Preserve updater trust. No Intel/universal Mac packages.
- GitHub default CLI account may be invalid. Obtain owner token with `gh auth token --hostname github.com --user ArtmarketVM` in captured process memory, pass as `GH_TOKEN`; never print it. Attach every created PR. Current repository: `ArtmarketVM/desktop_buddy`.
- Previous published release: [0.42.2](https://github.com/ArtmarketVM/desktop_buddy/releases/tag/v0.42.2), source `c95ad4e`; signed release run `40042159216`, required checks `40041430807`. Both platforms and public assets/signatures were verified. The installed app remains untouched by this task.
