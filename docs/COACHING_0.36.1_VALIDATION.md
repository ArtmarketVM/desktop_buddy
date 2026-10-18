# Desktop Buddy 0.36.1 coaching chat fix

The 0.36.0 UI showed a coaching form beside an ordinary chat. A reply in the
composer could therefore discuss the global focus instead of the coaching goal.
In 0.36.1 a dedicated coaching conversation routes composer messages through its
saved session. Existing coaching conversations are bound during migration,
including ended sessions, so an external blocker cannot silently change goals.

Questions and replies use the existing message store. The compact panel retains
the goal, pause/resume, explicit exit and an unchecked result-memory option.
Starting the reviewed session confirms readiness; subsequent answers are interpreted
from the person's own text. The provider returns only a bounded interpretation,
optional action and conversational wording. Rust validates allowed transitions,
evidence, limits, current goal revision, permissions and session identity.

Only reported micro-action completion is recorded. Parent goals, checklist steps,
timers and deadlines remain unchanged. Remembering a report requires the explicit
checkbox and the existing memory permissions. Workflow persistence is independent
of optional Personal Memory.

Turn metadata references the existing transcript rather than copying it. Retries
reuse the original turn. State changes, memory writes and the assistant message
commit atomically; pause, exit, deletion, target edits and privacy changes discard
in-flight output. A blocked or completed session stays bound until explicit exit.

## Verification

Backend fixtures cover real HTTP text turns, unrelated-goal exclusion, ambiguous
answers, external blockers, replay, rollback, migration, interrupted turns, consent
changes and memory opt-in. UI tests cover compact controls, dedicated entry and
the composer route with a different globally focused goal. Ordinary voice and
queued chat retain their existing regression coverage.

`--check-coaching` exercises the five required text answers and, when needed,
an explicit action-suggestion request through the real provider, with synthetic in-memory
data only; it does not open the installed user database. Live success establishes
one scenario, not general model quality. Native Windows x64 and Apple Silicon
macOS validation and signed artifact checks are required before publication.
Trusted updater keys and the reviewed macOS internal signing identity are unchanged.

Local Windows validation passed:

- `cargo test --locked --manifest-path src-tauri/Cargo.toml`: 544 passed, zero
  failed, two existing opt-in tests ignored. Twelve coaching-chat fixtures and
  the ordinary send-route regression are included.
- `npm test -- --exclude '.tools/**'`: 221 passed across 39 files. The two coaching
  UI files also passed a focused run: eight tests.
- `npm run build`: passed with synchronized version 0.36.1.
- `npm run test:release`: 18 passed; `npm run test:acceptance:runner`: nine passed.
- Rust formatting and whitespace checks passed.

The local historical checkout under ignored `.tools` is excluded from Vitest.
HTTP fixtures require loopback access outside the execution sandbox. Manual
installation and visual checks on physical Windows and Mac systems are not
established by these automated checks.

The live probe passed all five required text turns through the shared dialogue
model adapter. It reached a synthetic reported micro-action completion while
preserving the parent goal and checklist. One response incorrectly repeated an
action at the anchor step; validation rejected it and the bounded repair returned
the valid skip response. An additional fixture covers requesting a suggestion
when the barrier answer does not include one. The diagnostic now reports safe
stage/event metadata on failure rather than hiding the failed step.
