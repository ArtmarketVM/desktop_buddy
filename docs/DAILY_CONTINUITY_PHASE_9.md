# Phase 9: Daily continuity and adaptive memory

## Implementation

`src-tauri/src/continuity.rs` builds deterministic reports from SQLite. Nemotron selects the read skill and resolves real goal IDs; Rust validates IDs, permissions, state version and the requested view. The final continuity answer bypasses free-form generation. The model cannot add accomplishments to this answer.

The `inspect_continuity` read skill supports:

| View | Example request | Recorded facts |
| --- | --- | --- |
| `priorities` | What matters now? | Today membership, explicit focus and priority, open lanes, checkpoints, next actions, pinned explicit preferences and confirmed results from the last seven local calendar days |
| `yesterday` | Where did I stop yesterday? What did I finish yesterday? | Yesterday's completion events and meaningful events, plus the last checkpoint known on or before that day, with its actual timestamp |
| `waiting` | What awaits a reply? | Saved waiting dependencies, excluding completed checkpoints |
| `remaining` | What remains for Hackathon? | One validated goal's current unfinished steps and saved next action |
| `end_of_day` | Summarize my day | Today's confirmed results, current open work, parked checkpoints, waiting items and next entry points by lane |

Russian request examples are included in the existing structured planner. Ambiguous goal names still require clarification. No fuzzy backend lookup was introduced. Text and transcribed voice share this skill through the existing AgentRuntime pipeline.

Day-start/day-end runtime events receive the same bounded recorded context. If reasoning elects to present a day summary, backend text replaces model prose. Silence remains valid. Existing scheduled end-of-day cards show a compact factual summary; detailed reports are available through chat. No new Today panel or productivity score was added.

## Persistence and migration

`continuity/schema.sql` adds `continuity_checkpoints`, keyed by goal ID and local calendar day. Guarded triggers retain the latest bounded checkpoint for each day when Memory and Remember work context are enabled. They copy summary, step identity, status, next action, waiting dependency, reported result and timestamp. They do not copy window labels, Accessibility text, activity ticks, audio or provider credentials.

Migration runs transactionally and is idempotent. Existing checkpoints are backfilled only for their actual saved date. Invalid dates are skipped. It cannot reconstruct checkpoints overwritten before this phase was installed.

`core_events.completion_source` distinguishes new `manual` completions from `ai_suggested_user_confirmed` completions. The latter still requires the existing explicit user confirmation and stale-plan validation. Existing completion rows receive `confirmed_unspecified`; their original provenance is not guessed. Confirmation and provenance stamping are atomic.

Only completion events supply completed work. Elapsed time, research, resumes, checkpoint prose and AI guesses never complete a goal or step. Same-day reopen events withdraw that day's completion from the report. Historical reports exclude current remaining steps and current priority/focus labels. Recent-result views exclude subsequently reopened results and label each result's recorded date.

Checkpoint history follows history retention. Pinned checkpoints survive automatic history cleanup. Forgetting a goal's memories or clearing personal memory removes its daily checkpoints by foreign-key cascade, while leaving goals and steps intact.

## Personalization

Personalization uses stored memory; no model weights are trained or fine-tuned.

- The current goal's and global confirmed feedback are considered over a rolling 30-day interval; other goals and conversations do not affect its policy.
- One rejection does not establish a trait. At least three rejections and feedback across two dates are required before adding a cooldown. Net rejections add 15 minutes each, capped at 120 minutes. Accepted intervention/research feedback offsets rejected feedback. A declined research offer counts once, even if older code wrote both research and intervention rejection records; original history is preserved.
- Corrections and resume counts are supplied as events, not accomplishments or personality claims. Reasoning is instructed to trust corrected current state and prefer a saved next action after resumes.
- Exact explicit preference values take precedence over learned frequency: `Offer proactive help`, `Do not offer proactive help`, `Offer web research`, `Do not offer web research`. Scoped preferences precede global ones; the latest applicable explicit value wins. Arbitrary prose is not silently interpreted as a permission.
- Preferences can be edited or forgotten through existing Settings > Memory controls. Explicit preferences are ranked before inferred preferences in retrieval. The existing strict inference evidence threshold remains in place.
- Existing user-configured pause, cooldown, DND, consent, work-hours and privacy gates remain authoritative. Legacy lifetime nudge counters are not stacked over the new scoped policy. Disabling Memory or Learn from feedback revokes learned frequency immediately; disabling Remember preferences revokes explicit-memory policy overrides. Nothing overrides the existing separate consent required for Tavily.

## Maintenance and budgets

Maintenance runs once per local date at runtime observation. It archives unpinned inferred memories older than 90 days or without sufficient recent confirmed evidence: at least three episodes across two dates, with the existing confidence floor of 0.85. Pinned memories are preserved. Retrieval also excludes unpinned inferred items beyond 90 days.

