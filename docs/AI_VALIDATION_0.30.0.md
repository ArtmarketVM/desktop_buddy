# AI validation for Desktop Buddy 0.30.0

> Historical milestone / design record. This file describes its recorded source and may contain superseded UI, models, permissions or commands. For current behavior and diagrams, use the [documentation index](README.md) and [architecture](AI_ARCHITECTURE.md). Historical test results are not current live verification.


## What changed

The existing agent now understands a request using the real recent conversation,
relevant saved goals/steps, selective memory and Today order. Native user and
assistant roles replace the previous dialogue-shaped JSON blob. The production
phrase-based routing adapter is retired; it remains in historical tests only.

The model chooses an exclusive answer/read/change/clarification/preference
variant. Rust validates and executes registered skills with real IDs, ownership,
privacy, state versions, atomic batches, confirmations and undo. Natural replies
are checked against verified execution receipts. Independent authorization runs
before mutations. Duplicate names cannot be resolved by guessing an ID: the
backend requires an original stable reference or explicit chat goal selection.

Nemotron 3 Super plans and validates actions and responses and retains existing
background goal/completion analysis. Qwen3.5-397B-A17B writes natural replies,
research syntheses and checkpoints through the same Nebius account. Explicit
model environment overrides remain supported. This is contextual orchestration
and personalization through existing memory, not training model weights.

## Real-provider evidence

Code tested: `bde32cc879b6feaad80bf8f0e33914e7cf25d5c9`.
All fixtures use isolated in-memory databases and synthetic goals. No personal
goals, messages or activity are part of the report. The installed application
was not replaced during evaluation.

| Final frozen candidate | State / target correctness | Language script match |
| --- | ---: | ---: |
| Russian | 20/20 | 20/20 |
| English | 20/20 | 20/20 |
| Hebrew | 20/20 | 18/20 |
| Total, unique scenarios | 60/60 | 58/60 |

The 20 scenario types cover queue references, remaining steps, conversational
references, concrete help, focus, completion, step creation, renaming, goal
creation, advice without execution, past reports, negation, quoted instructions,
ambiguous names/pronouns, multi-action creation, drafting, reading before focus
and intent repair. Hebrew fixtures enter the shared voice-transcript event path;
this is not a physical microphone or STT accuracy test.

The three language subsets ran concurrently. The Hebrew substring filter also
selected two extra help cases in other languages; those duplicates are excluded
from the 60 unique scenarios above. Median turn latency was 11.19 seconds and the
maximum was 33.39 seconds. Concurrent latency is not a controlled speed comparison
with the earlier sequential model experiment.

A separate sequential nine-action run passed all checks: create goal, create
four steps, propose deleting the second step, confirm that exact deletion,
complete the first remaining step, rename, Park, Resume, and answer remaining
steps without changing state. Deletion checks compare actual step IDs/order and
require a persisted confirmation proposal. The harness preserves prior user and
assistant messages, as the real chat does. Total chain time was 142 seconds.

Mechanical correctness does not grade factual quality or completeness of prose.
Language script matching does not establish fluent translation. Manual review of
saved synthetic help/draft/advice replies found usable task content, but occasional
mixed terminology, awkward formatting and unnecessary offers remain possible.

## Model comparison and rejected candidates

On the same earlier pipeline, with one configured model for all roles:

| Model | Mechanical checks | Language checks | Median turn time |
| --- | ---: | ---: | ---: |
| Nemotron 3 Super | 60/60 | 57/60 | 7.99 s |
| Qwen3.5-397B-A17B | 59/60 | 59/60 | 11.38 s |
| Nemotron 3 Ultra | 46/60 | 40/60 | 8.13 s |

Qwen's ambiguous-target mutation motivated the independent Rust duplicate-name
check. The larger Ultra model did not improve reliability on these fixtures.
A subsequent Qwen self-review hybrid was stopped after review timeouts and
unhelpful draft rejection. It was not released. The final role split keeps
response review independent in Nemotron and uses Qwen for presentation.

These finite results do not establish the best model in general or GPT parity.

## Automated and platform evidence

- Local Rust: 437 passed, zero failures, two existing opt-in tests ignored.
- Frontend: 160 tests passed; TypeScript and Vite production build passed.
- Release/signing/manifest verification: 15 tests passed.
- Acceptance runner: eight tests passed.
- Rust formatting, changed frontend formatting and Git whitespace checks passed.
- Native Mac source validation: [Apple Silicon CI](https://github.com/ArtmarketVM/desktop_buddy/actions/runs/38677083189).
- Native Windows source validation: [Windows x64 CI](https://github.com/ArtmarketVM/desktop_buddy/actions/runs/38677083244).
- Signed release publication additionally requires both platform jobs and the
  combined cryptographic updater-manifest verification to succeed.

The ignored tests are the separate opt-in Nebius/Tavily account smoke test and an
isolated macOS Keychain write test. The real-provider tests above cover dialogue
and skills; they do not establish a new real Tavily search or physical Windows
microphone test. Existing mocked research, privacy, memory, collector and voice
regressions remain in the full suite.

## Limits that must stay explicit

- Hebrew help case `05-help-he` returned an English safe fallback after response
  review; `15-ambiguous_goal-he` asked a valid clarification in English. Neither
  changed app state. Russian/English had no measured script mismatch in this run.
- Confirmation/failure receipts can remain English. Arbitrary languages and
  unseen phrasing are not guaranteed.
- Duplicate-name disambiguation can require the chat goal selector; arbitrary
  descriptive resolution is not guaranteed.
- Probabilistic reviewers can miss errors. Rust validation prevents unsupported
  state operations but cannot mathematically prove every sentence in a draft.
- Multiple model calls add latency and cost. A timeout following execution can
  require checking actual state before retrying.
- Real background activity, every OS permission, physical voice recognition,
  macOS 14.5 hardware and Windows GUI use were not all exercised in this audit.
- The existing internal macOS signing identity is preserved. It is not Apple
  Developer ID signing/notarization. Repeated Keychain prompts for changing test
  binaries remain observed and are not claimed to be fixed.

No database migration, new memory system, new Tavily flow, signing-key rotation
or Intel/universal Mac build is part of this update.
