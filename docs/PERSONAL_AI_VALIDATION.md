# Personal AI observation validation — 0.40.0

> Historical milestone / design record. This file describes its recorded source and may contain superseded UI, models, permissions or commands. For current behavior and diagrams, use the [documentation index](README.md) and [architecture](AI_ARCHITECTURE.md). Historical test results are not current live verification.


## Scope and evidence

Implementation starts at upstream `7387877`, after release 0.39.4 and the second developer's cleanup. No production goals, chats, messages or screenshots were used in provider tests. Tests use synthetic English fixtures and an isolated in-memory database. The final release source is `aee23f443cf784878242639ad5b740963b0b9b8a`. Both platform gates and signed installer publication passed; native desktop checks are distinguished from CI below.

| Check | Recorded result |
| --- | --- |
| Frontend suite | 47 files, 232 tests passed on each supported platform |
| Frontend production build | Passed (TypeScript, Vite, synchronized manifests) |
| ESLint / Knip | Zero errors, warnings or unused-code findings |
| Rust full suite | macOS arm64: 624 passed; Windows x64: 621 passed; zero failures and two intentionally ignored on each platform |
| Clippy | Zero warnings/errors, debug and release modes on both platforms |
| Visual regression | All 34 owner-approved baselines passed strict comparison |
| Tooling / release checks | 10 tooling tests and 18 release/signature tests passed |
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

The signed Mac probe passed after the owner granted Accessibility and Screen Recording and activated the synthetic fixture window: interface text was available and a bounded image was captured (39952 base64 bytes). There were zero cloud requests; image data was discarded without being printed or saved. Normal LaunchServices launch was required for correct macOS permission attribution; direct executable invocation did not establish the same application identity. A public Quartz probe confirmed an available, logged-in, unlocked console session. Physical lock/unlock remains untested.

## Published and installed verification

- [Trusted main validation](https://github.com/ArtmarketVM/desktop_buddy/actions/runs/39626567132): passed for the release source on both platforms.
- [Signed release workflow](https://github.com/ArtmarketVM/desktop_buddy/actions/runs/39627337841): passed, including macOS arm64 and Windows x64 packaging and publication.
- [Public 0.40.0 release](https://github.com/ArtmarketVM/desktop_buddy/releases/tag/v0.40.0): includes both installers and signed updater assets; no Intel or universal Mac build.
- This Mac updated from 0.39.4 through the normal Update & restart flow. Both installed bundle metadata and Settings → About show 0.40.0.
- Installed app signature and immutable credential helper verification passed on the host. Sandboxed trust-store checks are not substituted for host verification. Internal signing is not Apple notarization.
- Installed Settings → Privacy showed tracking Running, Accessibility Granted, screenshots OFF and automatic completion OFF. Nebius and Tavily showed Connected; NVIDIA Nemotron showed Model listed. Connection indicators alone do not prove inference; the eight real-provider cases above provide separate inference evidence. User settings were not changed.
- The two ignored Rust checks require chargeable provider credentials or an isolated native credential-store write environment. They are not counted as passes. A physical Windows desktop session and the remaining manual checklist are not covered by installer CI.

## Native/manual acceptance checklist

- [x] macOS public-fixture Accessibility and bounded capture with OS permissions.
- [x] Installed macOS updater, 0.40.0 About screen, stable app/helper signatures and default-OFF observation controls.
- [ ] Physical Windows foreground capture and occlusion handling.
- [ ] Real Telegram, Gmail, WhatsApp Web and a previously unlisted app; no outgoing messages required.
- [ ] Screenshot OFF/ON/OFF during a request; exclusion, private window, pause, lock and foreground switch.
- [ ] Quiet mode suppresses bubbles without silently stopping permitted observation.
- [ ] Automatic completion opt-in, uncertain result review, Undo after restart and stale Undo rejection.
- [ ] New ongoing work versus verified completed work; Skip/Chat; no silent goal creation.
- [ ] Personal knowledge add/correct/edit/pin/forget, Memory OFF and inferred-pattern review.
- [ ] Three to six lanes; autoPark uses the lane being left; grounded daily review and no duplicated time.

Unchecked native/manual items are not represented as passed by synthetic tests or installer builds. Hidden/closed tabs and applications without usable system interfaces remain unavailable. Images are temporary and cannot authorize completion without a literal interface-text receipt. Pending offers do not survive restart; accepted results and journal facts do.
