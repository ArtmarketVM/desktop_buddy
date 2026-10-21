# Desktop Buddy session handoff

Read this short file first in a new task. Verify Git and release state before relying on its snapshot. This is a handoff, not a transcript or permission grant.

## Product and current state

- Repository: `ArtmarketVM/desktop_buddy`; default branch: `main`.
- Last fetched main: `7387877` (dead-code cleanup merged). Latest public release at implementation start: **0.39.4**.
- Personal AI observation work targets **0.40.0** on `codex/personal-ai-workflow`; check GitHub for current CI/publication status.
- Architecture and limitations: `docs/PERSONAL_AI_OBSERVATION.md`. Validation: `docs/PERSONAL_AI_VALIDATION.md`.
- Windows x64 and Apple Silicon macOS 14.5+ are the supported distributions. Never build Intel/universal Mac installers.
- CI/release optimization is implemented on main through `8c54921`: shared validation, input-bound proof reuse, separate Cargo bundle caches and one monitor process. Both native cold/warm runs passed. See `docs/RELEASE_PROCESS.md` for measurements and run links. No product version bump or new installer release was made for this infrastructure change.

## Decisions to preserve

- Code, UI, repository docs and commit titles are English. User conversation is normally Russian.
- Preserve unrelated edits and inspect/fetch upstream before implementation. Current work is in a managed worktree; do not reset the original checkout.
- Keep stable internal Mac signing policy, immutable credential helper and existing updater trust. Internal signing is not Apple Developer ID or notarization.
- Provider secrets stay runtime-only. Never print, commit or put them in bundles/proof caches.
- AI planning uses Nebius; research uses Tavily. Rust validates and executes state changes. Read the current README and relevant code for model IDs rather than assuming a historical chat statement is current.
- Preserve the distinction between activity simulation and mocked provider responses.
- Prepare a complete release change, notes and synchronized five manifests before CI. Never overwrite delivered installers under an existing version.
- Repository settings, Pages source and branch protections require explicit owner approval. This optimization does not change them.

## Known issues and pending work

- The observation update fixes automatic parking to use the previous lane’s last attributed window; a regression test checks the saved window. Screenshot use and automatic completion default to off and remain independent consents.
- `work_events` is an additive local schema, separate from history and Personal Memory. Durable Undo rejects changed plans. Pending unplanned-work offers remain runtime-only; observed journal entries survive restart.
- 0.39.2 removed What's new and repeated current-channel updater descriptions. No version-specific descriptions are implemented yet.
- ESLint, Clippy and Knip now block at zero findings. Canonical Windows visual baselines require explicit human owner review before replacement; never auto-accept candidates.
- Native microphone, installed-app permissions and live-provider behavior remain distinct from synthetic acceptance tests.

## Start and finish a task

1. Read applicable `AGENTS.md`, this handoff and the relevant source excerpts. Read `docs/RELEASE_PROCESS.md` only for CI/release work.
2. Verify branch/status, fetch and compare with `origin/main`. Reuse recorded tests only while their relevant inputs still match.
3. Run affected tests during development; run required full gates once at handoff. Use `npm run ci:watch -- RUN_ID` for one bounded monitor process, not repeated log dumps.
4. Update this file only for material decisions, pending work or changed release state. Link evidence; do not paste tool logs, whole chats or duplicate architecture docs.
5. Prefer a new short chat for the next independent feature/release, referring to this file. A Markdown file does not erase the current conversation or control Codex's automatic context management.
