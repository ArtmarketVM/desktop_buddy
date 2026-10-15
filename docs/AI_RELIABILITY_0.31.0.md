# AI reliability audit and fixes: 0.31.0

## Baseline evidence

The installed app was updated from 0.29.0 to the published 0.30.0 before the
audit. Real minimal Nebius inference succeeded in 661 ms. A background reasoning
request succeeded in 1393 ms and correctly chose `stay_silent`. Provider
connectivity therefore worked; it did not establish conversational quality.

A synthetic UI conversation about a presentation for an undefined project,
Mayak, reproduced unsupported assertions: a light installation, pilot tests,
revenue increases and payback. Correcting the project to an order-tracking app
and changing the budget still produced invented included services. This was a
factual grounding failure, despite successful HTTP and valid structured JSON.
The pre-existing mechanical action rubric did not detect this type of error.

## Implemented changes

1. `companion/mod.rs` resumes the current conversation when opening the mascot
   chat. Explicit New chat remains available.
2. `ai_chat.rs` no longer deletes messages beyond the newest 100. The existing
   retention setting, conversation deletion and clear-history flow remain
   authoritative. The UI still loads a bounded recent window.
3. `dialogue_context.rs` accepts up to 100 recent messages with a 48 KiB history
   budget and a 6000-character per-message limit, inside the existing shared
   request budget. Omission/clipping metadata and a history cursor are exposed
   to the model. Latest corrections take precedence over older draft assertions.
4. The read-only `inspect_conversation` skill retrieves only the originating
   request's conversation, even if the user switches chats during inference.
   It supports a Unicode case-insensitive literal query and pagination. A call
   scans at most 500 messages and returns at most eight excerpts within 24 KiB.
   Result schemas, input validation and existing stale-state/privacy checks
   remain backend-owned. The model cannot provide another conversation ID.
5. Planner, writer and independent response reviewer explicitly distinguish
   user facts, drafts and proposed assumptions. Unsupported pilot results,
   capabilities, prices, revenue and payback assertions must be repaired.
   Numbered draft edits do not authorize saved-step mutations.
6. Natural response generation uses plain text rather than an action-shaped
   JSON string; structured JSON remains mandatory for planning, authorization,
   tool results and review. Complete multiline output, length/source checks and
   content-free inference metrics are tested.
7. Qwen handles response review and independent mutation authorization as well
   as writing. Nemotron retains structured planning and background reasoning.
   Non-Nemotron sampling uses temperature 0.2; deliberate Nemotron parameters,
   configured model IDs and real HTTP integration are preserved.
8. An unambiguous destructive request must create a backend confirmation
   preview. A conversational are-you-sure question alone is insufficient;
   response review can send the request back to planning.

The implementation adds no phrase-based intent routing, new memory database,
fine-tuning, vector store or raw activity persistence.

## Reproducible validation

```sh
npm test
npm run build
npm run test:release
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
```

The signed application also exposes an explicit developer-only CLI check:

```sh
desktop-buddy --check-conversation-reliability
desktop-buddy --check-agent-actions
```

The conversation check creates disposable SQLite files with synthetic chats,
closes and reopens them before inference, and selects an unrelated second chat
to test isolation. It tests required facts and unchanged workspace state, then
uses a separate model request to review quality against known fixture facts.
Reports contain synthetic replies for human inspection. No production database,
screen text, provider key or hidden provider reasoning is included.

Local regression: 448 Rust tests passed, two existing opt-in tests ignored;
160 frontend tests passed; 15 release/signing tests passed; frontend production
build passed. Native platform and real-provider results are recorded below
after completion.

## Limits and interpretation

- Structured JSON, an HTTP success or nonempty text is insufficient evidence of
  a useful answer. Model review can also miss errors; saved replies need human
  inspection. These checks do not prove ChatGPT parity or universal reliability.
- Older messages already deleted by previous releases cannot be restored.
- Context and retrieval are bounded. At most three read rounds are allowed;
  very long or clipped material can still require a narrower question.
- The retrieval scan considers up to 20000 characters per stored message;
  returned excerpts contain at most 6000 characters and are marked when clipped.
- History and Personal Memory remain separate. Memory OFF prevents memory use
  and writes according to the existing controls; it does not erase the selected
  chat. New chats do not automatically inherit every fact from other chats.
- Explicit preference proposals still require review in Memory settings. This
  release does not introduce unrestricted automatic memory writes.
- Real voice accuracy, every private-app permission case, and a physical Windows
  user session are not established by transcript or mocked integration tests.
- Repeated macOS Keychain prompts for different test binaries remain a separate
  unresolved issue. Internal app signing is not Apple Developer ID signing or
  notarization; no credential or signing protection is weakened here.

## Schema and signing

No migrations. Existing tables, retention settings and stored data are reused.
Updater trusted keys, Windows signing channel and reviewed macOS code-signing
identity are unchanged. macOS installers target Apple Silicon only.
