# Personal AI observation validation — 0.40.0

## Scope and evidence

Implementation starts at upstream `7387877`, after release 0.39.4 and the second developer's cleanup. No production goals, chats, messages or screenshots were used in provider tests. Tests use synthetic English fixtures and an isolated in-memory database. Release/platform CI results must be checked separately; local macOS checks do not establish a Windows pass.

| Check | Recorded result |
| --- | --- |
| Frontend suite | 47 files, 232 tests passed |
| Frontend production build | Passed (TypeScript, Vite, synchronized manifests) |
| ESLint / Knip | Zero errors, warnings or unused-code findings |
| Rust full suite | 624 passed, 0 failed, 2 intentionally ignored; final changed-source verification also runs in CI |
| Local Clippy | Zero warnings/errors; Windows and release-mode validation remain CI gates |
| Real provider | Eight synthetic cases passed, without mock provider responses |

## Real-provider cases

1. Unlisted work classified through the existing workflow.
2. Fresh sent receipt accepted: 2440 ms.
3. Draft saved rejected as completion: 1378 ms.
4. Old sent-folder history rejected: 896 ms.
5. Quoted/example receipt rejected: 686 ms.
6. Real model signal, Rust completion and durable Undo: passed; classifier 1471 ms.
7. Synthetic image understood as a follow-up draft: 909 ms. API-reported model: `nvidia/Nemotron-3.5-Super-VL`.
8. Explicit personal knowledge saved through shared dialogue: one fact, 13874 ms.

A first run rejected the positive receipt because the model returned confidence 0.95 under an initial 0.98 threshold. The final threshold is 0.95 with both semantic flags, literal evidence and stale-state validation still mandatory; all negative cases remained rejected. Confidence is self-reported, not measured classification accuracy. These examples are regression evidence, not broad model-quality statistics.

## Resource measurements

A six-lane, 30-iteration synthetic benchmark measured full analytics snapshots at 38544 microseconds versus lightweight current-work snapshots at 13620 microseconds, with zero AI calls. This verifies reduced aggregation work, not battery savings. An installed 0.39.2 process baseline over 60 seconds observed mean CPU 9.2%, peak 53.7%, maximum resident memory 48848 KiB; the session was not a controlled idle or power comparison. No energy improvement percentage is claimed.

Observation disclosures are capped at 24 attempts per rolling hour per process; screenshots at one attempt per two minutes. Restart resets the in-process quota. Interactive chat is separate. Unchanged samples and the shared background lock suppress repeated calls. Models can still misclassify; opt-in, review and Undo remain necessary.

## Final-review corrections

The canonical Windows visual candidate job [39621146427](https://github.com/ArtmarketVM/desktop_buddy/actions/runs/39621146427) generated and strictly compared all 34 screenshots. The owner reviewed and approved all 34; provenance is in `visual/baselines/review.json`. Final source is compared to these baselines without regeneration.

Native review found that Accessibility's composite PID/hash identity is not a ScreenCaptureKit window number. Capture now resolves one unique window by owner, title and bounds and checks fresh foreground metadata around capture. Quartz session state and Windows input-desktop checks prevent disclosure in locked/secure sessions. The Windows zero-warning gate caught a constant-chunk iterator warning; the implementation was corrected without suppressing it. These findings required another source validation; earlier failed/superseded runs are not release passes.

The signed standalone Mac probe could not collect foreground metadata before system Accessibility authorization. No personal screen data or provider request was used. A local public Quartz probe confirmed an available, logged-in, unlocked console session; physical lock/unlock and permitted image capture are still manual items below.

## Native/manual acceptance checklist

- [ ] macOS public-fixture Accessibility and bounded capture with OS permissions.
- [ ] Physical Windows foreground capture and occlusion handling.
- [ ] Real Telegram, Gmail, WhatsApp Web and a previously unlisted app; no outgoing messages required.
- [ ] Screenshot OFF/ON/OFF during a request; exclusion, private window, pause, lock and foreground switch.
- [ ] Quiet mode suppresses bubbles without silently stopping permitted observation.
- [ ] Automatic completion opt-in, uncertain result review, Undo after restart and stale Undo rejection.
- [ ] New ongoing work versus verified completed work; Skip/Chat; no silent goal creation.
- [ ] Personal knowledge add/correct/edit/pin/forget, Memory OFF and inferred-pattern review.
- [ ] Three to six lanes; autoPark uses the lane being left; grounded daily review and no duplicated time.

Unchecked native/manual items are not represented as passed by synthetic tests or installer builds. Hidden/closed tabs and applications without usable system interfaces remain unavailable. Images are temporary and cannot authorize completion without a literal interface-text receipt. Pending offers do not survive restart; accepted results and journal facts do.
