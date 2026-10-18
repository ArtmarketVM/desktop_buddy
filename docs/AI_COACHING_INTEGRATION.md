# AI coaching integration proposal

Status: interactive Tiny Habits integration for 0.36.0, 2026-10-18.
The release workflow enforces native validation and coordinated signed publication.
`COACHING_0.36.0_VALIDATION.md` records source verification and delivery limits.

## Current implementation

- An unfinished goal's action menu offers **Help me start**, bound to its selected
  unfinished step when present. A confirmation explains local session persistence
  separately from optional Personal Memory before starting.
- Full Chats includes the same entry point with an explicit unfinished-goal
  picker. Typing a short explicit request such as "I cannot start" or "Help me
  start" also opens the picker; it does not silently select a goal or turn ordinary
  messages into workflow replies.
- The existing chat contains structured readiness, barrier, ease, optional anchor,
  commitment and outcome controls. Pause, resume and stop use revision-checked
  backend operations. Ordinary messaging remains separate and available.
- `coaching/gateway.rs` registers `prepare_coaching`, `get_coaching_session`,
  `start_coaching_session`, `reply_coaching_session` and `propose_coaching_action`.
  These commands run on workers and are restricted to the main workspace window.
- Suggestions use the configured real HTTP service, strict typed validation,
  a 30-second request budget and at most one malformed-response repair. AI mock
  responses remain explicitly labeled and independent of demo activity. Sharing,
  privacy revision, target, session and scoped memory are checked before disclosure
  and again before applying a proposal; repairs also recheck current permissions.
  No application mutex is held over a network wait. Pause and stop remain usable
  while a suggestion is pending.
- The frontend restores the saved session when opening its conversation. Coaching
  sessions preserve otherwise empty chats; New chat opens another conversation.
  Clearing a conversation atomically removes its messages and coaching sessions,
  including linked outcome memories. Existing scoped forgetting and retention apply.
- The optional remember-result checkbox is off by default and only shown when
  all required memory controls permit it. Micro-action confirmation never completes
  a goal or checklist step or starts a timer.

This integration uses shared Rust and React paths on Windows and macOS and adds
no platform-specific collector or credential access. It introduces no automatic
coaching offers or free-text classification of psychological barriers. Native
macOS testing and signed installers for both platforms are required before
describing it as a delivered cross-platform update.

The remainder records the original 2026-10-15 proposal and later scope.
See `AI_COACHING_FOUNDATION.md` for the first backend implementation stage.
The supplied AI Coaching Engine brief is a discussion draft rather than an
approved specification. Its proposed infrastructure must be adapted to the app.

## Feasibility and existing foundation

The feature fits the existing local-first React/TypeScript, Tauri/Rust and SQLite
architecture. Add a coaching module inside the Rust application and use Tauri
commands for UI access. A hosted HTTP API, PostgreSQL, separate queue and vector
database are unnecessary for the proposed first scenario.

| Brief component | Existing integration point | Required extension |
| --- | --- | --- |
| Tasks and goals | `src-tauri/src/core.rs`, `goals.rs` | Bind a session to a real goal and optional checklist step; preserve plan revisions and ownership checks |
| Event processor and orchestrator | `src-tauri/src/agent_runtime.rs`, `agent_runtime/reasoning.rs` | Route explicit coaching requests; later add consent-bound background offers |
| Structured actions | `src-tauri/src/skills.rs` | Register validated coaching operations and authoritative execution receipts |
| Chat and language interpretation | `src-tauri/src/agent_dialogue.rs`, `ai_chat.rs` | Route active-session replies without treating every ordinary chat turn as coaching |
| LLM gateway | `src-tauri/src/engine_observability.rs`, `nebius.rs` | Reuse validated provider requests, timeouts and current model selection; add a bounded coaching response contract |
| Context and personal memory | `src-tauri/src/memory/`, `work_context.rs`, `continuity.rs` | Retrieve scoped context and record confirmed coaching outcomes under existing memory controls |
| Notification policy | `src-tauri/src/companion/engine.rs`, `companion/mod.rs` | Reuse quiet hours, pause, cooldown and presentation gates for future proactive offers |
| UI | `src/core/Goals.tsx`, `GoalWorkContext.tsx`, `src/companion/Conversation.tsx` | Add an explicit entry point and session controls in the existing workspace and chat |
| Retention and deletion | `src-tauri/src/storage.rs`, `memory/controls.rs` | Include coaching records in history deletion, scoped forgetting and retention |

The existing `coaching_context` function in `ai_chat.rs` reports activity totals
and expected-time comparisons. It is useful context, but is not a persistent
coaching strategy or session state machine. The runtime already supports
`possible_stuck`, help offers and scoped adaptive policy; those also do not
constitute the Tiny Habits workflow described in the brief.

Runtime observations are coalesced and the pending event queue is in memory.
They are not a durable, uniquely identified audit stream. Counting postponements
or guaranteeing exactly-once transitions requires persisted domain events or
separate coaching request IDs, rather than counting observation ticks.

## First deliverable: one complete Tiny Habits scenario

Entry points: an English UI action such as **Help me start** on an unfinished
goal, plus explicit chat requests such as "I cannot start". Resolve the actual
goal and optional step; ask for clarification when the target is ambiguous.
Reuse the existing chat instead of adding a separate coaching screen. Follow
`docs/UI_LAYOUT.md` for all workspace controls and callouts.

