# Efficient validation and release process

## Workflow ownership

`ci.yml` classifies changes and calls the same platform/visual validation used by `release.yml`. Ordinary CI does not build installers. `platform-checks.yml` owns Windows x64 and Apple Silicon checks; `visual-checks.yml` owns the strict reviewed Windows browser matrix. The old automatic Windows/macOS installer workflows are removed.

- Ordinary Markdown/text changes: workflow-policy checks and the aggregate gate; no Node dependency install, Rust compilation or screenshots. The acceptance checklist is an explicit exception.
- Frontend/application changes: both platform acceptance reports and applicable screenshots. CSS does not invalidate matching Rust test evidence.
- Backend, embedded role data, dependency, build-policy or toolchain changes: affected Rust evidence is invalidated. Unknown changes conservatively schedule validation; an unavailable diff schedules all gates.
- Rust lint keeps the existing non-blocking policy, runs for changed Rust inputs and is outside the signed release dependency chain. It consumes the already-built frontend from the same CI run.
- Explicit `validate_installers=true` on Application checks builds unsigned validation packages on both systems. Do not install an unsigned Mac candidate: its credential helper cannot read saved keys.
- A real release always builds and verifies both signed update packages once. It cannot publish until both platform and visual gates succeed.

## Evidence and trust

The cache is not itself a green check. Scripts verify content/environment keys and receipt schema before using its results. Receipts identify the producing commit, run URL, date and counts; reused suites retain their provenance and ignored tests.

The keys bind tracked file paths, executable modes and bytes, the validation policy/workflows, lockfiles, actual Rust/Node versions, OS/architecture, hosted runner image, deployment/debug flags and a weekly bucket. Receipts expire after seven days. Corrupt, missing, failed, future-dated, stale or mismatching evidence falls back to running checks. No partial-prefix match is allowed for successful-test evidence.

Only trusted `main` runs save successful-check receipts. PRs can consume applicable default-branch evidence but cannot save reusable proof. GitHub's ref-scoped caches keep untrusted PR writes out of the main release path. No `pull_request_target` execution or secret sharing with PR checks is introduced.

Rust fingerprints exclude only the application's synchronized version fields. Dependency versions, all Rust/native source, configuration, scripts and embedded role JSON remain significant. Version consistency always runs separately; a new release's binary is still compiled, version-pinned, signed and verified.

Full validation also binds the exact production frontend and acceptance report bytes. Packaging may suppress Tauri's repeated frontend build only after verifying those bytes and matching inputs. It changes only `beforeBuildCommand`; updater verification, signing policy and native compilation remain intact.

Visual reuse binds the reviewed fixtures/baselines, frontend inputs and Windows environment, plus the successful Playwright JSON report. Generation of provisional candidates never certifies or overwrites approved baselines automatically.

Per-commit/per-platform concurrency serializes overlapping CI and release validation. The second run can consume the first successful result instead of simultaneously running identical checks. Caches are expendable: deletion or eviction makes the pipeline slower, not less strict.

## Rust compilation

Cargo caches have stable platform/target namespaces shared between CI and releases. Workspace artifacts are retained; Cargo still decides what needs recompilation. Saving compiled artifacts and proof is restricted to main. Only CI dev/test debug symbols are disabled; test assertions and release optimization/signing settings are unchanged. No new local Rust target directory is required for routine frontend work.

Non-blocking Clippy compilation is separate from the signed release path. Both platform Rust tests, formatting, the full 122-item acceptance mapping and immutable helper/signature checks remain available. Automated acceptance does not establish the manual/live parts of that checklist.

## Prepare a complete release once

1. Complete feature/fix work and targeted tests. Update relevant docs and known limitations.
2. Write English notes beginning with `# Desktop Buddy X.Y.Z`; no TODO/TBD placeholders.
3. Run `npm run release:prepare -- X.Y.Z --notes-file PATH`. It validates the notes and updates all five version manifests together. It performs no Git operations, network publication or signing.
4. Review the diff and run affected local checks once. Commit/push only within the user's authorization; preserve unrelated files.
5. Dispatch **Publish Windows and macOS release**, `release_tag=vX.Y.Z`, from main. Preflight requires a new version, completed notes and synchronized manifests. Applicable trusted proofs are reused; misses run the normal acceptance suites.
6. Run `npm run ci:watch -- RUN_ID` once. It emits only stage changes, waits one minute between requests and retries temporary monitoring failures with bounded backoff. A monitoring failure means the outcome is unknown, not that the build failed. Read detailed logs only for failures or an explicit diagnostic need.
7. After success, verify the actual public version, both channels and asset/signature/checksum results once. Record source/results and stop. Documentation-only follow-ups do not require repeating application tests or installers.

Do not change Pages/protection settings, trusted signing keys or approved screenshots to make a release pass. Do not bump the app version or publish a new installer merely for CI/documentation work.

## New sessions and cost measurement

Start the next independent task with `docs/SESSION_HANDOFF.md` and the concrete request. Keep that file short and link detailed evidence instead of storing chat transcripts. This reduces repeated discovery in fresh sessions; it does not remove the existing chat from Codex's context or guarantee a billing reduction. Codex manages conversation context itself.

Measure cold and warm runs separately: wall time, number of test/packaging executions, proof hits/misses and runner/cache conditions. Record token/cost figures only from actual client/provider usage; CI duration is not a token bill. Do not promise a fixed speedup or percentage without measurements.

## Validation of this infrastructure change

Local workflow syntax/expression checks use checksum-pinned actionlint 1.7.12. CI regression tests cover selective gates, input changes, version normalization, binary integrity, expiry/failure rejection, preserved ignored tests, report/frontend corruption, monitoring and release preparation. Native cold/warm and packaging checks are pending until their run links/results are recorded here.

## References

- GitHub cache scope and immutability: https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching
- Cargo cache behavior: https://github.com/Swatinem/rust-cache
- Codex project instructions: https://learn.chatgpt.com/docs/agent-configuration/agents-md
- Keeping material session context: https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex
