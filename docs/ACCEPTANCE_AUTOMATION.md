# Ten phase acceptance automation

The runner connects every ID in [the ten phase checklist](TEN_PHASES_ACCEPTANCE_CHECKLIST.md) to named regression tests or explicit manual instructions. It executes the existing frontend suite, release verification, version check, TypeScript compilation, Vite build, and locked Rust suite, plus tests of the acceptance reporter. Tests use isolated databases, mocked frontend IPC, and local HTTP servers. The runner does not install or launch Buddy, alter the production database, invoke ignored live-account tests, publish a release, or call paid providers.

## Run the checks

Install the project's locked Node dependencies with `npm ci` and provide the normal Rust/native build prerequisites. Node 24 is the CI baseline. On macOS use Apple Silicon and Xcode Command Line Tools.

```sh
npm run test:acceptance
```

On Windows, when Visual Studio needs initialization or the repository-local Rust toolchain is used:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/acceptance.ps1
```

Preview coverage without executing any tests:

```sh
npm run test:acceptance:plan
```

Select a new workspace-local report directory:

```sh
npm run test:acceptance -- --output .tools/acceptance/my-run
```

An existing report directory is refused to prevent using stale test evidence. By default each run gets a timestamped directory under `.tools/acceptance/`, which is ignored by Git. Outputs include `report.md`, `report.json`, `frontend-results.json`, suite logs, and incremental `suite-progress.json`. The report records the source commit, dirty-tree status, app version, host platform, test counts, exact mapped evidence, and remaining verification. Do not include credentials in manual evidence.

## Interpret the report

| Result         | Meaning                                                                               |
| -------------- | ------------------------------------------------------------------------------------- |
| automated-pass | Every named test for the mapped deterministic contract passed on this host            |
| partial-pass   | Mapped tests passed, but the listed live/native checks are still required             |
| failed         | A required gate or named test failed, or expected test evidence was missing/ambiguous |
| blocked        | A suite could not start, a test was ignored/skipped, or evidence was not executed     |
| manual         | The item requires real devices, accounts, release artifacts, or a manual review       |

Exit code 0 means automated gates passed; it does not mean all 122 acceptance checks passed. Exit code 1 means failure, and 2 means required automated evidence was blocked. Plan-only mode returns 0 after validating the checklist mapping; its checks remain unexecuted. Original checklist boxes are never changed. A local Windows result does not establish macOS behavior or installer-build success.

Live microphone recognition, language support, actual Accessibility grants, real model understanding and account inference, usefulness of live searches, first installation, signed downloaded artifacts, and Update/restart still need their stated checks. Automation can verify related contracts without asserting that these device/account requirements passed.

## Continuous integration

The existing Windows and Apple Silicon macOS build workflows run `npm run test:acceptance` in place of their separate frontend, release, build, and Rust test commands. Rust formatting and native installer builds remain separate required steps. Acceptance reports are uploaded with `if: always()` as `acceptance-windows-x64` and `acceptance-macos-apple-silicon`, including when tests fail. CI reports are available only after these changes are committed and run on GitHub. Unsigned CI installer builds are not a published signed release or a native updater test.

## Maintain coverage

`scripts/acceptance-coverage.mjs` is the explicit mapping. Evidence selectors refer to a Rust test's unique function name, a frontend test's file and title, or an entire required suite. Multiple selectors for an item must all pass. Missing or duplicate evidence fails rather than falling back to a suite's overall success. A renamed, removed, added, or duplicate checklist ID must be reconciled with the mapping.

Run `npm run test:acceptance:runner` when changing parsing or reporting. Its regressions check missing/duplicate IDs, skipped tests, incomplete evidence, failure exit codes, and separation of partial coverage from complete acceptance. Keep live and hardware checks marked separately until real evidence exists. No installer version bump is needed for this test infrastructure change.

Four additional backend regressions cover the exact default memory limits with long UTF-8 entries, a seventh independent Park/Resume goal, ordinal references that include completed steps, and positive feedback reducing cooldown without crossing goal boundaries.
