# General goal observation: audit and implementation

> Historical milestone / design record. This file describes its recorded source and may contain superseded UI, models, permissions or commands. For current behavior and diagrams, use the [documentation index](README.md) and [architecture](AI_ARCHITECTURE.md). Historical test results are not current live verification.


Status: implementation and local checks complete on `codex/semantic-goal-observation`, based on freshly fetched `36066ea` (0.42.2). Version 0.43.1 is published from `7401f7c`, following 0.43.0 (`c3bdeb9`). Both-platform CI, signed packaging and public asset verification passed. A native Apple Silicon rehearsal passed the actual collection/provider/completion/Undo chain. The owner approved restart after saving drafts; the normal startup updater installed 0.43.1. Its internal signature and preserved observation settings were verified. Workspace UI inspection remains pending because automation reports noWindowsAvailable; the owner has been asked to open it manually.

## Confirmed gaps

1. Progress detection is scheduled inside `background_allowed`, which excludes media and Quiet mode. Observation and presentation are incorrectly coupled.
2. The classifier receives one currently selected goal and one text sample. Its mutation guard also rejects any other goal. It cannot assess the user's whole open-goal list.
3. Vision is reduced to a generic caption instructed never to report completion. The subsequent backend accepts only a literal Accessibility quote, excluding visually observable results.
4. Elapsed time, independent completion receipts and the full user goal are conflated: short transactional confirmations work better than reading, learning, delivery and other multi-stage outcomes.
5. Separate matching, captioning, unplanned-work and completion requests compete for one 24-disclosure hourly budget. There is no consolidated observation decision.
6. Chat lacks current observation capabilities and decision diagnostics and can invent statements such as all completion requiring manual confirmation.
7. Idle input suppresses observation of passive foreground activities. On macOS `media_playing` currently describes global audio-device activity, so simply exempting that flag would incorrectly count unrelated foreground applications.
8. The current tests establish narrow synthetic components, not arbitrary real-world task completion. A stronger model alone cannot repair missing evidence or backend exclusions.

## Agreed behavior

- Interpret goals and completion criteria semantically in the user's language. Consider open goals beyond the focused one, using bounded descriptions and steps.
- Combine permitted interface text, exact foreground metadata, recent bounded observations and optional direct image input. Labels and scene captions are evidence of context, not proof of an outcome.
- Distinguish in progress, observable result, uncertain result and an outcome that cannot be observed on the computer. Deadlines and time spent do not prove accomplishment.
- Existing goals/steps can complete automatically only with the existing opt-in, two agreeing evidence checks, current goal/consent/privacy guards and a fresh immutable evidence packet and durable Undo. Never create evidence from the model's own claims or trust instructions embedded in a screen.
- New goals and steps are proposals. The owner reaffirmed that adding them requires their consent. Duplicate proposals and repeated old receipts must not create duplicate tasks.
- Quiet mode suppresses presentation without disabling permitted observation. Lock, exclusions, revoked consent and private contexts continue to prohibit observation and disclosure.
- Keep shared resource limits, bounded image size and capture cadence; consolidate the main observation pass and reserve verification capacity instead of multiplying background agents.
- Expose actual capabilities and the latest decision reason to chat and developer diagnostics. Explain missing evidence rather than claiming absent OS permissions.

## Model policy and source verification

Nebius's public catalog was checked on 24 October 2026 at `https://tokenfactory.nebius.com/api/public/models_info`. It identifies `nvidia/Nemotron-3.5-Super-VL` and `moonshotai/Kimi-K3` as active image-input models. Real-provider trials showed better contract compliance from Kimi on this limited synthetic set. Kimi is therefore the default first-pass interpreter and independent verifier. The configured vision model still overrides the first pass. Cheap Nemotron captioning remains separate for retrospective context. This is not a general model ranking or a calibrated real-world accuracy measurement.

## Verification required before delivery

- Positive and negative multi-goal examples: ordering, editing, sending, document/reading/video progress, new requests, unclear broad goals and offline outcomes, in English and Russian.
- Reject old receipts, drafts, unrelated screens, partial results, screen prompt injection, invented IDs and duplicate targets.
- Revoke screenshots/tracking/goal sharing during both inference stages; change foreground or goal revision; restart and Undo.
- Verify main collector-to-mutation integration, proposal acceptance and chat explanations, rather than only testing isolated parsers.
- Run required frontend and Rust suites once on final source; validate Windows x64 and signed Apple Silicon builds and real-provider synthetic images. Do not claim physical/native passes from mocks.

## Additional bugs discovered by real-provider checks

