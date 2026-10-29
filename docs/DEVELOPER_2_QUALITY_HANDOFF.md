# Developer 2 quality integration

> Historical milestone / design record. This file describes its recorded source and may contain superseded UI, models, permissions or commands. For current behavior and diagrams, use the [documentation index](README.md) and [architecture](AI_ARCHITECTURE.md). Historical test results are not current live verification.


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

`npm run lint:rust` completed with **0 errors / 78 unique warnings, exit 0**, and no `clippy::await_holding_lock` finding. The first attempt reported that the repository-local toolchain lacked Clippy (exit 1); it was not counted as a clean result. Installed that toolchain's Clippy component, then generated `.tools/quality/clippy.jsonl` and `clippy-summary.json` with the documented script. The test lock warning is resolved; other warnings remain visible.

## Validation

Local frontend validation on Apple Silicon macOS: `npm ci`, **265 tests passed across 51 files**, and `npm run build` passed. Targeted settings, noticed-work, App and conversation tests also passed. The first-paint regression failed before the fix; its assertions were not weakened. `cargo fmt --manifest-path src-tauri/Cargo.toml` and `git diff --check` passed.

Locked Rust suite: **610 passed, 2 existing ignored**, 98.20 seconds of test execution, using the repository-local toolchain, target cache and profile overrides documented in `docs/SHARED_FRONTEND_DATA.md`. Log: `/tmp/sumi-dev2-rust.log`. Final targeted settings/notice rerun: **12 passed**.

The first local Rust invocation began a fresh target cache; it was stopped and rerun with the existing repository target cache and memory bounds documented in `docs/SHARED_FRONTEND_DATA.md`. This is not a test-failure retry.

Windows screenshot correctness is established only by the documented Windows CI environment. A local macOS harness probe reproduced the paused-clock loading failure; after draining reads, it reached the workspace and then encountered the intentionally unmocked macOS permission command. That local probe is not a Windows visual pass and did not regenerate any PNGs.

No signed release, installation, updater exercise or manual Windows/macOS UI acceptance is implied by CI builds.

## Infrastructure merge and rebase

Infrastructure PR #37 merged as `713c31611fd6c04c146e9403fc3f7b9db5ebbb7c` after strict Windows visual comparison (**34 passed / 2 intentionally skipped**), Windows acceptance/native build and Apple Silicon macOS acceptance/native build all passed. Reviewed PNGs were not updated. The approved baseline source is unchanged; the buddy harness also waits for module readiness before advancing its clock because that window deliberately renders no root content before its initial read completes.

The Developer 2 follow-up rebased cleanly onto that main commit. Application source trees are identical to those validated locally: `src` = `ce3f203cc8bf224840d6601414edabd1410381f1`, `src-tauri` = `e7a83cbbb87385e11114a8dfbd3b905d524375fc`. No application tests were repeated merely because rebase changed commit IDs.

The first live privacy check immediately after the merge returned HTTP 200 but correctly failed because Pages was still serving the older Google Fonts policy. Pages settings were left unchanged.

After Pages reported `built` for `713c316` at 20:51:38 UTC on 20 October 2026, `npm run verify:privacy` passed: configured canonical URL HTTP **200**, `matchesLocalPolicy: true`, `externalFonts: false`. Direct requests to all three referenced local WOFF2 font files also returned **200**. This confirms the live page/assets; it does not claim an installed app has already received the corrected link.
