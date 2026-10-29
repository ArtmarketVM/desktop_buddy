# Persistent personal memory

> Historical milestone / design record. This file describes its recorded source and may contain superseded UI, models, permissions or commands. For current behavior and diagrams, use the [documentation index](README.md) and [architecture](AI_ARCHITECTURE.md). Historical test results are not current live verification.


Phase 2 builds on Phase 1 commit `8e68da0`. It adds a local SQLite memory service
without replacing goals, chat history, progress, activity, or existing companion
cooldown memory. This phase is a source commit, not an installer release.

## Memory layers

### Working memory

`memory::working_memory` derives the active goal and explicitly selected step,
foreground app, tracking state, session start, last activity timestamp, and sample
timestamp from existing application state. The context field reports safe context
availability, not window contents. Nothing is written by reading working memory.
The session timestamp is transient and resets when the application process starts.

### Work context memory

`work_contexts` holds one current checkpoint per goal: optional step ID, a brief
summary, next action, status, app, optional reviewed window label, waiting reason,
and creation/update timestamps. User-authored checkpoints require confirmation,
validate step ownership and goal status, and use an expected update timestamp to
reject stale edits. They survive restart.

Selecting a goal for work can create a static initial checkpoint. Goal lifecycle
events update its status; completion or deletion of the referenced step clears
the stale step reference. Automatic checkpoints never copy an app window title,
an Accessibility sample, or a generated guess. App/window labels supplied through
the checkpoint API are explicitly reviewed, bounded, and checked for secrets.

### Episodic memory

Confirmed goal/step events are mirrored through SQLite triggers using fixed short
labels. Existing start, defer/resume, completion, reopening, and correction paths
are reused; no new Park/Resume feature is introduced. Intervention responses and
research ratings add similarly bounded events. Repeated identical research ratings
do not add new episodes. Waiting checkpoints add an event when their waiting state
or dependency changes.

No activity table trigger is installed. An activity tick, provider guess, window
sample, or timeout is not a personal memory event. No historical activity or old
chat transcript is backfilled during migration.

### Personal memory

Supported types are `explicit_fact`, `explicit_preference`, `inferred_preference`,
and `behavioral_pattern`. A memory includes confidence, source, evidence count,
creation/update/use timestamps, pin, and archive state. Scopes are `global`, `goal`,
and `conversation`; goal and conversation ownership uses real foreign keys.

Explicit facts and preferences require reviewed user input. Whitelisted boolean
setting changes can be remembered automatically; only changed fields are mirrored,
and defaults are not reclassified as explicit choices. This does not change actual
app settings when a user edits a remembered preference.

Inferred records are not directly writable through IPC. The backend evidence
service requires confidence at least 0.85 and three distinct confirmed same-scope
episodes spanning at least two UTC dates. Duplicate evidence cannot increase the
count. Weak guesses and user-authored episodes cannot establish a pattern. Evidence
remains a provisional local candidate until the threshold is met. Metadata is
computed from the accepted evidence rather than supplied by a webview or model.

Removing, editing, or archiving supporting evidence withdraws the derived memory
by archiving it. Unarchive requires sufficient evidence again and refreshes its
count and confidence. A user's explicit correction of an inferred preference or
pattern becomes an explicit preference or fact with user provenance.

## Migration

`memory/migrations/001_personal_memory.sql` is applied once inside a transaction.
`personal_memory_migrations` tracks the version independently of other project
schemas. A newer unsupported version is rejected rather than overwritten.

New tables:

- `memories`: persistent explicit, inferred, and episodic records.
- `work_contexts`: one durable goal checkpoint.
- `memory_evidence`: distinct evidence for provisional or promoted inferences.
- `personal_memory_migrations`: migration version and application timestamp.

Indexes support scope/type/recent queries. Constraints enforce type, scope,
ownership, confidence, evidence count, and bounded content. New event triggers
observe existing tables without replacing them. Migration tests preserve existing
goals, chats, and activity and verify idempotence and rejection of future versions.

## Backend and IPC API

All commands dispatch on workers and are restricted to the main workspace window.
Provider keys, arbitrary sources, evidence counts, confidence, and timestamps are
not accepted as user creation fields. Mutations increment the existing privacy
revision. No personal memory is automatically added to a Nebius or Tavily request.

Commands:

- `create_memory(input, confirmed)`
- `retrieve_memory(id)`
- `update_memory(id, input, confirmed)`
- `forget_memory(id, confirmed)`
- `archive_memory(id, archived)`
- `pin_memory(id, pinned)`
- `list_memories(query)`
- `clear_memory_scope(scope, confirmed)`
- `retrieve_work_context(goal_id)`
- `save_work_context(input, expected_updated_at, confirmed)`
- `get_working_memory()`

`list_memories` supports an exact scope, a memory type, recent ordering, an archive
filter, and a limit of 1–100. By default archived records are omitted. Reading a
specific active memory marks `last_used_at`; list views do not mark every result
as used. Pin and archive state survive restart. Scope clearing affects this new
layer only, including a goal's checkpoint, not its goals/chat/activity records.

Example explicit memory input:

```json
{
  "memory_type": "explicit_preference",
  "scope": {"scope_type": "global", "scope_id": null},
  "content": "Use concise answers"
}
```

Example query for recent memories belonging to one goal:

```json
{
  "scope": {"scope_type": "goal", "scope_id": 12},
  "memory_type": null,
  "limit": 30,
  "include_archived": false
}
```

## Privacy and retention

Memory text is limited to a reviewed single line of at most 500 characters; window
labels have a smaller 160-character limit. Credential markers, common token/key
formats, control characters, and opaque password-like strings are rejected. The
filter is conservative and heuristic; it is not a complete secret detector.
Automatic events/settings use fixed labels or whitelisted scalars instead of raw
user/screen content.

Automatic history retention expires unpinned old episodes and completed old
checkpoints. Explicit facts/preferences remain until deleted or their scope is
deleted. Pinned scoped records protect their parent goal/conversation from automatic
history cleanup. Explicit owner deletion still cascades; pin does not override
scope deletion or confirmed full local-history clearing.

Confirmed full history clearing removes all personal memories, evidence, and
checkpoints, including pinned ones. Actual app settings and provider credentials
follow their existing separate policies. Forget and scope clearing remove pending
evidence as well as promoted memory. User information is not logged or exported.

## Verification and limits

Tests cover database reopen, checkpoints, scope isolation, explicit preferences,
evidence thresholds, pin/archive/forget, legacy migration, malformed/secret input,
stale edits, actual lifecycle and feedback hooks, absence of tick-based memory,
retention, ID reuse, rollback, and inference withdrawal/correction.

This phase supplies the service and IPC foundation. It does not add a memory
management screen, chat fact extraction, a background inference generator, vector
search, automatic memory retrieval into provider prompts, or a new agent runtime. Inference candidates
require a trusted backend caller; no personality traits are inferred automatically
by this phase. The storage remains local SQLite with the app's existing access
model, not a new encrypted database. Goal deletion follows foreign-key ownership;
the existing goal undo format does not yet restore this new memory layer.
