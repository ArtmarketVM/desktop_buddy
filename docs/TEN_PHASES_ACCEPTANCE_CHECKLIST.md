# sumi ten phase acceptance checklist

> Historical milestone / design record. This file describes its recorded source and may contain superseded UI, models, permissions or commands. For current behavior and diagrams, use the [documentation index](README.md) and [architecture](AI_ARCHITECTURE.md). Historical test results are not current live verification.


This checklist translates the changes described in `Desktop_Buddy_10_phases_RU.docx` into repeatable acceptance checks. It covers all ten development phases and the installation, privacy, and regression checks described in the document. Each item states an action and an observable expected result.

The source document describes version 0.27.0; the checkout was subsequently updated to 0.27.3. Verify the installed build and the source revision before testing; this checklist does not establish that an installed release has passed verification. All boxes are initially unchecked. Test counts and release claims in the source document are historical claims, not results of this checklist.

## Automated execution

Run `npm run test:acceptance` for mapped deterministic checks and a Markdown/JSON report. On Windows with this repository's local Rust toolchain, run `powershell -ExecutionPolicy Bypass -File scripts/acceptance.ps1` to initialize available Visual Studio build tools first. See [Acceptance automation](ACCEPTANCE_AUTOMATION.md) for commands, evidence scopes, remaining native checks, and CI reports. The runner does not check the boxes in this file or claim live-provider or installed-app acceptance.

## Recording results

Run every applicable check independently on Windows x64 and Apple Silicon macOS 14.5 or newer. Record results in a separate run log using the IDs below. A checked box means the item passed on both platforms; use the run log for partial results, failures, and blocked checks.

| Field            | Record for each platform                                                               |
| ---------------- | -------------------------------------------------------------------------------------- |
| Test environment | OS version, architecture, installed Buddy version, source tag or commit when available |
| Run details      | Tester, date, local timezone, clean install or update, previous installed version      |
| Provider setup   | Configured model, live or mock responses, permission settings; never record keys       |
| Per check        | ID, Pass / Fail / Blocked / Not applicable, actual result, evidence, issue reference   |

Use a disposable profile or supported isolated test environment for deletion, permission, database, and update tests. Keep runtime credentials outside the repository. Use synthetic goals and synthetic secret-like strings for privacy tests. UI evidence must not expose credentials or private window contents.

## Preparation and first pass

- [ ] PRE-01 — Confirm the installed version and platform. Expected: the tested build is the intended release; Windows is x64 and macOS is Apple Silicon with OS 14.5 or newer.
- [ ] PRE-02 — Prepare two independent goals, `Hackathon application` and `Client proposal`, each with at least four distinct steps. Add one completed step, one explicit waiting dependency, and one confirmed result. Expected: the fixtures are distinguishable and their initial state is recorded.
- [ ] PRE-03 — Configure real Nebius and Tavily using runtime credentials; check the required consent settings. Expected: live checks use real HTTP, `AI_MOCK` is off, and simulated observations are identified separately through `DEMO_MODE`.
- [ ] PRE-04 — Grant the platform permissions needed for observation and speech; install or enable a supported local speech language. Expected: permissions and available languages are visible and can be changed during testing.
- [ ] PRE-05 — Save a baseline of goals, steps, Today, chats, activity, progress, and relevant settings before an update. Expected: later preservation checks can compare actual data rather than recollection.

For a first pass, run REL-03, REL-04, P01-01, P01-04, P04-01 through P04-04, P06-01 through P06-03, P08-01 through P08-03, P09-05, and P10-03. Passing this subset does not replace the full checklist.

## Phase 1 Structured actions through chat

