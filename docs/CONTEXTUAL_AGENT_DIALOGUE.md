# Contextual agent dialogue candidate

Status: implementation under validation; not a published installer update.

## Changes

Text and local speech transcripts enter `AgentRuntime::handle_dialogue` and the
same dialogue loop. The model selects an answer, read, change, clarification or
preference decision through mutually exclusive JSON Schema variants. The actual
conversation uses native user/assistant roles; the latest human message is last,
while workspace data is clearly separated from instructions. Critics receive
a validation task instead of a repeated direct human request. JSON insertion
order places the decision before details and the skill name before arguments;
repeated-read detection still canonicalizes object order. Production does not use the historical phrase-based chat
contract to classify the request. That adapter remains only for old mock tests.

The shared, permission-filtered packet includes recent conversation, selectively
retrieved memory, real goal/step IDs, bounded goal details, skill descriptions,
and the saved Today order. In focus, Later today and Up next are explicitly
distinguished. Discussing Up next does not change focus. `inspect_work_queue`
reads that queue without modifying it.

Read results can inform a subsequent decision. Reads update conversational
references, but those new references do not authorize a mutation. Before writes,
a separate semantic review checks the original human request and original
references against all proposed operations and targets. Ambiguity produces a
question. A failed reviewer stops execution. Rust still validates IDs, ownership,
state version, permissions, schemas, atomic execution, undo and confirmations.

Natural responses are generated from verified execution receipts and checked
separately for relevance, language, known facts and unexecuted action claims.
One correction is allowed. A failed post-execution check falls back to the
backend receipt. These model reviews reduce errors; they do not constitute a
mathematical guarantee of semantic correctness.

Pending confirmations use a multilingual semantic decision tied to the exact
saved proposal. The opaque proposal token is compared again under the mutation
lock. Existing expiration, stale-state and privacy checks remain authoritative.

## Bounds and privacy

- Three planning/read rounds; repeated reads stop.
- One bounded structured-output repair; at most one answer correction.
- Dialogue timeout: 90 seconds; individual reply/review timeout: 25 seconds.
- At most 40 goal summaries and 20 detailed steps per relevant goal.
- At most 12 recent messages, with clipped labels explicitly described as incomplete.
- Older history/tool omissions are reported in context metadata. Provider packets
  above 96 KiB are rejected rather than sent wholesale.
- Sharing off hides saved goals, references, work queue, memory and tracking insight.
- API keys stay runtime-only. The developer panel shows configuration and safe
  inference metadata, never keys, raw prompts or hidden model reasoning.
- Optional `NEBIUS_REASONING_MODEL_ID` selects the deliberate role; otherwise it
  uses the configured primary model. No personal setting is silently changed.
- Tavily remains consent-bound for goal research, with existing source validation.

## Evaluation

`--check-agent-dialogue` runs 60 opt-in real-provider cases on synthetic in-memory
workspaces, with 20 scenarios each in Russian, English and Hebrew. It never
changes the user's database. `BUDDY_DIALOGUE_CASE_FILTER` selects a subset.
Saved replies allow independent quality review. Mechanical action correctness
and script-based language detection are separate measurements, not GPT parity.

The first experimental candidate failed: 39/60 mechanical passes and 45/60
language matches, including guessed targets and false change claims. It was not
published. That result motivated the single-decision schema and semantic reviews.
The earlier waits exhausted the live audit deadline. After authorization, an
intermediate Ultra candidate passed only 41/60 mechanical checks and 48/60
language checks; generic clarification and missed mutations remained. Native
conversation roles, mutually exclusive responses and semantic reasoning are
being re-evaluated before selecting a model.
No best-model claim or production model change is justified yet. The latest
operation-first candidate is again waiting for macOS Keychain access. Keeping
the internal signing identity did not eliminate prompts for changing test builds.

Current local automated evidence: 432 Rust tests passed, 2 existing opt-in tests
ignored; 160 frontend tests passed; 15 release-verification tests and 8 acceptance
runner tests passed; frontend build and changed-file formatting passed.
Both native CI builds passed the initial draft commit. A signed Apple Silicon
candidate is rebuilt for each live evaluation. Final exact-source native builds,
live comparison and installer publication remain required.

No database migrations, updater key changes or macOS signing identity changes.

## Limitations

Model reviews add latency and inference cost and can share correlated errors.
Language fixtures are finite; unseen phrasing still needs evaluation. A hard
timeout after a committed action can require checking actual app state before
retrying. Deterministic fallback receipts remain English. No claim that the
agent understands every language or performs every requested external action
is supported. Installed version 0.29.0 remains unchanged during this evaluation.
