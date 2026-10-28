# Reliable completion detection and explanations

Status: proposed implementation plan, not implemented.
Prepared: 28 October 2026.
Reviewed remote baseline: `origin/main` at `156716c`, including release source `97e00d5` (0.48.0).
The checkout was fast-forwarded from `fa8d746` to `156716c` before the subsequent cadence change, preserving this plan.

## Cadence follow-up requested on 28 October

The working change sets the minimum capture interval, semantic observation interval and shared Accessibility text-cache lifetime to 20 seconds. The 120-disclosure hourly budget, three verification slots, evidence lease and consent controls remain unchanged. This implements the requested cadence adjustment only; persistent diagnostics, the full short-result fixture matrix and the other delivery stages below remain planned. The 60/120-second timings in the incident evidence describe the released 0.48.0 baseline.

## Objective

Make a short, observable work result lead to either a correctly grounded completion proposal, a verified automatic completion when permitted, or a useful explanation of why neither occurred. Preserve consent, exact-target validation, quiet-mode behavior and Undo. Do not equate opening, generating, downloading or spending time with satisfaction of an arbitrary goal.

## Evidence and remaining uncertainty

- In the reported Windows episode on 27 October around 20:35, activity history recorded a browser page with an image-creation title. The previously selected goal was still active at 20:33:50; the image goal was selected at 20:34:20; another application became foreground at 20:34:59.
- The approximately 39-second interval after selection is not proof of the entire observation opportunity. Semantic observation considers a bounded catalog of open goals, not only the selected goal. The activity log's selected-goal label is not a model attribution or a completion verdict.
- Native inspection after the episode showed screenshots and automatic completion off, tracking and completion suggestions on. This establishes the inspected configuration, not an immutable record of every setting at 20:35.
- The existing scheduler checks at most once per 60 seconds; permitted image captures have a global 120-second minimum interval. Accessible text is bounded and cached. There is no download-completed event feeding this observation path.
- Automatic completion off does not disable completion proposals. Its absence cannot by itself explain a missing confirmation question.
- The model event journal is process-local (latest 200 events). The following morning's stale-context rejection and inference error are not evidence of the previous evening's decision. Exact historical root cause remains unverified.

## Changes already delivered in 0.48.0

| Upstream change | Consequence for this work |
| --- | --- |
| First-launch AI initialization enables screenshots and automatic completion in new databases | Test fresh and existing profiles separately. Never enable these settings silently for an existing user. Without tracking must still prevent observation. Credentials and OS access remain independent. |
| Three-card onboarding and guided setup goal | Reuse the onboarding capability disclosures; do not add a second onboarding flow. |
| `OnboardingCompletion` intervention, durable milestone responses and setup/planning coordination | Instrument the shared delivery queue without breaking setup milestones, deadline priority, snooze or daily-planning suppression. A setup milestone is not evidence that semantic completion works. |
| Preserved existing-profile screenshot/completion defaults | An upgrade alone does not repair the reported configuration. Explain its consequences in the existing settings UI. |
| 0.48.0 release and two-platform validation | Reuse unchanged evidence appropriately, but run new affected checks for implementation. Do not replace the published installers. |

The upstream `vision.rs` change only adjusts a test fixture for new defaults. It does not implement a new capture policy. Semantic observation, its sealed evidence lease and process-local diagnostics are not replaced by this release.

## Delivery sequence

### 1. Capture the failure boundary before changing detection

Add a bounded local record that connects observation scheduling, evidence availability, interpretation, verification, state mutation and notification delivery through an attempt ID.

- Record UTC timestamps, application version, session ID, target IDs/revision when known, trigger category, evidence modality/counts, elapsed time and enumerated outcomes.
- Distinguish disabled/paused/private/locked, cooldown, unchanged evidence, busy worker, budget exhaustion, inaccessible text, capture failure, provider timeout/error, invalid response, incomplete evidence, stale target/context, queued, suppressed, displayed, expired, accepted and undone.
- Use explicit outcome codes, not raw provider errors or free-form model explanations. Store no screenshots, interface text, titles, URLs, prompts, credentials or response bodies. Resolve target labels from current local goals only when displaying them.
- Record attempt transitions and meaningful gate changes, not every collector tick. Proposed retention: at most 2,000 records and seven days, shortened by the user's history policy. Clear with local history and relevant goal deletion; existing privacy revocation invalidates pending work. Do not recreate deleted history.
- Preserve unfinished-attempt identity across restart and label it interrupted; never convert it into success. Closing the app must not erase the reason for an earlier non-completion.
- Store metadata on the normal backend worker path; do not block native collection or UI events on database writes. Test migrations from an existing profile.