- [ ] P01-01 — Ask Buddy to create `Hackathon application`, then list goals and open its details. Expected: one persisted goal appears; the response names the actual created object.
- [ ] P01-02 — Rename the goal, delete it through chat, and restore it through chat within the configured retention period. Expected: each operation affects that goal; restoration follows the configured cleanup policy, normally up to 30 days. The Goals interface's Delete permanently action does not create this chat undo backup.
- [ ] P01-03 — Add the goal to Today, remove it, select it in focus, complete it, and reopen it. Expected: the corresponding UI and persisted state agree with each response.
- [ ] P01-04 — In one conversation, create a goal, ask for four steps, delete the second, and complete the first. Expected: references remain attached to the same goal; the deleted and completed steps match the full current list order.
- [ ] P01-05 — Add, rename, delete, complete, and reopen individual steps. Expected: the intended step changes; deletion requires confirmation and neighboring steps remain intact.
- [ ] P01-06 — Include completed steps in a list and refer to a step by ordinal. Expected: numbering includes completed steps and follows the current complete order, rather than only the unfinished subset.
- [ ] P01-07 — Give an ambiguous instruction with two plausible goals or steps. Expected: Buddy requests clarification and makes no guessed change.
- [ ] P01-08 — While a response is pending, change or delete the target or revise its plan. Expected: a stale action cannot change another object or overwrite newer data.
- [ ] P01-09 — In an isolated integration test, submit invalid goal IDs, a step belonging to another goal, and an action forbidden by current permissions. Expected: validation rejects the actions without unrelated changes.
- [ ] P01-10 — Force one action in a grouped change to fail validation. Expected: the group leaves no partially applied database changes, and the reply does not claim success.
- [ ] P01-11 — Request each read-only command family: saved context, waiting items, day results, and research feedback. Expected: the requested view or action is routed correctly; an informational question does not mutate focus or completion.

## Phase 2 Persistent memory and goal context

- [ ] P02-01 — Save a work context for each fixture, close Buddy, and reopen it. Expected: both contexts survive independently; ephemeral current-session state is not required to survive.
- [ ] P02-02 — Start work, Park, Resume, confirm a result, and record a waiting dependency. Expected: meaningful events are associated with the correct goal.
- [ ] P02-03 — Repeatedly switch windows without meaningful work events. Expected: every window switch does not create a new permanent memory entry.
- [ ] P02-04 — Add and explicitly confirm a useful fact or preference, then reopen Buddy. Expected: the approved entry persists and can be inspected.
- [ ] P02-05 — Decline one suggestion. Expected: one refusal does not become a permanent claim about the user's personality or preferences.
- [ ] P02-06 — Edit or clear personal memory. Expected: chat history, goals, steps, and activity remain separate; memory changes do not silently erase them.

## Phase 3 Memory selection and user controls

- [ ] P03-01 — Ask about the hackathon while the client goal has newer and pinned memories. Expected: selected memory is relevant to the hackathon; unrelated client context is excluded.
- [ ] P03-02 — Create more than eight eligible entries with long text and inspect the default retrieval path. Expected: selected memory stays within eight entries and 6,000 bytes; the whole database is not sent to the model.
- [ ] P03-03 — Inspect work, preferences, patterns, waiting items, and saved-context categories. Expected: stored entries are visible in their appropriate categories.
- [ ] P03-04 — Edit, pin, and forget individual entries, then restart. Expected: each change persists; forgotten entries are no longer retrieved.
- [ ] P03-05 — Clear memory for one goal. Expected: that goal's memory is removed without removing its goals or steps or clearing the other goal's memory.
- [ ] P03-06 — Clear all personal memory. Expected: personal memory is removed while goals, steps, and ordinary history remain intact.
- [ ] P03-07 — Turn Memory off and trigger a scenario that normally writes and reads it. Expected: corresponding memory use and recording stop; existing goal and chat records remain.
- [ ] P03-08 — Toggle work context, preferences, feedback, and conversation-context memory separately. Expected: each setting controls the corresponding behavior and persists across restart.
- [ ] P03-09 — Cause AI to propose a preference. Expected: the proposal is validated and available for user review; it is not accepted unconditionally as permanent memory.

## Phase 4 Park and Resume

