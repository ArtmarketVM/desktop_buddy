# Repository conventions

- Keep all code, comments, UI text, documentation, and commit messages in English.
- Bump the release version for every delivered installer update. Keep package.json, package-lock.json, Cargo.toml, Cargo.lock, and tauri.conf.json synchronized; never replace a delivered installer with different code under the same version. Use patch releases for fixes and minor releases for new features.
- Deliver every product change for both macOS (Apple Silicon, macOS 14.5+) and Windows. Keep shared behavior consistent, implement each required platform adapter, and validate both builds before publishing one GitHub release with the same version for both systems. The user has authorized committing and publishing these completed updates. If a signing key or platform requirement blocks either system's update, report the blocker and do not describe the release as a complete update for both systems. Never weaken update signature verification or change trusted signing keys to bypass a blocker.
- macOS releases are Apple Silicon only. Never build or publish Intel or universal Mac installers. Preserve Windows x64 support.
- Preserve the reviewed macOS app-signing identity in `src-tauri/macos-code-signing.json`. Never regenerate it per developer/build or fall back to ad-hoc signing for a delivered release. Internal signing is not Apple Developer ID signing or notarization; updater signing keys remain independent.
- After a meaningful milestone, suggest a GitHub commit and an appropriate English commit title. Do not commit or push without user authorization.
- When two developers are collaborating, suggest smaller and more frequent commits so changes can be shared promptly.
- Keep provider keys runtime-only. Never commit `.env`, embed keys into frontend bundles, or log credentials.
- Preserve the distinction between simulated activity (`DEMO_MODE`) and mock provider responses (`AI_MOCK`). Production integrations must use real HTTP calls.
- Before handing off Rust changes, run `cargo test --locked --manifest-path src-tauri/Cargo.toml` when Windows build prerequisites are available. Run `npm test` and `npm run build` for frontend changes.

- Follow `docs/UI_LAYOUT.md` for screen layout: one shared column, one title position, aligned right edges, shared callouts and switches.

## Efficient execution

- Keep work scoped to the request. Do not add unrelated improvements.
- Read only relevant files and excerpts. Re-read unchanged content only when needed.
- Prefer targeted searches and concise tool output over full-file or full-log dumps.
- Batch independent read-only checks when practical.
- Avoid rapid polling. For long-running commands, use 30–60 second waits where supported.
- Do not repeat successful checks unless relevant code, dependencies, or environment changed.
- Preserve all required tests and safety checks; efficiency must not reduce verification quality.
- For commit/push-only requests, inspect the relevant diff and Git state, reuse valid test results, perform authorized Git operations, and verify success once.
- After repeated identical failures, investigate the cause instead of blindly retrying.
- Keep progress updates brief. Final responses should summarize results, verification, and blockers without repeating the plan.
- Stop when the requested outcome is verified. Suggest optional next steps without executing them.

## Local macOS test builds

- Install only internally signed local builds: the credential helper refuses an ad-hoc signed app, so unsigned builds (`BUDDY_MACOS_UNSIGNED=true`) cannot read saved Nebius/Tavily keys and every AI feature fails. Sign with the ignored identity in `.tools/signing/internal-macos/` via `scripts/internal-macos-signing.sh` and a temporary `--config` that sets `bundle.macOS.signingIdentity` (no updater key needed for a local `.app`).
- The startup update is mandatory: a local build whose version is below the latest GitHub release replaces itself on launch. Keep the branch version above the latest published release while testing locally.
