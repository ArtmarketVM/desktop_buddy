# Contextual retrieval and memory controls (Phase 3)

Phase 3 builds on `f364896` (persistent personal memory) and the structured skill
registry. Goals, steps, chat messages and activity keep their existing storage.
No vector database, new agent runtime, fine-tuning or replacement Tavily flow is
introduced. The implementation is shared by Windows and macOS.

## Deterministic retrieval

`src-tauri/src/memory/retriever.rs` accepts a request/event, optional exact scope,
active goal and step IDs, current chat ID, current app name and event type. The app
name is only local relevance metadata; window titles and Accessibility text are
not inputs to this service. It does not read activity history.

Candidate scopes are limited by SQL to the resolved goal, current conversation
and global records. Another goal or conversation cannot enter through pinning.
An exact goal scope takes precedence over an ambient active goal. Unknown goal,
chat or step IDs, and steps outside the selected goal, are rejected.

Ranking is deterministic: exact scope, current goal/chat, matching current step,
explicit preference/fact then inferred preference/pattern then event, pinning,
recency and structured event metadata. Older step-specific records for a different
current step are excluded. A current goal checkpoint is considered separately
before the memory items. Its step ownership and live goal state are revalidated.

Global facts/events require exact request-token overlap. Global preferences and
patterns require that overlap or a recognized general communication/workflow
preference (for example concise plans, reminders or language). Whitelisted saved
application preferences are general context. This conservative English/Russian
rule avoids sending unrelated global preferences such as food choices merely
because they are pinned. It is not semantic search.

Default budget:

- At most 8 memory items; validated hard maximum 20.
- At most 6,000 UTF-8 bytes for the **entire serialized memory envelope**, including
  the goal label, checkpoint, next action and memory items; hard maximum 12,000.
- Unpinned episodes: 30 days; unpinned personal records: 180 days.
- Unpinned checkpoints: 90 days. Pins bypass age, not scope, privacy or budgets.
- At most 500 candidates are ranked. Metadata reports the total scope candidate
  count and whether the candidate cap was reached.

Budgets do not include the existing recent chat-message window or structured
skill planning state. Those have their own existing limits. Ordinary chat goal
context now contains only the resolved goal, its plan/details and goal-specific
time aggregates; the previous unrelated-goal overview is removed. Skill planning
still receives its bounded registry/state with real IDs, as required by Phase 1.

## Chat integration and provider boundaries

Before normal chat generation, Rust retrieves a bounded memory envelope. It is
attached as `personal_memory` only when Memory and existing AI goal-context
sharing are enabled. AI assistance must already be enabled to submit chat. Memory
controls never grant tracking, Accessibility, provider-key or AI-sharing consent.

A selected goal ID takes precedence. Without a selected ID, full unique titles
can resolve a goal locally; duplicates require clarification. The existing
Nemotron skill planner can also select a real goal ID for `inspect_goal`, including
an inflected name such as “хакатоном”. After backend validation, read-skill response
generation retrieves the checkpoint for that exact ID. Multiple inspected goals
are not combined into one personal memory context.

Provider prompts treat memories as untrusted data and distinguish checkpoints
from live evidence of completion. Saved `last_window` and `last_app` labels are
excluded from the provider checkpoint envelope. Existing optional research is
unchanged: Nebius plans a query, Tavily receives that query, and Nebius receives
sources. Generated queries may reflect shared memory context; turning off web
research prevents that existing research path.

`memory_update` is a nullable structured chat response field with operation
`store_memory`, type `preference`, content, confidence and source. Rust accepts
only explicit-user-statement proposals with confidence >= 0.85, safe single-line
content <= 500 characters, an explicit request/preference prefix and an exact
verbatim substring of the latest user message. Attachments, older messages and
model paraphrases are not write evidence. Invalid proposals are discarded.

Valid suggestions are staged locally (maximum 20), not stored as memories. The
response directs the user to Settings > Memory. Only pressing **Remember
preference** invokes a confirmed Rust write; dismissing removes the suggestion.
Confidence supplied by the model never becomes stored confidence/provenance.
Changing any memory permission invalidates pending suggestions and increments the
existing privacy revision, so an in-flight stale answer cannot commit a proposal.

## Settings and lifecycle

Settings > Memory provides:

- Memory on/off.
- Remember work context (checkpoints, explicit useful facts and work events).
- Remember preferences.
- Learn from feedback (feedback episodes and evidence-based inference).
- Remember conversation context (conversation-scoped memories and suggestions).
- Work, Preferences, Patterns, Waiting and Parked contexts categories.
- Paginated review, reload, edit, pin/unpin and confirmed forget, for memory items
  and checkpoints. Context edits use the existing optimistic timestamp check.
