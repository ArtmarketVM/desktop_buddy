# Phase 4: Park, Remember, Resume

> Historical milestone / design record. This file describes its recorded source and may contain superseded UI, models, permissions or commands. For current behavior and diagrams, use the [documentation index](README.md) and [architecture](AI_ARCHITECTURE.md). Historical test results are not current live verification.


This phase extends the existing Tauri/Rust skill executor, SQLite personal memory, deterministic retriever and shared React goal rows. It does not introduce an agent runtime, another database, a new Tavily flow, or model training.

## Behavior

- **Park** resolves an actual goal and its currently selected unfinished step. Rust assembles the goal plan, five recent meaningful step events, goal-specific activity aggregates, the current permitted app name, a window-available flag and bounded relevant memory. Nemotron drafts a short summary, one next action and an optional supported dependency. Rust validates the draft and saves the checkpoint atomically with deferring the goal and stopping only that goal's manual timer.
- **Resume** loads the checkpoint by exact goal ID, reopens its parked lane, restores a still-valid unfinished step, optionally focuses the goal and adds it to the current Today plan. It preserves a waiting dependency and records resumption. It does not start a timer or mark work complete.
- **Inspect** answers where work stopped without changing focus or marking the goal resumed. Missing checkpoints are reported honestly.
- Each goal owns an independent checkpoint. Dates and process restarts do not change checkpoint identity. There is no limit of six lanes in storage; six concurrent lanes are covered by tests.
- Shared goal rows in Today and Goals expose Park/Resume, a Parked badge and expandable summary, last confirmed completion, next action and waiting state. Completed goals expose saved context without workflow mutation buttons.

## Chat and skill pipeline

The existing planner receives real goal/step IDs, the actual focus ID, an explicit UI-selected ID when present, and conversation references. It selects `park_context`, `resume_context` or `inspect_work_context`. Named goals use real IDs; ambiguous references require clarification. New `active_goal` and `only_parked` references are restricted to workflow skills; `only_parked` requires exactly one matching lane.

For Park, planner-supplied checkpoint content is replaced by a separate context-grounded generation request. The backend remains the sole state writer. JSON schemas, input/result validation, privacy revisions, SQLite state versions and atomic batches remain in force. A Park batch cannot also mutate the same goal, preventing a checkpoint from describing a different version of the work.

Supported intent examples include:

- `Park this`
- `Сохрани, где я остановился`
- `Запомни это, мне надо переключиться`
- `Верни меня к хакатону`
- `Продолжим Deloitte`
- `Где я остановился?`
- `Что я делал здесь последний раз?`

The main-window-only `run_work_context_action` Tauri command uses the same skills for UI operations. Its inputs are `goalId` and `operation` (`park`, `resume`, `inspect`); UI Resume focuses the selected goal. Chat Resume can choose `set_focus=false`. Chat and UI replies use authoritative structured results; scoped memory is included for resumption/inspection. Failed response wording falls back to a deterministic receipt, preserving an already committed checkpoint.

## Persistence and privacy

Migration `003_park_resume.sql` adds nullable `last_result`, `parked_at` and `resumed_at` fields to existing `work_contexts`. Existing paused/waiting contexts retain their content and receive a parked timestamp. In-place migration from Phase 3 and repeated initialization are tested. SQLite revision triggers also invalidate pending plans when memory controls, checkpoints or substantive memory content change. Retrieval-only `last_used_at` changes do not invalidate them.

No raw Accessibility text or window title enters the Park source or newly saved checkpoint. Only the permitted app name and availability of a window are used. Existing credential-like content guards, bounded checkpoint fields and unknown-field rejection apply. Confirmed completion events supply `last_result`; foreground time never proves completion. Memory and Remember work context must be enabled. Production Park also requires AI assistance, goal-context sharing and the configured Nebius provider. Privacy changes while generation is in progress prevent execution.

The existing Memory controls continue to edit, pin and forget checkpoints. An explicit memory deletion can remove the saved lane context. A completed/deleted checkpoint step is not silently reopened when its goal resumes.

