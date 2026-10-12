# Goal matching and Personal Work State (Phase 7)

Built on `5b89240 feat(agent): route voice commands through agent skills`.
Existing collection, app rules, local relevance classification, WorkContext,
Nebius HTTP matching, skill execution and SQLite storage are reused.

## Matching cascade

`commands::collect` now calls `goal_matching::observe_inner` for every allowed
local sample, including when cloud matching is enabled. Previously, enabling
cloud matching bypassed local attribution and required ten minutes in the same
window. A cloud match also lost its goal ID after sixty seconds despite a
ten-minute request cooldown.

The new order is:

1. **Explicit focus:** a goal the user selected through Today, the focus skill,
   Resume with focus, the legacy user Resume action or manual timer start.
2. **User app rules:** one unique user-created Work rule wins. Role presets do
   not act as explicit rules. Explicit distraction rules exclude that lane from
   automatic local matching.
3. **Local keywords/relevance:** reuse conservative title, description and
   unfinished-step matching. Shared generic terms and close scores remain
   ambiguous; they do not select an arbitrary goal.
4. **Recent WorkContext / accepted context:** a resumed active/waiting checkpoint
   from the last two hours, for this exact app, can disambiguate plausible lanes
   or recover a unique recent app lane. Memory OFF / Remember work context OFF
   disables this input. A previously verified AI result can also be reused for
   its exact local context and unchanged candidate/consent signature.
5. **Nemotron:** only a stable context with multiple plausible lanes can request
   cloud matching, under the existing explicit AI/cloud-matching/sharing consent.
   A generic unknown context remains unassigned without spending a model call.

This is the goal-matching cascade, not a replacement for other AgentRuntime
reasoning, explicit chat, completion detection or Tavily research flows.

## Timing and suppression

| Parameter | Value | Purpose |
| --- | --- | --- |
| Local stable context | 30 seconds | Ignore short accidental switches |
| Ambiguous context before AI | 60 seconds | Avoid calling on every window change |
| Global matching request cooldown | 90 seconds | Bound requests across new ambiguities |
| Returning-context cache | 10 minutes, at most 16 entries | Reuse exact resolved contexts; cache null/error responses too |
| Collector continuity gap | At most 15 seconds | Sleep/missing samples cannot count as stable evidence |
| Useful resumed checkpoint age | At most 2 hours | Avoid treating stale work as the current lane |

The existing three-second collector means normal detection occurs at the first
sample after the threshold (roughly 30–33 seconds locally; 60–63 seconds before
HTTP for ambiguity, or up to roughly 90–93 seconds under the global cooldown).
Provider latency is additional. Explicit focus takes precedence immediately on
the next local sample and is also read directly by computed Work State.

A positive AI match remains valid during continuous unchanged work, even beyond
the returning-context cache TTL. It no longer disappears after a minute or
requires periodic reclassification just because time passed. Returning after a
window change requires the local debounce again. Changed goal plans, relevant
checkpoints, app rules, explicit focus or privacy invalidate the corresponding
result. Empty auto-created checkpoints with no resumed app evidence do not
invalidate another lane's result.

Privacy/excluded/idle samples clear evidence. Unknown contexts do not call AI.
DND, quiet hours, pause, Snooze, fullscreen, revoked sharing, missing provider
configuration, in-flight work and cooldown prevent a matching request. The
existing HTTP result validation additionally checks exact candidate IDs,
confidence, privacy, context generation and current candidate/meaningful context
signature. A delayed response cannot override new explicit focus.

## Focus and honest time attribution

Explicit focus is stored as a small identity-bound setting (`explicit_focus_goal`
with goal ID and creation identity). This distinguishes a user's choice from the
existing automatically selected Today fallback. It survives restart and becomes
invalid when the goal is parked, completed, deleted or no longer focused. It is
not personal memory and introduces no schema migration.

Local and cloud switches use the same existing backend goal transition. They
reset the interval boundary rather than backfilling elapsed time into the new
goal. Waiting checkpoints retain their waiting state during automatic focus.
Explicit focus and a remembered app determine direction; neither alone makes all
activity relevant. Their time attribution still requires conservative local
relevance evidence. Unsupported/unassigned activity can remain observed time
without inflating relevant time or confirmed completion.

## Computed Personal Work State

`src-tauri/src/work_state.rs` computes:

- `active_goal_id` and a live unfinished `active_step_id`.
- `working`, `waiting`, `stuck`, `drifting` or `away`.
- Confidence, last meaningful AgentRuntime event and evidence/source codes.
- The exact lane's public checkpoint and `waiting_for`, subject to memory controls.

