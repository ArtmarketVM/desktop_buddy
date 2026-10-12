# Contextual research with Tavily (Phase 8)

Base: Phase 7 commit `534bf65`. This phase extends the existing Rust Skill Registry,
AgentRuntime, companion prompts, Nebius JSON Schema client, Tavily adapter,
deterministic memory retrieval and SQLite WorkContext. It does not introduce a
second agent or voice pipeline.

## Workflow and consent

1. The existing stuck heuristic produces `possible_stuck`. AgentRuntime retrieves
   scoped memory and reasons with Nemotron under its existing debounce, cooldown,
   quiet-hours and privacy gates. A useful help offer becomes a research prompt.
   `stay_silent` still produces no prompt.
2. The prompt asks whether information is missing and offers **Search the web**
   and **Not now**, identifying the backend goal and unfinished step. No research
   request or Tavily call is created by merely showing a prompt.
3. Acceptance validates prompt identity, expiration, privacy revision, goal
   creation identity, focus, plan revision and current step. Refusal records a
   research-rejected feedback episode when feedback memory is enabled.
4. A confirmed request creates a single-use SQLite research job. Consent expires
   after five minutes if unused. It is also bound to goal identity, plan revision,
   focus, chat, checkpoint version and AI/memory permissions before the worker
   starts. App startup marks unfinished jobs failed rather than replaying them.
5. Nemotron receives the actual goal/step and selectively retrieved memory. It
   creates a single public query of at most 240 characters. Rust validates the
   response and applies the existing conservative secret/password-like filter.
6. Tavily receives only that query and the existing advanced-search options:
   `search_depth`, `topic`, `max_results`, `include_raw_content=false`. It never
   receives the memory envelope, checkpoint, screen text or raw audio.
7. Existing Tavily URL validation and recommendation identity/deduplication run
   before synthesis. Seen recommendation/suggestion URLs, viewed resources and
   this goal's previously attached research are excluded.
8. Nemotron synthesizes a concise summary and next action for the exact step,
   citing zero-based indices into actual retrieved sources. Rust rejects invalid
   indices, duplicated citations, invented response URLs, malformed JSON and
   secret-like persisted text. Provider validation retains its existing bounded
   retry policy.
9. The verified receipt, checkpoint attachment, updated next action, dedup history
   and conversation reference commit atomically. Failure attaches nothing.
   Waiting/Parked state and dependencies remain intact. Research never completes
   a goal or step, starts a timer or confirms productive time.
10. The answer appears in chat with verified source links. The user can say that
    the research helped or did not help. The exact research receipt remains in
    conversational references; uncertain references must be clarified.

The former periodic proactive recommendation dispatcher now presents the same
consent prompt instead of running its legacy network worker. Existing cadence,
notification budget and suppression settings still apply. Existing explicit
chat/selection/goal-analysis research policies outside this contextual tool are
unchanged; a background stuck observation never authorizes those flows.

## Skills

All three have registry descriptions, exact input/result schemas, validators,
safety classifications and Rust executors. Goal and step targets use the existing
ID/reference resolvers and ownership validation.

| Skill | Safety | Behavior |
| --- | --- | --- |
| `search_web` | Confirmation | Stages one consent-bound research job; only the confirmed async driver performs HTTP |
| `attach_research_to_context` | Reversible | Attaches an existing ready receipt to its original goal checkpoint, idempotently; accepts no model-created research content |
| `record_research_feedback` | Reversible | Rates a ready receipt belonging to the exact goal; records a verified accepted/rejected episode |

Chat and locally transcribed voice use the existing shared action pipeline.
A chat/voice search gets an authoritative confirmation preview naming the goal
and step. Confirm/Cancel uses the existing stale-state/privacy/expiry checks.
Search is confirmed separately from other mutations. The companion button is an
alternative explicit authorization for the same queue/worker, not an AI-granted
permission. Results and provider credentials are never executable instructions.

## Storage and memory

`src-tauri/src/research/schema.sql` adds `contextual_research` and a goal index.
The table holds goal/step IDs, consent identity, bounded information-gap text,
job status, optional validated result, feedback, expiry and creation timestamp.
It references goals and optional WorkContext with cascading deletion.

The additive schema is created in the existing memory migration transaction,
including direct upgrades from older memory databases. Existing migration
versions and existing goal/chat/activity/checkpoint data remain intact.
Normal startup separately invalidates unfinished network jobs.

WorkContext exposes up to three recent attached results. Persisted sources retain
only title and destination; source excerpts remain transient. `last_result` is
explicitly labeled `Research:` and `next_action` contains the suggested action.
The existing memory budget includes attachments; older attachments are dropped
from the outgoing context before the underlying checkpoint when space is tight.

Research requires AI enabled, goal context sharing, web research, Memory ON and
Remember work context. No research runs in `AI_MOCK`. `DEMO_MODE` remains independent.
Memory ON and Learn from feedback gate feedback episodes. Repeating the same
rating is idempotent; changing a rating creates the corresponding distinct event.
No rating is inferred from time, reading a source or merely accepting a search.