Primary areas: `engine_observability.rs`, `semantic_observation.rs`, `observation.rs`, `vision.rs`, `companion/screen_context.rs`, `companion/queue.rs`, storage initialization/history cleanup and `src/ai/PersonalAiEngine.tsx`.

Acceptance: after a restart, a developer can distinguish "no evidence collected", "model did not establish a result" and "a result was established but the notification was suppressed" for a known attempt without recovering screen contents.

Suggested commit: `Persist bounded completion attempt diagnostics`.

### 2. Reproduce the short image-result workflow on the current baseline

- Build a disposable native/browser fixture: in-progress image generation, finished image, optional save/download confirmation, then a foreground switch. Include a broader goal whose criterion is not met by the same image.
- Exercise a fresh 0.48.0-style profile and an existing profile with screenshots/automatic completion off. No production goals, browser history or provider credentials enter fixtures.
- Replay timing intervals of 15, 39 and 75 seconds, prior capture in an unrelated window, goal creation/selection during the workflow, and worker contention. Selection alone must neither authorize completion nor exclude another open goal.
- Cover screenshot and accessible-text evidence separately, including an image with no useful accessible description. Use real provider requests only in explicitly selected live acceptance runs; mock regression results are not model-quality evidence.
- Inspect the existing Windows UI Automation limits (200 ms, traversal bounds, first text result) and macOS Accessibility sampling. If the result region is missed, improve selection within the consented foreground window on both systems and add fixtures for toolbar-only, stale and empty text.

Acceptance: report each failed stage and its observed cause. The original episode must remain "historical cause unknown" unless actual historical evidence is recovered.

Suggested commit: `Cover short visual completion workflows across platforms`.

### 3. Reduce missed result transitions within the existing privacy and cost limits

Use the reproduced failures to adjust scheduling and evidence freshness, not confidence thresholds by guesswork.

- Prioritize new or changed goal criteria, meaningful foreground/content transitions and newly available evidence. Coalesce repeated triggers and retain the existing single background request lane and hourly budget, including reserved verification capacity.
- Prevent an unrelated window's recent capture from silently consuming the only useful opportunity to inspect a result in the current task. Define a bounded, debounced priority capture for materially new context; retain periodic observation as fallback. Measure request/capture counts before finalizing the policy.
- Never capture a previous window after it ceases to be foreground, monitor arbitrary Downloads files, or treat a window disappearing as completion. Cross-platform event adapters, if needed, must feed the same shared policy.
- Reuse the existing sealed evidence packet and two-minute lease after an ordinary permitted switch. Do not rebuild that already shipped mechanism. Privacy changes, lock, private/excluded windows and changed target criteria continue to invalidate evidence.
- Do not suppress useful new evidence merely because the window title is unchanged. Avoid repeated inference on an unchanged image or text sample.

Acceptance: a permitted, sufficiently informative 39-second fixture result reaches interpretation and the intended outcome path on both platforms. A 15-second result either works within the bounded capture policy or has an explicit recorded sampling limitation. No inference-per-tick behavior or unbounded retry loop is introduced.

Suggested commit: `Prioritize fresh outcome evidence within observation budgets`.

### 4. Separate result recognition, completion consent and delivery

- With automatic completion off, an adequately grounded result candidate offers confirmation and leaves the saved goal unchanged until acceptance.
- With automatic completion on, retain the two independent grounded checks, exact target/revision validation and transactional Undo. A provider failure or missing evidence never becomes an automatic completion.
- Distinguish a positively contradicted/incomplete result from a grounded but unresolved candidate. Only the latter may justify a cautious confirmation question; missing evidence alone must not produce speculative completion spam.
- Trace whether the proposal reached the queue and was displayed. Distinguish quiet mode, hidden companion/full-screen policy, chat-open suppression, deduplication, expiry and higher-priority interventions. Do not bypass user suppression to make a test pass or replay stale prompts after quiet mode ends.
- Keep the 0.48.0 onboarding milestone path, ten-minute snooze, deadline behavior and daily-planning coordination intact. Add regressions for coexistence with actual-work completion prompts.

