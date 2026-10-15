# sumi skill workflows on the 0.31.3 baseline

This implementation builds on baseline commit `9f233b0` (0.31.3). This is a source
update, not a delivered installer. The release version remains
0.31.3 until a new installer is built and validated for Windows x64 and Apple
Silicon macOS 14.5+. Shared Rust execution and React rendering serve both systems.

## Readable answers

The current `agent_dialogue` response writer receives an authoritative canonical
receipt after verified execution. Use short outcomes
for simple mutations, grouped lists for goals and daily results, and read-only
Markdown task lists for goal steps. Canonical fallback receipts use the same
layout for mutation fallbacks. The baseline's safe unavailable response remains
in force when a natural read response cannot be verified. Checkboxes describe saved completion; they do
not execute actions. Research source links accept only HTTP(S) URLs without
credentials, and raw HTML remains escaped.

The model is instructed to follow this presentation and factual source. This
does not establish perfect formatting or intent interpretation for every live
provider response. Runtime labels and deterministic fallback text are English.

## Goal creation, properties and scheduling

The baseline's 26 skills, including `inspect_conversation` and
`inspect_work_queue`, remain available. The registry has 37 skills with these
11 additional workflows:

| Skill                 | Contract                                                                                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_planned_goal` | Create with title, area, description, timezone-qualified deadline, priority, completion criterion and up to 20 steps. `date=null` leaves it in the backlog; a local `YYYY-MM-DD` date schedules it. |
| `update_goal`         | Change explicitly supplied properties. Null leaves a field unchanged; `clear_fields` clears description, deadline, priority or completion criterion. Conflicting set/clear operations are rejected. |
| `find_goals`          | Search all stored goals by title/description and filter by status, area, priority, scheduled date and overdue deadline. Return 1–40 items per page with total, offset and retained filters.         |
| `schedule_goal`       | Include/remove an open goal in a particular day's plan. This does not set its deadline or select focus.                                                                                             |
| `reorder_steps`       | Supply each actual step ID exactly once; preserve IDs, completion marks and current step.                                                                                                           |
| `set_current_step`    | Select an unfinished step or clear selection. Never start a timer.                                                                                                                                  |
| `restart_goal`        | Preview a full checklist reset and execute only after confirmation.                                                                                                                                 |
| `undo_last_goal_edit` | Undo the most recent supported single edit in this conversation while domain state, local day and permissions remain unchanged. Read operations preserve the journal.                               |
| `update_work_context` | Update summary, next action, waiting item or a user-reported result without changing focus, parking or completing the goal. Requires enabled work-context memory.                                   |
| `inspect_research`    | Read a saved ready research receipt belonging to the exact goal, with actual sources and original step.                                                                                             |
| `add_research_step`   | On explicit request, append the receipt's saved next action as an unfinished step in its original open goal. Repeated addition is rejected.                                                         |

The original `create_goal` remains a compatibility shortcut that adds a goal to
Today. New planning prefers `create_planned_goal`. Property inspection now includes
area, description, deadline, priority, completion criterion, current step and
scheduled dates. The workspace retains the baseline's 40-goal summary limit;
there is no unbounded goal index. Filtered search returns up to 40 compact
summaries per page, with clipped title/next-step previews and explicit progress
counts. Full assignment details require `inspect_goal`. The last page's filters,
offset, total and real goal IDs are retained per conversation for pagination and
follow-up reads. Only existing IDs from that bounded page extend the dialogue
schema; they do not authorize mutation. Sharing disabled hides this search state.

## Integration with the current dialogue engine

These workflows use the baseline's read-plan-write loop, explicit conversation
executor argument, semantic mutation authorization, response review, target
disambiguation and privacy revision checks. Read-only intent cannot escalate into
mutation after a tool read. An explicit mutation request may inspect its target
before execution, subject to the existing independent authorization check.
New batch objects use actual `last_created` or `previous_action` references.

Goal receipts retain the baseline's nullable `checkpoint` contract. Private
work-context content is omitted when work-context memory is disabled. Existing
conversation retrieval, queue order, credential adapters, research evidence
validation and signing/updater trust remain unchanged. No older chat formatter
or keyword mutation router replaces the current engine.

## Completion and undo

`complete_goal` now previews completing every step and stopping that goal's timer.
`reopen_goal` preserves checklist progress. A persisted override keeps a reopened
goal open even when its old checklist is fully done, including after screen
refresh or metadata editing. Progress changes release the override; explicit
completion or restart removes it. Other existing UI transition contracts remain
unchanged.

Undo supports single rename/property/order/current-step/scheduling edits. It
restores saved properties, plan and day membership/modes, including the original
membership order. It does not rewind
timers, network calls, completion, deletion, arbitrary multi-action batches or
memory/research updates. Those actions invalidate the edit journal. Goal deletion
continues to use its existing expiring backup and `restore_goal` workflow. Undo
records cascade with their conversation and cannot be applied across chats.
Reading goals, history, research or queue information may update conversational
references without invalidating undo. Any later domain mutation, permission
change or local-day change makes a stale journal unavailable. Journal payloads
contain restorable goal properties and scheduling state, without checkpoint or
research content; a compact valid journal summary grounds an explicit undo
request even after unrelated reads.

Confirmation is backend-owned, expires after five minutes and is invalidated by
changed state or permissions. Preview receipts distinguish proposed changes from
committed results. All skill batches remain atomic; validation failures roll back
the entire batch. No new execution skill accepts arbitrary code, SQL or paths.

## Context, daily review and research

The baseline's duplicate-target guard remains authoritative. A model cannot
select one of several identical goal titles without a stable user selection or
an original conversation reference. Newly created batch goals use their own
references rather than stale existing goals. Live-model interpretation still
needs provider testing.

Today receipts separate recorded completions, remaining Today goals, waiting
items and activity time. Daily continuity uses headings and task lists, omits
internal goal IDs, retains completion provenance and reports omitted facts.
Updating a user-reported result never creates completion evidence. Waiting data
is included only when work-context memory is enabled.

Research receipts separate findings, suggested next action and source links.
Adding a suggested step is explicit and never marks it complete. Existing Tavily
confirmation, ownership, saved-source validation and runtime-only credentials
remain unchanged. Reading saved contextual research or turning its suggestion
into a step requires enabled work-context memory, matching the baseline's
privacy controls.

## Verification and limitations

Windows source validation on 2026-10-15: the full
`cargo test --locked --manifest-path src-tauri/Cargo.toml` run passed 482 tests
with two existing ignored tests. After the final saved-research memory guard,
all 17 enhancement tests passed again. `npm test -- --maxWorkers=2` passed 170
tests in 30 files; `npm run build`, all 18 `npm run test:release` checks and
`git diff --check` passed. Frontend tests were reused across the baseline's
version-only frontend update; production build and release checks were repeated
on 0.31.3. Native macOS validation remains a separate platform requirement.

Regression coverage exercises backlog creation and properties, timezone
normalization, scheduling, filtered pagination beyond 40 goals, preserved reopen
and confirmed restart/completion, refresh behavior, stable step identity,
single-edit undo after reads, cross-conversation isolation and stale-state
rejection, bounded search schema reachability, checkpoint updates without completion,
research ownership and explicit step creation, privacy and transaction rollback.
Renderer tests cover disabled checkboxes, safe links and escaped HTML. Mocked
dialogue tests verify the new workflows pass through semantic authorization and
response review, preserve focus, and provide canonical receipts to the writer.

Native macOS validation requires the existing Apple Silicon CI runner. Local
Windows checks and mocked HTTP tests do not prove live provider accuracy, native
macOS behavior or installed-app UI behavior. No release is published by this
source update. Visual inspection was unavailable because the browser runtime
failed to initialize; Markdown rendering is covered by automated tests.
