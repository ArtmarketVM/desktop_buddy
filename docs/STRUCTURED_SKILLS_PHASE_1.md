# Structured skill execution

Phase 1 adds backend-owned chat actions to the existing application. It does not
introduce an agent runtime, a new memory system, or a new Tavily flow. This is a
source commit, not an installer or published release; installer versions remain
unchanged.

## Request pipeline

1. The existing chat command saves the user's question in its original conversation.
2. Nebius plans a structured action using the registry, actual goal and step IDs,
   ordered steps, conversation references, and an opaque state version.
3. Rust validates the JSON, skill arguments, sharing consent, object identity,
   ownership, and the current database state before executing anything.
4. A SQLite savepoint commits the entire batch, its undo records, and conversation
   references together. Any error rolls back the entire batch.
5. The formatter receives only authoritative structured results. A local readable
   receipt remains available if formatting fails or sharing changes after commit.
   The existing question/answer persistence and chat update events are reused.

Ordinary conversation continues through the existing research and chat pipeline.
There is no production fallback to the old fuzzy text action executor. Its old
parsers and mutation helpers remain test-only regression fixtures; the existing
goal backup serialization and history restoration helpers are reused in production.

## Registry

Every skill declares a name, description, strict input and result schemas, a
backend validator, a safety level, and an executor. Backend results are checked
against their result contract before the transaction is released.

- Goals: `list_goals`, `inspect_goal`, `create_goal`, `rename_goal`, `delete_goal`,
  `restore_goal`, `add_goal_to_today`, `remove_goal_from_today`, `set_focus_goal`.
- Steps: `create_step`, `rename_step`, `delete_step`, `complete_step`, `reopen_step`.
- Existing chat behavior retained: `complete_goal`, `reopen_goal`.

No skill accepts executable code, SQL, shell commands, file paths, or arbitrary
provider-selected function names. Rust selects only registered executors.

## Conversation references

`buddy_action_state` stores `last_referenced_goal_id`, `last_referenced_step_id`,
`last_created_goal_id`, `last_created_step_id`, and `last_action` per conversation.
Additional goal creation timestamps and a created-step owner prevent references
from crossing goals or targeting reused SQLite IDs. References survive restarts
and cascade away when their conversation is deleted.

An ordinal is a one-based position in the current full ordered checklist,
including completed steps. References to prior actions in one batch are resolved
by Rust after each action; the model never predicts IDs of newly created objects.
Unknown, missing, or ambiguous references produce clarification without mutation.

`buddy_action_version` and SQLite triggers invalidate plans after changes through
existing goal/step/Today operations, including a change followed by a reversal.
Activity time ticks do not invalidate plans. The state is checked both under the
application mutex and inside the SQLite savepoint.

## Safety and privacy

Deleting a goal uses the existing 30-day undo backup format. Restoration uses an
exact backup ID and preserves checklist IDs, completion state, recorded time,
events, goal details, and app rules. Existing history retention can remove an undo
backup sooner; restoration does not promise to recover every unrelated historical
record or provider recommendation.

Deleting a step requires confirmation of the entire previewed batch. Nothing is
changed during preview. A confirmation lasts five minutes and is invalidated by
relevant state or privacy changes. Confirmations are consumed once. Other messages
cancel the pending confirmation before normal planning continues. Confirmation is
handled locally, not inferred by the model.

The planner shares existing goals and references only when goal-context sharing
is enabled. With sharing off, it can create a goal from the user's own input but
cannot inspect or mutate existing objects. Existing AI opt-in, privacy revision,
mock-mode separation, provider credentials, and network policies remain in force.

## Verification

New tests cover the requested create/rename/complete/delete/restore actions,
invalid IDs and cross-goal steps, multi-action batches, Russian follow-up and
ordinal references, ambiguity, stale state, malformed provider JSON, rollback,
confirmation cancellation and replay, privacy changes, ID reuse, persistence,
result schemas, and mocked HTTP orchestration. Existing chat, goals, tracking,
privacy, and release verification tests remain part of the full suites.

## Limits

- Planning remains a remote model decision. Tests use synthetic HTTP responses;
  they do not establish live Nemotron intent accuracy or account/model support.
- The planner receives at most 40 goals, prioritizing the last referenced goal,
  and can execute at most 20 actions in one batch. Unrepresented objects require
  clarification rather than an inferred ID.
- Confirmation accepts explicit `Confirm`/`Yes` or `Подтверждаю`/`Да`; cancellation
  accepts `Cancel`/`No` or `Отмена`/`Нет`. The fallback receipt is in English.
- Goal-context sharing is required for operations on existing goals.
- This phase adds shared Rust behavior. No new OS adapter or frontend interaction
  is required. Native Windows installation and live provider calls are separate
  checks; no release is published as part of this phase.