Acceptance: each eligible result produces at most one valid prompt or one verified state mutation; each suppression is explainable. Decline, restart, Undo and target edits cannot cause duplicate or stale completions.

Suggested commit: `Explain and validate completion proposal delivery`.

### 5. Explain limitations in the existing UI

- In Privacy settings and goal-related diagnostics, show what observation can currently use: interface text, screenshots, provider readiness and automatic completion policy. "Text only" must not imply the generated image was inspected.
- Offer concise statuses such as `Waiting for result evidence`, `Could not read this window`, `Waiting for AI`, `Needs your confirmation` and `Notification hidden by Quiet mode`. Map these from backend codes; do not ask the model to invent a diagnosis.
- Add a recent-attempt history under the existing Diagnostics panel with date, local time, target, stage and reason. Keep technical details out of normal goal creation and onboarding.
- Route any user action to the existing consent controls. Do not automatically turn screenshots or automatic completion on for an existing profile.
- Follow `UI_LAYOUT.md` and `TYPOGRAPHY.md`; use the shared layout and typography tokens.

Acceptance: a user can distinguish observation disabled, insufficient evidence, AI failure and hidden notification. Tests must cover fresh defaults and retained legacy opt-outs.

Suggested commit: `Show actionable completion observation status`.

## Required scenario matrix

| Scenario | Required result |
| --- | --- |
| Generated image visibly satisfies a simple saved goal | Confirmation when automatic completion is off; independently verified completion when on |
| Screenshots off, image-only result, no useful interface text | No invented completion; a text-only/insufficient-evidence status |
| Screenshots off, exact current textual result establishes the goal | Text-only recognition remains possible; do not make screenshots universally mandatory |
| Old image, quoted example, cancelled generation, unrelated download or partial broader goal | No automatic completion or misleading success notification |
| Goal not focused but in the open-goal catalog | Assess the actual target without inheriting the selected goal blindly |
| Catalog truncation or a changed/deleted target | Explain the limitation/reject stale work; never mutate another goal |
| Ordinary switch after evidence capture versus privacy boundary crossing | Finish only the valid sealed packet; invalidate at the privacy boundary |
| Busy worker, timeout, invalid schema, exhausted budget or inaccessible text | Explicit reason, no hidden success, bounded retry behavior |
| DND, quiet hours, hidden companion, full-screen suppression, chat open, onboarding prompt | Respect delivery policy and record the actual disposition |
| Restart, duplicate receipt, decline and Undo | Retained diagnostics; no duplicate prompt or automatic replay |
| Windows x64 and Apple Silicon macOS 14.5+ | Same product semantics with actual native text/capture validation |

## Verification and release boundaries

1. Before implementation, fast-forward or otherwise reconcile the clean checkout with the reviewed remote baseline; fetch again if work begins later. Preserve other developers' work and suggest small commits at the milestones above.
2. Run targeted backend/frontend tests during each change. Include privacy revocation, migrated preferences, diagnostic retention/deletion, budget/cancellation, valid result leases and queue coexistence.
3. On the final source, run `npm test`, `npm run build`, required lint checks and `cargo test --locked --manifest-path src-tauri/Cargo.toml`; run independent frontend/backend checks concurrently when resources permit. Record source hashes and reuse successful unaffected checks.
4. Perform native synthetic and real-provider acceptance on both platforms. Report exact success counts, failures, latency and request/capture counts; do not generalize a small fixture set into a real-world accuracy claim. Separately reproduce the real ChatGPT workflow with user-approved screen sharing to Nebius.
5. Follow `RELEASE_PROCESS.md` for an authorized release: synchronized new version, notes, both signed packages, CI watcher once per run and actual published-asset verification. Select the next available version at release preparation; do not reissue 0.48.0 or weaken signing trust.

## Scope and completion criteria

This plan adds diagnostic persistence and fixes observed scheduling/evidence/delivery gaps. It does not promise arbitrary download monitoring, universal completion recognition, a browser extension, a new provider or a new onboarding flow.

The work is ready for delivery when the fixture matrix passes, both platforms have native evidence, a failed attempt remains explainable after restart, existing consent choices survive, and the real image workflow either produces the correct prompt/result or identifies the observed limiting stage without inventing a cause.