Only exact unpinned, active, user-authored explicit duplicates with the same type, scope and content and no provenance key are merged by retaining the latest item. Different scopes, events, inference evidence, settings records and pinned items are not merged. Duplicate records never increase evidence counts.

Reports include at most 12 lanes, eight pinned preferences, 101 completion events and 31 meaningful events per lane, and 100 current open steps per lane. Rendered provider/report context is limited to 12,000 UTF-8 bytes, with an explicit omission notice. Existing scoped memory retrieval retains its independent limits. No raw user content is logged by this feature.

## Verification

New coverage includes daily rollover, yesterday snapshots after later edits, waiting items, manual/AI-confirmed provenance, reopened results, no completion from time/checkpoint prose, feedback evidence thresholds, explicit preference precedence, scope isolation, stale inference, pinned preservation, exact deduplication, migration, restart, multiple lanes, privacy controls, history retention, malformed timestamps, bounded reports, recent completion dates, structured skill validation, chat without free-form regeneration, and runtime rejection of fabricated day-summary prose.

Synthetic fixture example:

```text
Work continuity — 2026-10-13 (EndOfDay)

Hackathon fixture [goal 1] — open
Completed (manual): Draft proposal [recorded 2026-10-13]
Saved checkpoint: Outline reviewed; work parked
Waiting for: Design approval
Next entry point: Send proposal after review
Open step: Send proposal
```

The renderer also includes the checkpoint timestamp, recorded meaningful events when present, and a note that checkpoints are reported context rather than completion evidence. This example contains no real user data.

## Limits

- Historical continuity begins with the saved checkpoint available during migration; earlier overwritten checkpoints cannot be recovered.
- Checkpoints remain saved user/AI-assisted reports, not independently verified accomplishments. Manual versus AI-assisted provenance of legacy completions is unknown.
- Continuity output is currently English, matching repository UI conventions; Russian intent selection is supported by the planner.
- Context budgets can omit facts; ask about a specific goal for narrower results. This is deterministic retrieval, without a vector database or semantic duplicate merging.
- Native Windows execution/build verification and live provider behavior require their respective environments. This phase changes shared Rust behavior and does not publish an installer or release.

## Verified results

- `npm test`: 128 passed across 22 files.
- `npm run build`: passed.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml`: 382 passed, two existing opt-in tests ignored (live paid-provider smoke and Keychain credential write).
- `cargo check --locked --manifest-path src-tauri/Cargo.toml`: passed.
- `cargo build --locked --manifest-path src-tauri/Cargo.toml`: native macOS build passed.
- `npm run test:release`: 13 passed; `npm run test:contact`: eight passed.
- `cargo fmt --check` and `git diff --check`: passed.
- 24 new Rust tests: 20 continuity service tests, one skill validation test, one mocked chat integration test, and two AgentRuntime tests. Existing completion confirmation tests now assert provenance as well.

Changed files:

| File | Change |
| --- | --- |
| `src-tauri/src/continuity.rs` | Reports, guarded migration, deterministic rendering, scoped adaptive policy and daily maintenance |
| `src-tauri/src/continuity/schema.sql` | Daily checkpoint table, index and consent-guarded capture triggers |
| `src-tauri/src/continuity/tests.rs` | 20 persistence, groundedness, privacy, scope, policy, migration and budget tests |
| `src-tauri/src/skills.rs` | Strict `inspect_continuity` schema, validation, executor and authoritative receipt |
| `src-tauri/src/skills/tests.rs` | Read skill, malformed view, absent/invalid goal and result validation |
| `src-tauri/src/ai_chat.rs` | Continuity intent mapping and direct authoritative summary response |
| `src-tauri/src/ai_chat_tests.rs` | One-request mocked chat integration; updated registry count |
| `src-tauri/src/agent_runtime.rs` | Day context, adaptive reasoning suppression and backend-grounded day offers |
| `src-tauri/src/agent_runtime/observe.rs` | Maintenance at startup and local date rollover |
| `src-tauri/src/agent_runtime/reasoning.rs` | Grounded continuity and personalization instructions |
| `src-tauri/src/agent_runtime/tests.rs` | Fabricated summary rejection and pre-provider policy suppression |
| `src-tauri/src/companion/mod.rs` | Shared scoped offer policy, compact day-end card and atomic AI-confirmed completion provenance |
| `src-tauri/src/core.rs` | Manual completion provenance at existing mutation entry points |
| `src-tauri/src/memory/mod.rs` | Expose the existing context status encoding inside the Rust crate |
| `src-tauri/src/memory/retriever.rs` | Explicit-over-inferred preference ordering and inferred-memory age limit |
| `src-tauri/src/research.rs` | Respect adaptive policy before proactive research offers |
| `src-tauri/src/storage.rs` | Initialize continuity and apply existing retention rules to daily checkpoints |
| `src-tauri/src/lib.rs` | Register the shared module |
| `docs/DAILY_CONTINUITY_PHASE_9.md` | Implementation, synthetic example, results and limitations |
