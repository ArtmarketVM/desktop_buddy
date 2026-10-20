# Developer 2 quality integration

## Source and scope

- Shared-state work is already on main through PR #36, merge `aabbde1862761086a0691a73e1f60c8ad2b3a588`.
- Developer 3 handoff: `6f8ec632a074ca58fa8a430a980fc560c82f60ef`, read in `docs/QUALITY_GATES.md`.
- Infrastructure PR #37 retains every approved baseline and all blocking visual assertions. Integration fix `4df041a9c768e1603867d0944dc26db6f156269d` lets the paused test clock drain shared-query reads after mounting/navigation. The original harness timed out waiting for the sidebar because initial reads never ran. No production timing changed.
- Follow-up branch: `codex/dev2-quality-followup`. No CSS, selectors, dependencies, credentials, provider requests, signing, updater channels or release versions changed by this follow-up. Infrastructure dependencies and policy font assets remain Developer 3's changes.

## Application fixes

The Settings privacy action now opens `https://artmarketvm.github.io/desktop_buddy/docs/privacy.html`. Its behavioral test clicks the real Settings action and verifies the URL passed to the opener.

The intermittent NoticedWork failure was reproduced deterministically: an edit arriving when a cached offer first appeared was overwritten by its passive initialization effect. Each offer now initializes its form synchronously in a component keyed by offer ID. A duration refresh preserves edits; a different offer starts a fresh draft. Completing an older offer cannot clear a newer one. Regression tests retain the original renamed-title assertion and cover early edits, duration refresh and replacement during an outstanding confirmation. The new early-edit test failed with the original implementation, retaining the original title instead of the edit.

## Lint review

ESLint on the integrated source initially reported **16 errors / 15 warnings**. After this follow-up: **11 errors / 13 warnings**, with the gate still non-blocking. Full details: `.tools/quality/eslint.json` and `eslint-summary.json` (generated, not committed).

- Removed unused shared-state migration imports in Experience and the unused Conversation preference binding; preference observation remains active.
- Made App's theme effect depend on the exact scalar it reads. Removed the unused initial assignment in Settings privacy description parsing; both parse-success and parse-failure paths still assign it.
- Removed NoticedWork's effect dependency warning by fixing form ownership, rather than resetting edited text whenever a suggestion title changes.
- Reviewed the coaching gateway test's lock warning: an explicit `drop(inner)` preceded the await, but the lexical binding still triggered Clippy. The storage operations now occupy an explicit block ending before the HTTP evidence await.
- Remaining unused-variable findings are the existing memory metadata exclusion destructuring (six), Composer import (one), and GoalRow argument/local (two). The memory exclusions intentionally prevent server-managed metadata entering a save request; do not blindly spread the full context to silence lint. Broad unused-code cleanup stays separate.
- The two control-regex findings are deliberate rejection of control characters in custom roles and declared apps. Those validation protections remain intact.
- Remaining hook warnings concern activation-only voice recording cleanup, onboarding synchronization, exclusion-list value synchronization, carousel initialization, drag cancellation, stable popover refs and an allocated progress fallback. Adding all dependencies mechanically can restart recording or erase drafts/drag state. They remain visible for focused behavior changes with dedicated tests; no blanket suppressions or gate weakening were added.
- Other historical Rust warnings remain part of the non-blocking rollout; no broad Rust cleanup was attempted.

## Validation

Local frontend validation on Apple Silicon macOS: `npm ci`, **265 tests passed across 51 files**, and `npm run build` passed. Targeted settings, noticed-work, App and conversation tests also passed. The first-paint regression failed before the fix; its assertions were not weakened. `cargo fmt --manifest-path src-tauri/Cargo.toml` and `git diff --check` passed.

Locked Rust suite: **610 passed, 2 existing ignored**, 98.20 seconds of test execution, using the repository-local toolchain, target cache and profile overrides documented in `docs/SHARED_FRONTEND_DATA.md`. Log: `/tmp/sumi-dev2-rust.log`. Final targeted settings/notice rerun: **12 passed**.

The first local Rust invocation began a fresh target cache; it was stopped and rerun with the existing repository target cache and memory bounds documented in `docs/SHARED_FRONTEND_DATA.md`. This is not a test-failure retry.

Windows screenshot correctness is established only by the documented Windows CI environment. A local macOS harness probe reproduced the paused-clock loading failure; after draining reads, it reached the workspace and then encountered the intentionally unmocked macOS permission command. That local probe is not a Windows visual pass and did not regenerate any PNGs.

Final native CI, Rust lint/test counts, infrastructure merge, rebase and live privacy verification are recorded below when completed. No signed release, installation, updater exercise or manual Windows/macOS UI acceptance is implied by CI builds.