## Changed files

| Files | Responsibility |
| --- | --- |
| `src-tauri/src/work_context.rs` | Checkpoint generation, atomic workflow, UI IPC, safe result/receipt schemas |
| `src-tauri/src/work_context/tests.rs` | Workflow, persistence, migration, privacy, exact references and skill validation |
| `src-tauri/src/skills.rs` | Three skills, schemas, workflow references, exact execution and batch guards |
| `src-tauri/src/ai_chat.rs`, `ai_chat_tests.rs` | Intent planning, backend checkpoint enrichment, scoped replies and HTTP orchestration regressions |
| `src-tauri/src/memory/{mod.rs,controls.rs,retriever.rs,migrations/003_park_resume.sql}` | Persistent metadata, state invalidation and bounded retrieval |
| `src-tauri/src/memory/{tests.rs,retrieval_tests.rs}` | Updated migration-version assertions |
| `src-tauri/src/core.rs`, `lib.rs`, `threading_tests.rs` | Local goal snapshots, command registration and worker-dispatch guard |
| `src/core/{GoalWorkContext.tsx,GoalWorkContext.test.tsx,Goals.tsx,types.ts,core.css}`, `src/api/memory.ts` | Shared UI actions, checkpoint rendering and typed memory fields |

## Verification

- `npm test`: **115 passed** across 20 files, including seven new workflow UI tests.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml`: **294 passed, 2 ignored**. Sixteen new workflow tests cover active/no-step Park, Resume, reopen/day boundaries, six lanes, exact/ambiguous references, stale context/privacy controls, input rejection, safe source data, confirmed results, waiting dependencies, missing/completed goals, atomic batches, Phase 3 migration and actual step restoration.
- Three new HTTP orchestration tests exercise all seven English/Russian intent examples, scoped replies, malformed generation and privacy changes during generation. Fixtures use actual local HTTP requests with production parsing/validation; they do not test live Nemotron intent accuracy.
- `npm run build`, locked `cargo check` and native macOS locked `cargo build`: successful.
- Release/update signature regression suite: **13 passed**. Contact suite: **8 passed**.

## Manual end-to-end result

An isolated native macOS debug app used `/private/tmp/buddy-phase4/manual/buddy-demo.db`, with `DEMO_MODE=true` and `AI_MOCK=true`; no production goals or provider keys were changed.

1. Created Goal A Hackathon and steps Confirm requirements / Write prototype.
2. Confirmed the first step, then clicked Park. The UI displayed Parked, last confirmed result Confirm requirements and next action Write prototype.
3. Created Goal B Deloitte, added Review Deloitte brief and completed that work. The existing goal logic completed B when its only step finished.
4. Clicked Resume on A. The UI displayed the saved A checkpoint and its next action; A became focused, its completed step remained done and Write prototype remained unfinished. B's work remained independent.
5. Parked A again, terminated and relaunched the native app using the same isolated database. Parked status, confirmed result and next action remained visible. Resume succeeded after restart.
6. SQLite inspection confirmed A was active, its checkpoint metadata persisted and the manual timer remained null.

The manual flow tests native UI → Tauri IPC → Rust → SQLite. Checkpoint wording in this flow is explicitly mock data. Live provider calls were not made.

## Known limitations

- Native Windows build/runtime validation is unavailable on this Mac. The implementation is shared Rust/React and adds no platform-specific adapter, but a Windows build still needs its native runner before a joint installer release.
- Two pre-existing integration tests remain ignored: the live-provider smoke test and a Keychain write test. Real Nebius model intent quality and network availability are not established by fixture tests.
- Park requires configured AI sharing in production. If generation fails, it does not silently create a fabricated checkpoint.
- Window titles and screen text are intentionally excluded; checkpoints depend on explicit goal/step state, meaningful events and existing memory. Summaries are model-generated and can require user correction through Settings → Memory.
- No installer or GitHub release is produced in this phase. Version 0.26.1 is unchanged; the next delivered installer must receive a new synchronized release version.
