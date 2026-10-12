# Event-driven personal AI runtime (Phase 5)

Built on Phase 4 commit `8f483b0`. This phase reuses the existing collector,
companion, SQLite storage, deterministic memory retriever, skill registry,
Nebius service and chat/research flow. It does not introduce a second database,
a vector index, fine-tuning or a new Tavily pipeline.

## Entry points and cycle

`src-tauri/src/lib.rs` delegates its three-second collection interval to
`agent_runtime::tick` in `src-tauri/src/agent_runtime.rs`.

1. **Observe:** collect locally, keep local timers, privacy retention and companion
   state current, then compare meaningful domain/context state.
2. **Understand:** derive an event with exact goal/step IDs and local
   focused/drifting/stuck signals. Frequent duration/usage updates are not events.
3. **Retrieve:** retrieve only the event goal, its current step, checkpoint and
   relevant global preferences through the existing deterministic retriever.
4. **Reason:** call the configured Nebius/Nemotron model with the unified strict
   JSON Schema. Explicit chat/voice uses the same envelope in the existing chat
   planner; ordinary conversation continues through the existing answer pipeline.
5. **Decide:** accept one of the six decisions below. Silence is a successful
   terminal result and produces no user-visible message.
6. **Act:** explicit user commands use the existing Rust skill executor and its
   ownership, instruction, confirmation/undo and transactional validation.
   Background proposals never authorize mutations.
7. **Verify:** check request identity, current database state, chat identity,
   privacy revision and presentation gates before accepting an answer/effect.
8. **Remember:** retain existing verified action/domain history. A background
   memory proposal can add only a matching verified episode, atomically and
   idempotently. Explicit preference proposals use the existing Settings review
   queue; model guesses never become persistent preferences automatically.

`begin_explicit` runs before waiting for the shared chat/background slot, so
incoming text, locally transcribed voice and UI Park/Resume operations cancel an
in-flight runtime reasoning request rather than being rejected as busy. Voice
origin survives the frontend send queue. The source flag does not grant any
additional permissions.

## Event sources

| Events | Source |
| --- | --- |
| `user_message`, `voice_message` | Chat IPC and local transcription; handled immediately through chat reasoning |
| `goal_changed`, `step_changed` | Local snapshot comparison after existing UI, chat or backend mutations |
| `completion_confirmed` | Stored completed goal/step state, never inferred solely from application time |
| `meaningful_context_changed` | A changed local app/window fingerprint stable for 30 seconds |
| `work_context_parked`, `work_context_resumed` | Persistent checkpoint Park/Resume timestamps |
| `possible_stuck` | Rising edge of the existing overdue, overrun or low-relevance heuristic |
| `possible_drift` | Rising edge of local drifting state or explicit distraction classification |
| `session_started`, `session_ended` | Startup and tracking transitions; quit cancels work and records the end in diagnostics |
| `day_started`, `day_ended` | Local calendar-day transition |

Events are coalesced observations of current state, not an audit log. A rapid
sequence may become one reasoning pass. Confirmed actions/episodes continue to
use their existing durable storage independently of model calls. Stop/quit and
privacy-disabled events do not cause a final network request after consent ends.

## Schema and skill safety

`agent_runtime/reasoning.rs` defines the shared envelope:

```json
{
  "situation": "Short assessment",
  "decision": "stay_silent",
  "proposed_actions": [],
  "memory_updates": [],
  "state_version": "opaque request token",
  "clarification": null
}
```

Decisions: `stay_silent`, `update_memory_only`, `offer_help`, `offer_skill`,
`execute_explicit_user_action`, `request_clarification`.

Action alternatives and validators come from the existing skill registry.
Unknown skills, invalid schemas, cross-goal references and stale plans are
rejected. Background offers require the exact supplied goal ID and valid
step ownership. Even a valid background `execute_explicit_user_action` is
rejected. An offer opens the existing help conversation; the user must issue an
explicit chat command before a proposed skill can change anything. Destructive
operations retain the existing confirmation/undo behavior.

The model echoes the opaque request token. Freshness is checked separately by
comparing actual snapshot data/database revision, not by regenerating that token.
After verification, presentation also rechecks current state and privacy, so an
outdated offer cannot be displayed after a concurrent edit.

## Nemotron calls and suppression

The new background reasoning call requires all of:

- Completed onboarding, enabled AI assistance and goal-context sharing.
- AI activity consent: existing AI check-ins or screen task detection enabled.
- A configured provider, or explicitly enabled `AI_MOCK`.
- Enabled, healthy tracking within configured working hours and active input.
- No DND, companion pause/quiet hours, Snooze, fullscreen, meeting, media,
  sensitive window or excluded foreground app.
- A significant queued event; five seconds without a newer event.
- No active runtime request and an available shared companion/chat slot.
- At least 300 seconds since the previous runtime attempt, including failures.

Queue capacity is 32; equivalent events replace their predecessor. After five
minutes events expire. A reasoning pass consolidates pending events into current
state rather than replaying ticks. Cooldown is persisted in the existing SQLite
settings key `agent_runtime_state` **before** HTTP. Restart restores cooldown but
never restores a request, queued action or pending flight. No migration or
existing-data replacement is required.

A newer significant event cancels the old request. Explicit input cancels it
immediately. DND, tracking pause and Snooze suspend current runtime work; the tick
also cancels on other gate, privacy or database changes. Cancellation drops the
HTTP future through a Tokio watch channel/select. This cannot retract data
already received by a provider. Existing bounded service timeout/validation
repair still applies. The 300-second limit counts reasoning attempts; a
validation repair is an additional HTTP call within that bounded attempt.

Credential lookup happens only after readiness and shared-slot checks, not for
every collector tick. `DEMO_MODE` changes collection; only `AI_MOCK` suppresses
provider HTTP. Mock reasoning returns an explicitly silent result.

