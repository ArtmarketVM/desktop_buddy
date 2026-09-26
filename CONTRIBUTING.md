# Contribution conventions

Keep source, comments, UI, documentation, and commit messages in English.

## Commit messages

Use Conventional Commits: `type(scope): imperative summary`. The scope is optional. Prefer a small, coherent change that builds and passes its relevant tests.

| Type | Purpose |
| --- | --- |
| `feat` | New user-facing functionality |
| `fix` | Bug fix |
| `test` | Tests and test fixtures |
| `docs` | Documentation |
| `refactor` | Internal restructuring without changed behavior |
| `ci` | GitHub Actions and automation |
| `build` | Dependencies, packaging, and build configuration |
| `chore` | Maintenance that does not fit another type |

Examples: `feat(buddy): add draggable companion`, `fix(nebius): validate structured responses`, `docs: clarify demo setup`.

One feature commit may include its code, tests, and documentation. Do not split dependent files merely to use different prefixes. Mark breaking changes with `!` and explain them in a `BREAKING CHANGE:` footer.

## Validation and safety

- Run `npm test` and `npm run build` for frontend changes.
- Run `cargo test --locked --manifest-path src-tauri/Cargo.toml` and `cargo fmt --manifest-path src-tauri/Cargo.toml --check` for Rust changes.
- Keep API keys runtime-only. Never commit `.env`, copied credential files, databases, logs, installers, build output, or local toolchains.
- Keep simulated activity and mock provider responses explicitly labeled.
- Do not imply a paid/live integration was verified when only mock-server tests ran.

## Releases

Use a new version for every delivered installer: patch for fixes, minor for features. Synchronize `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`. Update `CHANGELOG.md` with user-visible changes and limitations. Do not replace an already delivered version with different code.

The `main` workflow builds Windows artifacts. A `v*` tag additionally publishes a GitHub Release; create a release tag only when intentionally publishing a release.

Commit and push only with project-owner authorization. Prefer smaller, frequent commits when multiple developers are collaborating.