- [ ] P04-01 — With goal A in focus and its manual timer running, use Park from Today. Expected: the saved record shows where work stopped, one concrete next action, a confirmed result if present, and an explicit waiting dependency if present; goal A is marked Parked and its timer stops.
- [ ] P04-02 — Park goal B from Goals, then inspect both expanded context records. Expected: both entry points work, and A and B retain separate checkpoints and waiting details.
- [ ] P04-03 — Resume goal A through the interface. Expected: A returns to focus and Today, and a suitable unfinished step is restored; its manual timer remains stopped.
- [ ] P04-04 — Restart Buddy and Resume each fixture. Expected: each goal restores its own saved next action without borrowing the other goal's context.
- [ ] P04-05 — Ask in chat to save the current stopping point and later return to the named goal. Expected: the commands resolve the intended goal and expose the saved context through the same validated workflow.
- [ ] P04-06 — Ask only where work stopped. Expected: the checkpoint is displayed without changing focus, Today, or completion state.
- [ ] P04-07 — Observe Resume effects. Expected: it does not launch arbitrary external applications, start a timer automatically, or mark a new result completed.
- [ ] P04-08 — Repeat with six parallel goals, and add a seventh. Expected: contexts remain independent; six is not a hard storage limit.
- [ ] P04-09 — Disable Memory or Remember work context and try Park/Resume. Expected: unavailable operations have understandable guidance and do not fabricate or silently replace context.
- [ ] P04-10 — Disable AI assistance, revoke goal-context sharing, remove Nebius configuration, or force generation failure before creating an AI checkpoint. Expected: no invented checkpoint is saved; existing saved context is preserved.
- [ ] P04-11 — Inspect a checkpoint generated while a synthetic window exposes a long body of text. Expected: it contains concise allowed task context rather than a copied full screen or window body.

## Phase 5 Event coordinator and background limits

- [ ] P05-01 — Trigger messages, goal/step changes, result confirmation, a stable context change, Park/Resume, likely difficulty, and a new day. Expected: AgentRuntime handles applicable events; an event need not produce a visible suggestion.
- [ ] P05-02 — Trigger several closely spaced related events. Expected: requests are coalesced and cooldowns are respected, rather than one cloud request per event or observation.
- [ ] P05-03 — Change goal or context while an AI request is pending. Expected: obsolete work is canceled or its reply is discarded; it cannot modify the new context.
- [ ] P05-04 — Enable DND, pause, quiet hours, or an out-of-working-hours restriction in turn. Expected: background help is suppressed according to each setting.
- [ ] P05-05 — During a background restriction, send an explicit chat request. Expected: it is handled through the explicit-command path subject to its own permissions, without enabling background help globally.
- [ ] P05-06 — Remove observation permissions or use private/excluded applications. Expected: they do not supply normal background analysis context.
- [ ] P05-07 — Using isolated instrumentation, warm up the runtime and submit 1,000 stable observations. Expected: no new AI calls, runtime events, or database writes occur in the tested stable backend path; do not treat this as a UI energy measurement.

## Phase 6 Voice through the shared action path

- [ ] P06-01 — Speak a create-goal command and an add-step command in each supported local language. Expected: recognized text takes the same validated action path as typed text and affects the correct objects.
- [ ] P06-02 — Speak a goal-deletion command. Expected: recognized text and a confirmation are shown before deletion; canceling preserves the goal.
- [ ] P06-03 — Speak a step-deletion command. Expected: confirmation is required; confirm and cancel each produce the intended outcome.
- [ ] P06-04 — Compare a typed and spoken reference such as “complete the first step.” Expected: both resolve the same goal and full step order; explicit completion is recorded as a manual user action.
- [ ] P06-05 — Deny microphone permission, use an unavailable language, or make recognition fail. Expected: a clear recovery path and manual text entry remain available; no guessed action is executed.
- [ ] P06-06 — Inspect live provider traffic using synthetic speech. Expected: source audio is not sent to Nebius or Tavily; only permitted recognized text/context enters subsequent processing.

## Phase 7 Activity matching and work states

- [ ] P07-01 — Set explicit focus while another goal has matching application context. Expected: the explicit focus takes precedence in goal selection.
- [ ] P07-02 — Clear explicit focus and configure a user application rule that conflicts with local text matching. Expected: the applicable user rule has priority.
- [ ] P07-03 — Use a stable strong match to a goal title, description, or unfinished step without an overriding focus/rule. Expected: local matching becomes eligible around 30 seconds; record actual timing and do not require an exact stopwatch deadline.
- [ ] P07-04 — Use stable ambiguous context between suitable goals with AI matching enabled. Expected: cloud matching becomes eligible around 60 seconds, subject to cooldown and provider latency.
- [ ] P07-05 — Repeat ambiguity with AI matching disabled and perform brief unrelated window switches. Expected: no forbidden cloud matching occurs; transient context is ignored and unknown context may stay unassigned.
- [ ] P07-06 — Resume a goal and provide context in which the saved work is relevant. Expected: recently resumed context can help selection without overriding explicit focus or an applicable user rule.
- [ ] P07-07 — Exercise Working, Waiting, Stuck, Drifting, and Away using controlled activity and explicit waiting records. Expected: states match their documented meanings; Stuck remains a hypothesis, and idle/pause/private/excluded context can produce Away.
- [ ] P07-08 — Observe repeated state updates. Expected: they do not create a permanent personal judgment or a memory entry on every refresh.
- [ ] P07-09 — Keep a goal in focus while spending time in unrelated activity. Expected: observed time and relevant work time remain distinguishable; focus does not make all observed time productive.

## Phase 8 Contextual research and result confirmation

- [ ] P08-01 — Trigger likely difficulty and wait for a research offer. Expected: an offer alone does not call Tavily.
- [ ] P08-02 — Decline the offer. Expected: no search starts; feedback belongs to the correct goal.
- [ ] P08-03 — Accept an offer for an identified unfinished step. Expected: permitted goal/step/checkpoint/memory context yields a short public query, Tavily sources, a grounded answer, and a useful next action attached to that goal.
- [ ] P08-04 — Inspect the synthetic Tavily request. Expected: it contains a short query rather than the full memory, source audio, or screen/window body.
- [ ] P08-05 — Repeat research with already shown sources and inject invalid links in an isolated test. Expected: links are validated and previously shown materials are excluded; unusable sources are not attached as a valid result.
- [ ] P08-06 — Force Tavily failure, invalid sources, or an obsolete answer. Expected: no invalid result is attached, and existing goal data remains intact.
- [ ] P08-07 — Switch goals, revise a step, or revoke relevant permission during research. Expected: the final context recheck prevents a stale result from attaching to the wrong goal or plan.
- [ ] P08-08 — Close Buddy during a pending search and restart it. Expected: the unfinished search does not restart automatically without a new request.
- [ ] P08-09 — Mark a search as helpful and unhelpful on separate fixtures, then restart. Expected: feedback persists independently for the relevant goal.
- [ ] P08-10 — Run existing explicit research through ordinary chat and goal analysis. Expected: these flows still work under their applicable permissions.
- [ ] P08-11 — Spend time on a step, research it, Park it, and Resume it without confirming completion. Expected: the step stays open throughout.
- [ ] P08-12 — Provide a supported concrete result cue, such as a synthetic successful-send notification. Expected: Buddy may offer completion confirmation; the step remains open before acceptance.
- [ ] P08-13 — Accept and reject completion suggestions in separate runs. Expected: acceptance completes only the validated current step; rejection leaves it open.
- [ ] P08-14 — Change focus or the plan revision before accepting an old completion suggestion. Expected: the stale confirmation cannot complete another or changed step.
- [ ] P08-15 — Compare checkbox completion, explicit chat completion, accepted AI completion, and a legacy record. Expected: new manual and user-confirmed AI origins are distinct; unknown legacy origin is not invented. Confirmation is not presented as independent verification in an external business system.

## Phase 9 Continuity reports and personalization

- [ ] P09-01 — Ask what matters now with Today, explicit focus, priorities, and open goals configured. Expected: the response reflects stored priorities and available next actions without inventing a ranking or achievement.
- [ ] P09-02 — Save a checkpoint on day one; on day two ask where work stopped yesterday. Expected: the dated historical checkpoint is used; missing history is acknowledged without reconstruction from guesses.
- [ ] P09-03 — Ask what is waiting for a response. Expected: only recorded waiting dependencies are listed and they belong to the correct goals.
- [ ] P09-04 — Ask what remains for the hackathon. Expected: its unfinished steps and saved next action are used; completed steps and client work are not counted as remaining hackathon work.
- [ ] P09-05 — Complete steps on both goals through the supported confirmation paths and ask what was done today. Expected: the database-based report uses actual completion records; time, research, Park, and Resume do not become achievements or a productivity score.
- [ ] P09-06 — Restart and cross a local day boundary using an isolated test clock or dated fixtures. Expected: checkpoints, waiting records, open steps, and confirmed results remain available with correct day attribution.
- [ ] P09-07 — Complete new work after saving an older checkpoint. Expected: the checkpoint remains dated saved context, rather than being presented as proof of the latest completion state.
- [ ] P09-08 — Give one refusal, then at least three refusals on two distinct dates within the roughly 30-day feedback window. Expected: one refusal does not trigger a durable inference; repeated applicable feedback can increase help cooldowns.
- [ ] P09-09 — Supply positive feedback and an explicit applicable preference. Expected: positive signals can affect frequency in the opposite direction; the explicit preference outranks inferred patterns and permissions still take precedence.
- [ ] P09-10 — Seed older unsupported inferences and pinned records in an isolated profile. Expected: eligible stale unsupported conclusions may be archived; pinned records remain.
- [ ] P09-11 — Add exact eligible duplicates and superficially similar entries for different goals. Expected: only safe exact duplicates merge, without cross-goal mixing or artificial inflation of evidence counts.

## Phase 10 Diagnostics and end to end regression

- [ ] P10-01 — Expand Personal AI Engine in Settings → Integrations / AI. Expected: provider, configured model, active goal/step, work state, selected-memory count, last decision/action, request latency, Tavily status, and AgentRuntime status are visible where available.
- [ ] P10-02 — Inspect action categories and model labels. Expected: goals, steps, memory, work context, research, completion, and day review are represented; memory uses validated local APIs/review. Configured model is distinct from Provider-reported model when returned; neither is presented as independent proof of provider execution.
- [ ] P10-03 — With a connected key, manually run inference health check against the real account. Expected: one minimal synthetic Nebius request validates a structured response; Connected alone is not treated as proof of inference capability.
- [ ] P10-04 — Force a slow health-check response and attempt another check immediately. Expected: the request is bounded by ten seconds, has no automatic retry, and enforces at least 60 seconds between attempts.
- [ ] P10-05 — Exercise invalid credentials, insufficient balance, unavailable model, malformed output, or unsupported JSON Schema in a controlled environment. Expected: failures are accurately reported without claiming a successful health check or exposing secrets.
- [ ] P10-06 — Inspect the health-check payload and diagnostic panel. Expected: no real goals, memory, or window contents are included in the synthetic check; the panel exposes no API keys, full prompts, or raw Accessibility content. Counters are not presented as a complete request ledger or exact cost.
- [ ] P10-07 — Run one combined scenario: create two goals, issue a voice command, Park A, work on B, record waiting, Resume A, request research, confirm a result, ask for the day report, and restart. Expected: each result stays with the correct goal, all persistent records survive reopening, and the report matches actual completions.
- [ ] P10-08 — Recheck existing goals/steps, Today, chats, activity tracking, timers, and Progress. Expected: established flows and data remain usable after the new features and database reopening.

## Privacy and permission checks across all phases

- [ ] SEC-01 — Toggle tracking independently of AI assistance, goal-context sharing, web search, and Memory. Expected: each setting controls its own scope; enabling one does not grant the others.
- [ ] SEC-02 — Enable Memory without granting broader activity sharing. Expected: this does not authorize unrestricted screen content transmission.
- [ ] SEC-03 — Turn off web-search permission or remove Tavily configuration, then accept a research offer. Expected: the forbidden/unconfigured search does not run and the reason is visible.
- [ ] SEC-04 — Inspect synthetic SQLite fixtures and allowed tracking history. Expected: memory/checkpoints are local; ordinary history may contain allowed window/tab titles and browser metadata, but the new memory chain does not persist full Accessibility samples or window-body text. Do not claim the SQLite database is encrypted.
- [ ] SEC-05 — Inspect permitted Nebius requests for each scenario using synthetic data. Expected: only applicable permitted goal context, limited relevant memory, messages, and validated research excerpts are included; separately allowed activity/completion payloads remain within their own scope.
- [ ] SEC-06 — Use supported synthetic password/token-like strings in test inputs. Expected: known redaction protections apply and logs/UI contain no real credentials; passing these fixtures does not establish perfect secret detection for arbitrary text.
- [ ] SEC-07 — Cancel a request or revoke permission while it is in flight. Expected: stale output cannot change local data; the UI does not imply that already transmitted data was recalled from the provider.
- [ ] SEC-08 — Forget memory and inspect the remaining local records. Expected: corresponding memory entries disappear; the UI does not claim automatic deletion of chats, activity, backups, or external provider data.
- [ ] SEC-09 — Review the changed files and built frontend assets for provider credentials. Expected: keys remain in approved secure storage or runtime configuration, with no committed `.env`, frontend embedding, or credential logging.

