# AI coaching foundation

This is the historical backend-stage report for `a3340dc`. For the interactive
0.36.0 source integration and its validation status, see
`AI_COACHING_INTEGRATION.md` and `RELEASE_0.36.0.md`.

This source stage implements the shared backend foundation described in
`AI_COACHING_INTEGRATION.md`. It does not yet connect coaching to the UI, chat
planner, LLM gateway or background notifications, and does not deliver an installer.

## Strategy contract and session service

`src-tauri/src/coaching/strategy.rs` defines a versioned registry with strategy
kind, required context, eligibility, contraindications, transitions, global
controls, outcomes, memory permissions, communication principles and limits.
Each workflow supplies its own initial payload, structured reply validator,
proposal validator and reducer through a handler. The session manager does not
interpret a workflow's payload or accept a provider-selected next state.

The first registered workflow is `tiny_habits` version 1. Its typed responses
cover readiness, a user-selected barrier, ease score, optional anchor, commitment
and reported outcome. Proposals use a separate backend method and cannot report
completion. The ease threshold of 8/10, two revisions, two attempts and a total
transition budget of 64 are MVP heuristics, not scientific constants. Pausing
preserves the previous step; stopping ends the session. External dependency and
explicit commitment refusal are terminal outcomes.

Rust `Storage` operations provide target inspection, start, active-session lookup, session inspection,
structured replies, proposals and context building. Callers supply the real goal,
optional unfinished step, conversation ID and expected revisions. No new Tauri
commands are registered at this stage. A later UI/chat integration must ensure
that start/reply/control calls represent explicit user intent; provider output
must use the proposal path only.

## Persistence and freshness

`coaching/schema.sql` adds an independent, transactional versioned migration:

- `coaching_revision_clock` prevents revision reuse when a deleted goal ID is
  assigned to a new goal. `coaching_goal_versions` maintains target revisions for goal text,
  lifecycle state, plan and details changes, including an edit followed by reversal.
- `coaching_sessions` stores the versioned strategy, target binding, workflow
  payload, session revision, status and timestamps. One open session is allowed
  per goal and per conversation; paused sessions remain open.
- `coaching_requests` stores exact request identities and original replies in the
  same transaction as each state change. The same ID/input returns its original
  response; using an ID for different input is rejected. After replay, clients
  should inspect the session to obtain its latest revision.

Targets are validated before progression. Stale session replies are rejected;
pause and stop remain available for stale targets. Starting with current target
context can invalidate an obsolete open session atomically. Goal/step completion
cannot be inferred from elapsed time or a coaching micro-action. This module
does not mutate goals, steps, timers, deadlines or notification settings.

Only this module's migration version changes. Existing delivered installer
versions and signing configuration remain unchanged.

## Memory and privacy

Minimal session state is application workflow data, separate from optional
long-term Personal Memory. Turning Memory off suppresses memory retrieval and
new outcome memories; it does not erase existing workflow state. The UI must
explain that distinction before exposing the feature. Explicit clear/forget
operations remove the applicable workflow data as described below.

Completion alone does not save a personal fact. A structured user report must
include `remember: true`, and Memory, Remember work context and Learn from
feedback must all be enabled. The existing memory service then stores one
goal-scoped explicit fact: the user reported completing the named micro-action,
which does not establish goal/checklist completion. It uses user provenance and
does not supply verified-event evidence for inferred preferences or patterns.
No barrier hypothesis, psychological trait or raw transcript is saved as a fact.

The context builder reuses scoped retrieval with at most five memories and a
4,000-byte personal-memory budget. It requires the caller's current backend
goal-sharing permission; when sharing is false it returns only an unavailable
marker. It performs no network requests. Future provider integration must
snapshot privacy, release the application lock before a network wait, then
recheck privacy and session/target revisions before submitting a proposal.

Deleting a goal or conversation cascades to its sessions and request records.
Deleting a session also removes its associated remembered report, and forgetting
that report removes its originating session. History retention removes old
sessions by last update; pinned outcome facts and their sessions survive automatic
retention. Explicitly clearing history removes all sessions. Clearing Personal
Memory, forgetting a goal's work context, or forgetting goal/conversation memory
also removes the applicable sessions, including cached responses. Goal-scoped
reports are removed with their originating conversation through the session link.

No provider calls, credentials, platform APIs or background timers are introduced.
`AI_MOCK`, `DEMO_MODE`, existing sharing controls and updater trust remain unchanged.

## Verification and next integration

Regression tests in `coaching/tests.rs` exercise the complete structured flow,
duplicate requests, stale replies/targets, refusal, blockers, pause/resume,
revision/attempt/transition limits, ownership, restart, memory controls, scoped
context, migration guards, retention and cascading deletion.

Verified on Windows:

- `cargo test --locked --manifest-path src-tauri/Cargo.toml --test backend`:
  512 passed, zero failed, two existing opt-in tests ignored; includes 30 new
  coaching tests. The HTTP fixtures require access to local test servers; the
  complete run passed outside the network sandbox.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: passed.
- `git diff --check`: passed.

The initial default-target test run could not start the library test executable
on Windows (`STATUS_ENTRYPOINT_NOT_FOUND`). The successful full suite uses the
repository's explicit `backend` test target, which includes native Windows
resources. No live paid-provider or credential-write tests were enabled.
Frontend files were unchanged. Native macOS validation and installer builds
were not performed in this Windows source stage.

After this backend stage, connect the existing goal card and chat to these
operations, add reviewed session controls and a real provider proposal gateway,
and validate the complete user journey on Windows x64 and macOS Apple Silicon.
The shared foundation contains no platform-specific branches; native macOS
validation still requires a macOS runner. A released feature installer requires
the synchronized minor version bump and both-platform release checks specified
by the repository conventions.
