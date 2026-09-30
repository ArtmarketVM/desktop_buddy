# Repository conventions

- Keep all code, comments, UI text, documentation, and commit messages in English.
- Bump the release version for every delivered installer update. Keep package.json, package-lock.json, Cargo.toml, Cargo.lock, and tauri.conf.json synchronized; never replace a delivered installer with different code under the same version. Use patch releases for fixes and minor releases for new features.
- After a meaningful milestone, suggest a GitHub commit and an appropriate English commit title. Do not commit or push without user authorization.
- When two developers are collaborating, suggest smaller and more frequent commits so changes can be shared promptly.
- Keep provider keys runtime-only. Never commit `.env`, embed keys into frontend bundles, or log credentials.
- Preserve the distinction between simulated activity (`DEMO_MODE`) and mock provider responses (`AI_MOCK`). Production integrations must use real HTTP calls.
- Before handing off Rust changes, run `cargo test --locked --manifest-path src-tauri/Cargo.toml` when Windows build prerequisites are available. Run `npm test` and `npm run build` for frontend changes.

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
