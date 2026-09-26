# Repository conventions

- Keep all code, comments, UI text, documentation, and commit messages in English.
- Bump the release version for every delivered installer update. Keep package.json, package-lock.json, Cargo.toml, Cargo.lock, and tauri.conf.json synchronized; never replace a delivered installer with different code under the same version. Use patch releases for fixes and minor releases for new features.
- After a meaningful milestone, suggest a GitHub commit and an appropriate English commit title. Do not commit or push without user authorization.
- When two developers are collaborating, suggest smaller and more frequent commits so changes can be shared promptly.
- Keep provider keys runtime-only. Never commit `.env`, embed keys into frontend bundles, or log credentials.
- Preserve the distinction between simulated activity (`DEMO_MODE`) and mock provider responses (`AI_MOCK`). Production integrations must use real HTTP calls.
- Before handing off Rust changes, run `cargo test --locked --manifest-path src-tauri/Cargo.toml` when Windows build prerequisites are available. Run `npm test` and `npm run build` for frontend changes.