Proposed flow:

1. Offer one small voluntary step and check readiness.
2. Ask what prevents starting. An external dependency leads to a blocked outcome
   and a practical next action instead of repeated motivational questions.
3. Propose a task-specific action of approximately 10–60 seconds.
4. Check feasibility; allow at most two revisions. An ease threshold, if used,
   is a product heuristic rather than a claim of scientific validation.
5. Offer an optional anchor for repeatable behavior, then request commitment.
6. Ask what happened. Allow at most two execution attempts and permit pause or
   refusal at every active step.
7. Record completion only when the user confirms the micro-action. Offer a short
   acknowledgement and an optional next step.

Opening a document completes only the micro-action. It must never complete the
original checklist step or goal, start a timer or change a deadline implicitly.
Existing goal mutations continue through the existing authorized skill path.

An active session can resume after restart. Unrelated chat must remain usable;
the user can explicitly resume, pause or stop coaching. Changed, deleted or
completed targets invalidate stale proposals and require current context.

## Backend and persistence proposal

Add `src-tauri/src/coaching/` with a versioned strategy registry, deterministic
transition reducer, context builder, persistence adapter and provider-response
validator. Start with one registered strategy, `tiny_habits` version 1. Let Rust
own transitions, counters, permission checks and outcomes. Let the LLM interpret
bounded user input and propose text/actions; never accept its suggested state
as authoritative.

Add transactional SQLite migrations for:

- `coaching_sessions`: goal/step/conversation binding, strategy version, state,
  optimistic revision, target identity/revision, confirmed barrier, proposed
  micro-action, optional anchor, revision/attempt counters, outcome and timestamps.
- `coaching_transitions`: unique request ID, expected/session revision, transition
  reason, confirmed outcome and timestamps. Deduplicate retries atomically with
  the state update.

Reuse existing conversation messages rather than copying transcripts into a
second message store. Reuse the existing memory service for confirmed episodes
and reviewed preferences rather than creating a parallel coaching profile.
Separate persisted workflow state from optional long-term personal memory;
define their controls clearly and honor deletion for both. Do not create inferred
psychological facts from model-generated barrier hypotheses.

Enforce one relevant active session for a goal/conversation, ownership of the
step, stale-request rejection and bounded counters in the backend. Provider
calls must not hold the application mutex across network waits. Recheck current
privacy, target state and session revision before committing a provider result.
Malformed or timed-out responses must preserve the last valid state and offer
a bounded local retry/pause response without inventing a completed action.

Proposed Tauri operations: start, inspect/resume, reply, pause and stop. The
exact commands and registered skill names should be defined with implementation.
Explicit session participation does not enable automatic offers or broaden goal
sharing. Keep credentials runtime-only and preserve `AI_MOCK` / `DEMO_MODE`.

## Implementation backlog and acceptance

| Order | Work | Acceptance |
| --- | --- | --- |
| 1 | Session reducer, registry and SQLite migrations | Allowed transitions, limits, atomic duplicate handling, restart and stale target/session rejection verified |
| 2 | Scoped context, provider contract and chat/skill routing | Real provider path plus malformed-response tests; unrelated chat still works; privacy revocation rejects in-flight results |
| 3 | Goal entry point, feasibility/commitment/outcome controls | Complete voluntary flow, pause, resume, stop and external-blocker branch through real goal IDs |
| 4 | Memory, deletion and local outcome reporting | Confirmed outcomes only; forgetting and retention remove applicable records; disabled learning creates no inferred preferences |
| 5 | Platform and release validation | Frontend and Rust checks, native Windows x64 and macOS Apple Silicon verification before a shared-version release |

Regression coverage must prove that a micro-action cannot complete its parent,
duplicate replies cannot consume attempts twice, a refusal halts the session,
and a goal changed in another window cannot receive a stale action. Cover goal
deletion, conversation deletion, memory-off behavior, restart and provider
failure. Use synthetic data for provider checks.

For implementation, run `npm test`, `npm run build` and
`cargo test --locked --manifest-path src-tauri/Cargo.toml` with the required
Windows prerequisites. Validate native builds on both supported platforms;
Windows alone cannot establish macOS behavior. Any delivered feature installer
requires a minor version bump synchronized across all five version files and
one GitHub release for Windows x64 and macOS Apple Silicon, macOS 14.5+.
Preserve existing signing identities, updater keys and signature verification.

Initially derive local metrics from session/transition records: offers accepted
(once proactive offers exist), confirmed micro-action completion, pauses,
declines and optionally helpfulness. Label time-to-first-action based on user
confirmation as self-report; app usage is not evidence of completion.

## Later scope

After the first vertical flow is validated, add SMART/GROW, WOOP, agreed check-ins
and reflection through the same contracts. Add behavioral offers only after
durable trigger semantics, consent and duplicate suppression are implemented.
Respect current notification gates and the system local timezone; an arbitrary
timezone preference or reminders while the desktop app is closed would require
additional scheduling work. No background delivery service is implied here.

Open product choices for implementation are whether to include any proactive
offers in the first release (recommended initial scope: explicit entry only),
how session persistence is explained alongside Memory settings, and whether
an optional helpfulness question belongs in the first flow. These choices do
not block the feasibility assessment.