Away takes precedence for unavailable, paused, idle or private/excluded context.
Waiting dependencies take precedence over stuck/drift heuristics. Distraction or
contradictory local evidence can report drifting while retaining an explicit
focus goal. Existing overdue/overrun/low-relevance heuristics provide stuck.
Unassigned context has zero confidence rather than a guessed goal.

The state is exposed in the existing dashboard IPC and TypeScript contract. No
new Today block is introduced. AgentRuntime reasoning receives its small
structured summary; checkpoint text remains only in the separately scoped and
budgeted memory envelope. Computing/sampling Work State does not write memories
or emit another reasoning event. Existing meaningful goal/step lifecycle events
remain independent of this transient state.

## Synthetic switching benchmark

Scenario: six active goals, six 90-second work segments and four six-second
accidental switches; 564 seconds total. Collector samples use virtual monotonic
time at three-second intervals. The single Nemotron response is a real HTTP call
to an isolated fixture, not a live provider. The reference models the previous
cloud-enabled ten-minute stability/cooldown rules.

| Work segment | Resolution | New detection time |
| --- | --- | --- |
| Orion launch | Local keywords | 30 seconds |
| Vega budget | Local keywords | 30 seconds |
| Atlas launch beta among similar goals | Nemotron fixture | 60 seconds |
| Quartz research in a generic Research workspace | Recent WorkContext | 30 seconds |
| Cobalt audit | Local keywords | 30 seconds |
| Return to Orion launch | Local keywords | 30 seconds |

Previous cloud behavior recognized **0 of 6** segments: every stable window was
shorter than 600 seconds. It made **0** matching calls in this short scenario and
performed **0** local-only resolutions because local matching was bypassed.

New behavior recognizes **6 of 6**, with **1 matching Nemotron call** and **5
local-only resolutions**. Short accidental switches do not change the lane. A
separate stationary ambiguity becomes eligible at **60 seconds**, versus **600
seconds** previously. These are detection/dispatch timings, excluding real model
latency. Counts cover goal matching; unrelated agent/chat/specialist calls are
not simulated by this benchmark. Machine-readable results are saved alongside
this report in `GOAL_MATCHING_PHASE_7_BENCHMARK.json`.

## Verification

- Full locked Rust suite: **337 passed, 2 pre-existing ignored**.
- Frontend suite: **126 passed** across 22 files; frontend production build passed.
- Final locked `cargo check`, native macOS locked `cargo build` and the exact
  benchmark test: successful. Rust formatting and `git diff --check`: successful.
- Release/update-signature tests: **13 passed**; contact tests: **8 passed**.

Sixteen new tests cover explicit focus and honest attribution, unique user rules
versus presets, six-lane strong local evidence, ambiguity through real fixture
HTTP, WorkContext disambiguation and Memory OFF, short/sustained switches,
similar/unknown goals, private/excluded/idle/paused samples, waiting plus step
identity without tick memories, null/error caching, stale cloud response after
explicit focus, restart/park focus identity, DND/sharing/cooldown, stuck/drifting,
the switching benchmark and cached return after another lane. Existing collector,
chat/skills, memory, privacy, voice and Park/Resume regressions remain included.

## Changed files

- `goal_matching.rs`, `goal_matching/resolution.rs`: cascade, timing, cache,
  guarded HTTP claim/apply and explicit-focus identity.
- `goal_matching/cascade_tests.rs`: deterministic scenarios, actual fixture HTTP
  and switching benchmark.
- `work_state.rs`, `models.rs`, `src/types.ts`: computed state and dashboard contract.
- `commands.rs`: shared collector matching and separate relevance attribution.
- `automatic_goals.rs`, `core.rs`, `goals.rs`, `skills.rs`, `work_context.rs`:
  capture user focus and preserve automatic/user focus precedence.
- `agent_runtime.rs`, `lib.rs`: computed-state summary and module integration.

## Known limitations

- Matching is heuristic. Unknown/ambiguous activity may remain unassigned; time
  never proves a goal or step is complete. Checkpoint app evidence is conservative
  and depends on saved context, controls and local installed-app identifiers.
- Matching still offers at most 20 open goals to the cloud model. Tests target
  the requested 3–6 parallel lanes.
- The cache and Work State are transient. Explicit focus persists; a restart
  begins a fresh local debounce. The matching cooldown itself is in-process.
- Native Windows build/runtime validation and live Nemotron accuracy are not
  established on this Mac. Shared Rust/React code adds no new platform APIs.
- Existing optional live-provider/credential-vault tests remain ignored. Tests
  use isolated SQLite databases and fixture credentials, not production data.
- No installer or GitHub release is produced. Version 0.26.1 stays unchanged;
  joint installers require a new synchronized version and Windows validation.
- Phase 8 is not started.