Clear personal memory and Forget memories about this goal remove research too,
including unattached jobs. Forgetting the WorkContext cascades its attachments.
Goals remain intact. History and personal memory retain their separate semantics.
No raw Accessibility/window text or audio enters the new request or storage.
The query privacy filter is conservative, not a general-purpose PII detector;
semantic minimization also relies on the model instructions and explicit consent.

## Cancellation and failure

Before every provider stage, every 200 ms while awaiting HTTP, and before commit,
the worker checks privacy, chat, focus, goal creation identity, plan revision,
checkpoint version and the running job. A changed or forgotten context cancels
further processing. A network request already transmitted cannot be recalled;
its late result cannot be attached. There is no automatic retry/replay of a
failed research job. The user can explicitly authorize a new search.

Provider HTTP errors use the existing sanitized error handling; no API keys or
provider response bodies are logged or shown. Missing credentials, unavailable
providers, duplicate-only/unsafe sources and invalid synthesis produce an honest
failure with no new attachment. An accepted research job is not a successful
research result.

## Changed files

- `research.rs`, `research/schema.sql`: backend job lifecycle, consent, scoped
  preparation, intent/search/synthesis, source validation, atomic attachment,
  feedback and companion result delivery.
- `research/tests.rs`: isolated SQLite and actual local HTTP mock integration tests.
- `agent_runtime.rs`, `agent_runtime/reasoning.rs`: stuck research offers and
  consent-based replacement of the periodic background network dispatcher.
- `skills.rs`: three skills, schemas, authoritative search confirmation and
  reusable backend conversational-reference persistence.
- `ai_chat.rs`, `ai_chat_tests.rs`: confirmed search driver in shared chat actions;
  registry regression fixture updated from 20 to 23 skills.
- `companion/engine.rs`, `companion/mod.rs`: research prompt kind, validated
  acceptance/refusal and asynchronous result presentation.
- `memory/mod.rs`, `memory/controls.rs`, `memory/retriever.rs`, `work_context.rs`:
  additive migration, attached research, erasure, public checkpoint and budget.
- `storage.rs`, `lib.rs`, `tavily.rs`: module/startup wiring and reuse of the existing
  advanced-search HTTP adapter.
- `src/api/memory.ts`, `src/companion/types.ts`, `InterventionCard.tsx`,
  `Companion.test.tsx`: shared types, explicit consent/refusal UI and UI regressions.

## Verification

The integration suite covers: no search without consent; explicit consent;
correct goal/step; unrelated memory exclusion; source validation; unavailable
Tavily/Nemotron; attached persistent results; feedback; duplicate resources;
malformed intent/synthesis; cancellation; stale pre-start consent; replay/expiry;
Memory controls/erasure; migration/reopen; context budget; Waiting preservation;
shared skill validation and conversation receipt references.

Mocked end-to-end example:

```text
Goal: Rust workspace / Investigate async lifetime
possible stuck -> Search the web -> explicit acceptance
Nemotron intent -> Tavily search -> Nemotron synthesis
-> one verified source attached to WorkContext
-> concrete next action -> explicit helpful feedback episode
Nemotron requests: 2; Tavily requests: 1; step completed: false
```

Native Windows build and live provider behavior must be checked on their actual
environments before a joint installer release. This phase is a source commit:
no installer/release is published and source version stays 0.26.1. Both platforms
use the same Rust HTTP/storage and React consent implementation.

Live smoke testing is skipped when `NEBIUS_API_KEY` and `TAVILY_API_KEY` are absent
from the environment. This is reported without reading the user's Keychain or
printing secrets. Native UI installation and real provider semantic accuracy are
not established by mocked HTTP tests.

Final verification results:

| Check | Result |
| --- | --- |
| `npm test` | 128 passed across 22 files (2 new consent UI tests) |
| `npm run build` | Passed: synchronized version check, TypeScript and Vite |
| `cargo test --locked --manifest-path src-tauri/Cargo.toml` | 358 passed, 2 existing ignored tests; 21 new research integration tests |
| `cargo check --locked --manifest-path src-tauri/Cargo.toml` | Passed on macOS Apple Silicon |
| `cargo build --locked --manifest-path src-tauri/Cargo.toml` | Native macOS development build passed |
| Mocked end-to-end scenario, exact test with output | Passed: 2 Nebius HTTP requests, 1 Tavily request, 1 attached source, persisted helpful feedback, no completion mutation |
| `npm run test:release` | 13 passed, including update signatures |
| `npm run test:contact` | 8 passed |
| Rust format and Git whitespace checks | Passed |
| Live smoke test | Skipped: neither provider API key is available in environment |
| Native Windows build / installed-app end-to-end | Not performed in this macOS environment |

Two pre-existing ignored Rust tests exercise live provider and credential-vault
writes. Native builds retain compiler warnings, including unused legacy
recommendation helpers now that background research requires consent. No
signature, release key or provider credential was changed.