## Existing specialists

The same dispatcher invokes existing queued goal analysis, cloud goal matching,
focus checks, recommendations and completion detection. Each retains its own
schema, locks, consent, verification and cooldown. This phase unifies dispatch
and chat/runtime decisions; it does not replace specialized extraction/scoring
schemas or the Tavily research policy.

Goal matching can run while the collector is withholding foreground until cloud
attribution completes. Queued user goal analysis can run without tracking or a
foreground window. Neither depends on the more restrictive background-offer
gate. Automatic focus checks are additionally triggered only by significant
observations; local collection/timing continues on every interval.

## Loop prevention and privacy

- There is no memory-write event source. Snapshot observation excludes retrieval
  timestamps, memory content, usage totals, timers and companion presentation.
- Events explicitly marked `Origin::Runtime` are dropped at enqueue.
- Background reasoning cannot execute goal/step skills or stage preferences.
- Verified memory events require matching completed/Park/Resume state in SQLite,
  use canonical backend content and have a unique source key.
- Bounded queue, debounce, persisted cooldown and one claimed slot limit retries.
- Runtime requests contain one goal and a bounded memory envelope (default eight
  items / 6,000 bytes). Other goal/chat memory is excluded. No activity-history
  dump, raw Accessibility text or window title is sent by the new runtime.
- Window fingerprints exist only locally in memory. Diagnostics contain counts,
  event/decision enums and fixed suppression reasons, without user content,
  screen text or provider credentials. Existing retriever diagnostics remain
  metadata-only. Legacy specialist payloads retain their separate consent rules.

## Files

- `agent_runtime.rs`: state, queue, guards, cancellation, dispatcher and verified
  offer presentation.
- `agent_runtime/observe.rs`: significant local/domain event detection.
- `agent_runtime/reasoning.rs`: shared schema, parsing, decision validation and
  verified/staged memory updates.
- `agent_runtime/tests.rs`: runtime, HTTP, persistence and regression tests.
- `lib.rs`, `commands.rs`, `buddy.rs`: entry point, initialization and suspension.
- `ai_chat.rs`, `ai_chat_tests.rs`: unified planning with existing skill/answer
  flow and updated HTTP fixtures.
- `skills.rs`, `work_context.rs`, `companion/mod.rs`: proposal validation,
  explicit workflow priority and reuse of companion offers.
- `src/ai/api.ts`, `src/companion/Conversation.tsx`,
  `Conversation.runtime.test.tsx`: preserve text/voice event source through IPC
  and queued messages.

## Verification

- `npm test`: **117 passed** in 21 files. Two new component tests verify local
  voice versus typed input and source/chat preservation while another reply is
  pending.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml`: **312 passed,
  2 ignored**. This includes all previous chat/goals, collector/activity,
  matching, privacy, memory and Park/Resume tests.
- `npm run build`: successful version check, TypeScript check and Vite build.
- Locked `cargo check` and native macOS locked `cargo build`: successful.
- `npm run test:release`: **13 passed**; `npm run test:contact`: **8 passed**.
- `git diff --check`: successful. No dependency, migration, release-version or
  signing-trust changes.

Eighteen new backend tests all passed:

| Required behavior | Coverage |
| --- | --- |
| Insignificant event | Repeated collector observations produce zero HTTP calls |
| Meaningful event | One real local HTTP request with the unified schema |
| DND/privacy | Nine gate combinations produce zero HTTP calls |
| Explicit action | Skill registry execution succeeds; background execution fails |
| Stay silent | No mutation or intervention despite a successful reasoning call |
| Invalid skill | Unknown skill and invalid/cross-goal step references rejected |
| Stale response | Goal/step and privacy changes invalidate the reply |
| Selective memory | Correct goal fact included; unrelated goal and raw window excluded |
| Episodic memory | Confirmed completion saved once using a canonical event identity |
| No infinite loop | Repeated observations after memory writes do not enqueue reasoning |
| Cooldown | Debounce, deduplication, 300-second limit, bounded queue and expiry |
| Cancellation | A delayed HTTP request is dropped when explicit input arrives |
| Restart | SQLite reopen retains cooldown, with no flight or action replay |
| Collector regression | Stable-context boundary and Park/Resume edges preserved |
| Additional | Latest-event debounce and explicit suspension clear pending work |
| Additional | Withheld collector foreground does not deadlock cloud matching/goal jobs |
| Additional | Skill offers never mutate; clarification uses the actual question; stale presentation blocked |
| Additional | Mock provider sends no HTTP; collection simulation stays independent |

Malformed reasoning and unsolicited background preferences are also rejected;
unconfirmed/mismatched completion cannot write an episode. HTTP tests use the
production request/parser path against an isolated local server, not a live
Nemotron call. Test databases are isolated from the user's production data.

## Known limitations

- Native Windows build/runtime validation needs a Windows runner and is not
  available on this Mac. Changes use shared Rust/React and no new platform APIs.
- Live Nemotron behavior/model accuracy and real microphone quality are not
  established by deterministic HTTP fixtures and mocked transcription.
- The two pre-existing ignored tests are the optional live-provider smoke and
  credential-vault write test; no production keys or goals are used for tests.
- Existing specialists keep their own request lifecycle and cooldowns. Runtime
  cancellation targets the new reasoning request; it does not globally abort
  every legacy specialist request. Existing specialist revision/result guards
  remain in place.
- Background skill offers open chat and require an explicit user instruction;
  accepting an offer is not permission to execute model-selected mutations.
- No installer or GitHub release is produced in this phase. Version 0.26.1 stays
  unchanged; the next delivered joint installer update needs a synchronized
  version bump and native Windows validation.