## Installation update and release verification

- [ ] REL-01 — Verify the intended source tag, installed version, release metadata, and version files. Expected: `package.json`, `package-lock.json`, `Cargo.toml`, `Cargo.lock`, and `tauri.conf.json` agree for the released build; a delivered installer is not replaced with different code under the same version.
- [ ] REL-02 — Inspect assets and CI for the release being tested. Expected: one version has validated Windows x64 and Apple Silicon macOS builds; unsupported Intel/universal Mac assets are not described as supported deliverables.
- [ ] REL-03 — Perform a clean installation and launch on each supported platform. Expected: the intended version launches and can access its local database; required permission guidance works.
- [ ] REL-04 — Update a supported older installation through the app's Update flow and restart. Expected: the user can accept the update, the new version launches, and baseline goals, steps, chats, activity, progress, memory, checkpoints, and settings are preserved where present.
- [ ] REL-05 — Test an older Windows installation requiring compatibility bridges. Expected: supported transition updates lead to the target version using the existing trusted signature chain; no signature verification or trust-key replacement is bypassed.
- [ ] REL-06 — Verify downloaded artifact SHA-256 values and updater signatures against trusted release metadata. Expected: matching authentic artifacts are accepted; modified artifacts and invalid signatures are rejected in an isolated verification test.
- [ ] REL-07 — On a clean Mac, follow the first-launch path for the actual release's signing/notarization state. Expected: guidance matches macOS behavior. The source document describes a non-notarized release that may require Open Anyway; updater signing must not be presented as Apple notarization.
- [ ] REL-08 — Test an offline or failed update download. Expected: no success is reported for an incomplete install, and the previous working installation and its data remain usable.
- [ ] REL-09 — Check update behavior on an existing session. Expected: publication alone does not force installation; the available update follows the documented user acceptance flow.

## Automated evidence to attach to the run

These checks are intended for the source revision corresponding to the installed release, not automatically for the older local checkout. Use isolated tests for timing, invalid plans, provider failures, permission races, and database inspection that cannot be reliably observed by clicking through the production app.

- [ ] AUTO-01 — Run `npm test`. Expected: the frontend suite passes; record the current count and any skips rather than assuming the source document's historical count of 133.
- [ ] AUTO-02 — Run `npm run build`. Expected: version consistency, TypeScript, and production frontend compilation pass.
- [ ] AUTO-03 — Where Windows prerequisites are available, run `cargo test --locked --manifest-path src-tauri/Cargo.toml`. Expected: the Rust suite passes; record the actual count, failures, and reasons for ignored tests rather than assuming 392 tests and two skips.
- [ ] AUTO-04 — Run `npm run test:release` for the intended source revision. Expected: updater/signature and platform-manifest checks pass without weakened trust settings.
- [ ] AUTO-05 — Attach successful build evidence from both Windows and Apple Silicon macOS. Expected: both builds correspond to the same release version and source revision.
- [ ] AUTO-06 — Attach isolated regression evidence for atomic actions, memory boundaries, stale output, cross-goal context, feedback thresholds, local day boundaries, database reopening, and stable observations. Expected: tests exercise the stated failures and data invariants rather than merely rendering controls.

## Acceptance decision

The release is accepted only when applicable checks pass on both platforms and the evidence identifies the tested version. Record every failure and blocked platform requirement. If a permission, live provider account, signing requirement, or platform environment prevents verification, leave the affected check blocked and do not describe the Windows and macOS update as fully verified.

Run conclusion: ____________________

Outstanding failures or blockers: ____________________

Evidence location and issue references: ____________________