- Confirmed deletion of one goal's memory/checkpoint without deleting the goal.
- Confirmed clear of all personal memory, evidence, checkpoints, suggestions and
  retrieval diagnostics, including pins; goals, steps, chat/activity history,
  settings and API keys remain.
- Local retrieval diagnostics with counts, IDs, byte totals and reason codes.

Turning Memory off stops new capture and retrieval; existing data remains
available for review, editing personal records, pinning and deletion. Checkpoint
editing requires work-context memory to be on. Turning off a category stops both
capture and recall for that category without erasing existing records. SQL event
triggers obey work-context controls, not just the UI. Feedback capture is gated
independently. No activity tick is mirrored as a memory.

History and Memory have separate clear operations. Global explicit facts and
preferences and pinned episodes survive history clearing. Existing history
retention can remove unpinned episodes. Deleting a goal/chat, including existing
history cleanup that deletes that owner, still cascades its scoped memories.
Pinned goal memories/checkpoints protect their owner from automatic retention.
Existing companion card budgets/cooldown counters remain operational app state,
not a replacement for this personal memory layer.

## Migration and API

`002_memory_controls.sql` is applied in the existing transactional, versioned
personal-memory migration runner. Migration 001 is unchanged. Version 2 adds:

- A singleton `memory_controls` table. Defaults preserve Phase 2 capture behavior;
  all controls are initially enabled. This adds no provider consent.
- Nullable structured `memories.step_id` and its index. Existing rows stay intact.
- `work_contexts.pinned`, default false.
- A singleton `memory_retrieval_debug` table and bounded `memory_proposals` table.
- Replacements for existing event triggers, with control gates and real step IDs.

All new IPC commands require the main workspace window and worker dispatch:
`get_memory_overview`, `set_memory_controls`, `clear_personal_memory`,
`forget_work_context`, `pin_work_context`, `resolve_memory_proposal` and
`get_memory_retrieval_debug`. Existing edit/forget/pin/scope/checkpoint commands are
reused. No arbitrary SQL, provider key or client-defined source/confidence API is
added. Diagnostics persist only the last selection and contain no request,
preference, goal title, app/window text or memory content. Retrieval marks only
selected memories as used.

## Verification

New Rust tests in `memory/retrieval_tests.rs` cover relevant checkpoint/events,
unrelated goals/chats/global preferences, exact scope precedence, step ownership,
pinned recency, byte/count budgets, Memory off, independent toggles, sharing off,
content-free diagnostics, edit/forget/clear isolation, exact-title ambiguity,
proposal evidence/confirmation/revocation, restart persistence, pagination,
structured step relevance, old checkpoints, Phase 2 migration, malformed inputs,
independent work/feedback gates and pinned-checkpoint retention.

Three chat tests cover end-to-end mock chat retrieval, structured proposal parsing
without storage, and HTTP-fixture `inspect_goal` retrieval for the Russian
checkpoint question. Fifteen DOM UI tests cover switches, categories, consent
copy, confirmed/cancelled forgetting, edit/versioning, pinning, goal clear, full
clear, stale errors, checkpoint editing, suggestions and pagination. Existing
chat/goals/activity/privacy, frontend, release and contact tests remain included.

Required commands: `npm test`, `npm run build`, locked `cargo test`, `cargo check`
and native `cargo build`. Also run `npm run test:release`, `npm run test:contact`,
`cargo fmt --check` and `git diff --check`. Final counts and outcomes are reported
with the phase commit.

## Limits

- Retrieval is deterministic and conservative. General preference detection uses
  a small English/Russian vocabulary; other languages or nuanced relevance may
  require a matching request token or a goal/chat scope.
- No background inferred-pattern generator, vector search or automatic chat
  summary/extraction is introduced. Confirmed useful checkpoints still use the
  existing checkpoint API; this phase selects and manages them.
- The entire memory envelope is bounded, while the existing bounded action
  planner/chat history are separate. The 500-candidate cap is reported explicitly.
- Memory is local SQLite using the existing storage model, not newly encrypted.
  The Phase 2 secret detector remains heuristic and can reject safe text.
- Existing goal undo does not restore the personal memory layer after deletion.
- No paid live-model test or installer release is part of this phase. Native macOS
  build validation does not validate Windows packaging/runtime or real-device UI.
