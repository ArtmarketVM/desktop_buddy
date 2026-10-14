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
- The default primary model is NVIDIA Nemotron 3 Super for planning, mutation
  authorization and background analysis. Qwen3.5-397B-A17B writes and reviews
  natural responses, synthesizes research and drafts checkpoints, through the
  same Nebius account. `NEBIUS_MODEL_ID` explicitly overrides the primary model;
  when set without a response override, all roles use that model. The optional
  `NEBIUS_REASONING_MODEL_ID` explicitly overrides the response role. Existing
  custom model configurations are preserved. Neither model runs locally.
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
On the same intermediate pipeline, Super passed 60/60 mechanical checks and
57/60 language checks, Qwen passed 59/60 and 59/60, and Ultra passed 46/60 and
40/60. Median turn latency was 7.99, 11.38 and 8.13 seconds respectively.
Manual review found Qwen's drafts more useful and readable. Its ambiguous-goal
failure demonstrated that model-based authorization alone is insufficient.

The final candidate adds a deterministic Rust guard for duplicate goal names:
without an original conversational target or explicit chat goal selection, it
asks the user to select the goal before executing. A model cannot bypass this
check by guessing an ID or reading a goal first. Non-detailed goals include
step counts/previews and `plan: null`, rather than misleading empty step lists.
When a response reviewer recognizes an unexecuted explicit action, the bounded
loop replans instead of answering as if it executed. Product facts describe
actual user-facing controls instead of asking users to invoke internal skills.

Final hybrid validation and exact-source native builds are pending. The
installed 0.29.0 application remains unchanged during candidate evaluation.
Keychain prompts remain possible for changing test binaries despite the
preserved internal signing identity; this is not claimed to be resolved.

No database migrations, updater key changes or macOS signing identity changes.

## Limitations

Model reviews add latency and inference cost and can share correlated errors.
Duplicate names currently require a stable conversational target or explicit
chat goal selection; arbitrary descriptive disambiguation is not guaranteed.
Language fixtures are finite; unseen phrasing still needs evaluation. A hard
timeout after a committed action can require checking actual app state before
retrying. Deterministic fallback receipts remain English. No claim that the
agent understands every language or performs every requested external action
is supported. Installed version 0.29.0 remains unchanged during this evaluation.
