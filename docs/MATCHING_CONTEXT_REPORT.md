# Goal-matching context verification

Date: 2026-10-20. Baseline commit: `80b0c94` (the preceding desktop/UI fixes). This is a source change; no installer was delivered or release published.

## Payload and sampling

The production matcher now includes browser `domain` and `page_title` (160-character limit), plus `visible_text` (400-character limit). Missing values are null. Visible text requires the existing `screen_task_detection` preference and uses completion detection's native Accessibility path, with password/edit-control skipping, sensitive-window/password-manager exclusions, and the same secret-line redaction before truncation.

Completion detection and matching share one serialized read and a memory-only cache, reusable for 60 seconds for the same window ID, app, title and browser context. Consent changes and opt-out invalidate it; reads are rechecked after sampling. Goal/checklist lifecycle changes preserve the window sample. Matching also rechecks context after credential access, immediately before constructing its request. No confidence thresholds, matching debounce/cooldown/cache timings, or completion-check scheduling changed. `credentials.rs` and native screen-reading adapters are unchanged.

The CLI supplies fixture text through the same redaction/request builder, simulating an opted-in sample without reading the desktop. Optional fixture page titles and nullable visible text are supported. Tracking/privacy documentation and the existing settings disclosures reflect the new payload.

## Real Nebius comparison

Both runs used the same **10 placeholder cases**, not the future 60-case hand-labelled corpus. Fixture SHA-256: `c010a94c9e1121e56fb858af2f9ae84c8a9c451f6806d811748913a23df9a2bc`. Model: `nvidia/nemotron-3-super-120b-a12b`. Neither run used AI_MOCK.

| Run | Accuracy | False-positive rate | False-negative rate | Provider errors |
| --- | --- | --- | --- | --- |
| Before | 90.00% | 0.00% | 25.00% | 0 |
| After (final) | 100.00% | 0.00% | 0.00% | 0 |

Exact final output lines:

```text
Before: Accuracy: 90.00%
After:  Accuracy: 100.00%
```

An intermediate after-change run returned 90.00% on the same placeholder corpus and request payload. Its one missed positive had confidence 0.75 and remained below the unchanged 0.8 threshold. The final run accepted it. These small, variable synthetic scores do not establish a reliable real-world accuracy gain.

Saved, ignored JSON reports:

- Before: `src-tauri/test-data/results/matching-20261020T132217.671652000Z.json`
- Final after: `src-tauri/test-data/results/matching-20261020T133642.744857000Z.json`
- Intermediate after runs: `src-tauri/test-data/results/matching-20261020T132742.797502000Z.json` (90.00%) and `src-tauri/test-data/results/matching-20261020T133047.795143000Z.json` (100.00%).

Commands: `cargo fmt --manifest-path src-tauri/Cargo.toml`, `cargo test --locked --manifest-path src-tauri/Cargo.toml -- --test-threads=4`, then `cargo run --locked --manifest-path src-tauri/Cargo.toml -- --check-goal-matching`. On this Mac, plain unsigned cargo execution cannot locate/use the reviewed credential helper. The real runs used an ignored Cargo target runner to put the newly built binary into a temporary, internally signed diagnostic bundle with the unchanged reviewed helper and certificate-bound requirements. No credential values were printed or copied to fixtures, and the installed application and production database were not changed.

## Regression evidence

- Locked Rust suite: **582 passed, 2 existing ignored**, including `companion_provider_sends_only_explicit_context_and_rejects_incomplete_responses`.
- Wiremock checks domain/page-title presence, Unicode title limits, visible-text null with opt-out, the 400-character cap, instruction-isolation wording, and omission of `api_key` lines and their canary values.
- Six shared-sampler regressions cover single-read reuse, expiry/window changes, concurrent consumers, unavailable samples, opt-out/exclusions, consent changes during reads, redaction across the cutoff, and goal edits during a read without a duplicate Accessibility sample. They inject synthetic samples; no live screen reads occur in cargo tests.
- Existing matching thresholds/cadence and credential source were preserved. Native Accessibility behavior on Windows was not exercised on this macOS host.

Frontend disclosure checks: **232 tests passed in 43 files**, and `npm run build` passed. Rust formatting and `git diff --check` passed.