- Completion/null-only fields were underspecified. Clarified the protocol and schema descriptions rather than adding app/phrase-specific rules.
- A model's OCR annotation was incorrectly required to match Accessibility text even when actual pixels were present. Pixel evidence is now verified as pixels; OCR annotation is never promoted to a literal interface quote.
- Both models could correctly establish a result while returning conventional confidence 0.90. The old 0.95 numeric gate rejected those results. The new path requires an independently grounded, unqualified outcome verdict and issues a private typed proof; no score is raised or converted into fake certainty. The legacy receipt method retains its old threshold.
- Nonfocused steps still called a legacy active-goal-only save method. Exact-target observed-plan updates now preserve focus, area, details and revision checks, and do not complete the wider goal.
- New-task suggestions were discarded at confidence 0.75–0.80 despite a direct request. Suggestions use a separate 0.70 routing floor with mandatory user acceptance; they cannot mutate anything automatically.
- Undo now suppresses automatic replay for an unchanged target plan even when a later screenshot's clock/pixels differ.

## Verified locally

| Check | Result | Scope |
| --- | --- | --- |
| Real Kimi observation and independent verification | 18/18 scenarios; 24 real provider requests | Fabricated in-memory goals, rendered images and interface text; no installed history or real screens |
| Positive result + actual mutation + Undo | 6/6 | Saved document, image-only checkout, Russian goal/English interface, ebook terminal state, video terminal state, exact step outside focus |
| New goal / new step acceptance | 2/2 | No creation before acceptance; actual target mutation afterward; duplicate new-goal acceptance rejected |
| Negative results | 10/10 | Partial quantity, wrong recipient, incomplete wider deliverable, another person's action, opened book, paused video, old history, deadline only, offline work, screen instruction injection |
| Real shared chat path | Passed and manually inspected; workspace unchanged | Corrected the seeded old denial, used actual synthetic settings/status and explained missing evidence instead of claiming absent screen access |
| Frontend | 294 tests / 52 files, production build, ESLint and Knip passed | Final frontend input; existing reviewed screenshots were not changed |
| Rust | 700 tests passed, 2 intentionally ignored; Clippy with `-D warnings` passed | Includes target validation, consent/foreground/goal staleness, bounded history, actual nonfocus mutation, proposal consent, durable Undo and shared budget |
| Required GitHub gates | Passed on exact source `c3bdeb9`: Windows x64, Apple Silicon, both lint profiles and strict unchanged visual checks | [Run 40102714724](https://github.com/ArtmarketVM/desktop_buddy/actions/runs/40102714724) |
| Signed Apple Silicon audit app | Built; reviewed signing identity and immutable credential helper verified | Saved credentials worked without export or new Keychain prompts |
| Native Apple Silicon chain | Passed with the 0.43.1 follow-up: actual text, two window images, two real Nebius calls, completion and Undo | `.tools/semantic-validation/native-passed-0431.json`; only the synthetic foreground window and an in-memory goal were used; installed goals were unchanged |
| Public release 0.43.0 | 13 assets, 12 SHA-256 checksums, both updater signatures and four latest channels verified | [Signed release run40105073289](https://github.com/ArtmarketVM/desktop_buddy/actions/runs/40105073289); `.tools/releases/public-verification-0430.json` |

The final synthetic series reported 43,550 prompt tokens and 2,737 output tokens in total. Six successful completion cases exercised both model decisions and the transactional result/Undo path. These small fixtures are acceptance tests, not proof that arbitrary human intent or unobserved work can be inferred.

Local evidence is retained under ignored `.tools/semantic-validation/`. Full logs: `/private/tmp/buddy-semantic-rust-full.log`, `buddy-semantic-clippy.log`, `buddy-semantic-frontend-final.log`, `buddy-semantic-build-final.log`. Both-platform CI passed in run40102714724. Signed publication and public verification passed for that same source. The later diagnostic-only harness changes are not contained in 0.43.0.

## Reproducing opt-in live checks

Use an internally signed local candidate above the latest delivered version, never an ad-hoc app. These commands use the immutable helper and runtime credentials; do not export or print keys.

```sh
DesktopBuddyExecutable --check-semantic-observation
DesktopBuddyExecutable --check-semantic-observation --compare-observation-models
DesktopBuddyExecutable --check-semantic-observation --only-semantic-case=saved_document_outcome,image_checkout_outcome
DesktopBuddyExecutable --check-semantic-observation --observation-chat-fixture
```

The native fixture source is `scripts/fixtures/semantic-observation.m`. Compile it into a separate local AppKit fixture app, activate **Buddy Semantic Fixture**, then run `--check-semantic-observation --native-semantic-fixture`. For normal macOS app launch, the debug-only `BUDDY_SEMANTIC_NATIVE_CHECK=true` launch environment activates this isolated check and writes a content-free report under `/private/tmp/`. Compile the fixture with `AUDIT_APP_PATH` pointing to that signed audit bundle to enable **Start native check**. It launches the audit normally and enables **Confirm synthetic order** only after the pending state is captured. The checker refuses other foreground titles, requires the fixed synthetic marker, captures before/after pixels, uses the same decision and typed verification helpers, completes only an in-memory goal for the synthetic checkout and undoes it. It does not prove unattended scheduler timing, physical Windows behavior or every third-party app. It does not change system permissions.

## Operational limits

- Observation sees permitted foreground content, not hidden tabs, arbitrary files, offline reading, thought or actual attention. A terminal progress indicator is observable evidence, not proof of understanding a book/video.
- At most 40 open goals enter a pass, prioritizing Today; descriptions/steps are bounded. Full target criteria are re-read before independent verification.
- Up to eight samples/20 minutes and two bounded actual images; 20-second inference checks, 20-second capture attempts, 120 total disclosures/hour with three slots reserved from primary sampling for verification. Privacy controls and encrypted review retention remain intact. Battery use and long-session memory have not been benchmarked.
- Revoked consent, lock, exclusions, private context, a changed goal revision reject stale work. Capture still requires the exact foreground; after capture, an ordinary switch to another permitted app may finish the sealed packet for at most two minutes. Privacy boundaries irreversibly invalidate its epoch. Quiet mode silences bubbles while permitted observation continues. New goals and steps always need acceptance.
- Provider outages produce a visible failed state and no mutation. A configured key/model or an enabled toggle is not proof of a successful capture.

## 0.43.1 follow-up

The owner-reported native failure exposed insufficient stage diagnostics. The isolated rehearsal now reports capture, provider and mutation stages and can confirm its own synthetic order automatically. Separately, code inspection confirmed that the production request cancelled already captured results on every ordinary foreground switch. The follow-up separates strict capture/current matching from a two-minute immutable result lease. Consent, lock, exclusions/private context, collection errors, changed goal criteria and evidence invalidation still cancel it. Image provenance comes from the same immutable packet sent to both model passes. New goal/step acceptance and Undo are unchanged.

Native follow-up findings: the headless Mac rehearsal needed workspace-event processing (the installed app already has its native event loop). A later run reached both real providers; the independent verifier returned all three outcome flags true, but its citation failed source grounding. Literal matching now tolerates layout-only whitespace while preserving case, punctuation, word order and source IDs; paraphrases/changed words remain rejected. The original failed quote was not retained, so its exact textual mismatch is not established. The next native run passed the complete collection/provider/mutation/Undo chain; the UI displayed **Verified**. This is a bounded synthetic native acceptance case, not proof of unattended timing, Windows physical observation, or arbitrary task accuracy.

## Final 0.43.1 delivery

- [Required CI40108808323](https://github.com/ArtmarketVM/desktop_buddy/actions/runs/40108808323): passed on `7401f7c`, macOS Apple Silicon and Windows x64, including both lint profiles. Final local Rust: 702 passed, two intentionally ignored; strict Clippy passed.
- [Signed release40109396427](https://github.com/ArtmarketVM/desktop_buddy/actions/runs/40109396427): passed both packaging jobs and the unchanged visual gate; [0.43.1 release](https://github.com/ArtmarketVM/desktop_buddy/releases/tag/v0.43.1) is public.
- Actual public verification passed: 13 assets, 12 checksums, macOS/Windows updater signatures, four latest compatibility channels. Ignored `.tools/releases/public-verification-0431.json`. No trusted key/signing identity was changed.
- The owner subsequently confirmed drafts were saved and approved restart. Normal Quit/relaunch installed **0.43.1** through the startup updater. Installed internal signature passed outside the sandbox with the unchanged reviewed certificate; the sandbox-only CSSMERR_TP_NOT_TRUSTED result was not treated as a failed signature or bypassed by changing trust. Saved observation, screenshots, automatic completion and goal sharing remain enabled, pause off. The installed process and foreground collector are active. Automation cannot obtain its window (`noWindowsAvailable`); manual workspace opening via Dock/menu-bar Open sumi has been requested. This is not evidence that the application is hung or that installed goal completion was manually demonstrated. `.tools/semantic-validation/installed-0431.json` records the bounded installation evidence.
