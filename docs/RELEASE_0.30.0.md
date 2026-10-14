# Desktop Buddy 0.30.0

## A contextual agent, with verified actions

Chat and local voice transcripts now use the same contextual dialogue pipeline.
The agent receives the actual conversation, saved goal/step identifiers, relevant
memory and the ordered Today queue. It distinguishes the goal being discussed
from the goal currently in focus. Production intent understanding no longer
uses the historical phrase-based chat adapter.

- Requests are planned through mutually exclusive structured decisions: answer,
  read, change, clarification or preference.
- Rust owns validation and execution. IDs, step ownership, permissions, state
  versions, confirmations and undo remain authoritative.
- A separate semantic authorization check runs before natural-language mutations.
  Identically named goals require an original stable reference or explicit chat
  goal selection; the backend blocks guessed targets independently of the model.
- Responses use verified execution results. A reviewer can request correction or
  replan a missed explicit action. Provider errors never prove that work happened.
- In focus, Later today and Up next are represented explicitly. Reading the queue
  does not silently change focus. Missing goal details are marked as unavailable,
  rather than represented as empty steps.
- Context is bounded, permission-filtered and selective. Tool output, attachments
  and saved activity remain data, not instructions.

## Model roles

Nebius Token Factory hosts both default model roles:

- NVIDIA Nemotron 3 Super (`nvidia/nemotron-3-super-120b-a12b`): action planning,
  mutation authorization and existing background goal/completion analysis.
- Qwen3.5-397B-A17B: natural responses and response review, research synthesis,
  checkpoints and duplicate-target clarification.

An explicit primary model environment override keeps the single-model behavior
unless a response model override is also supplied. Developer diagnostics and
sidebar details show configured models separately from provider-reported runtime
metadata. Neither model runs on the user's computer.

Tavily goal research still requires consent and validated source URLs. Local
speech recognition still sends a transcript, not raw audio, to the agent.
Existing memory, privacy, DND and updater trust controls are preserved.

## Validation and limits

See [Contextual agent dialogue](CONTEXTUAL_AGENT_DIALOGUE.md) for architecture,
validation evidence and limitations. Real-provider checks use synthetic in-memory
workspaces, separate from the user's goals and chat database. Finite multilingual
fixtures do not establish GPT parity or understanding of every language.

No database migration, updater trust key change or macOS signing identity change.
The shared release targets Windows x64 and Apple Silicon macOS 14.5+ only.
The preserved internal macOS certificate is not Apple Developer ID signing or
notarization. Keychain permission prompts for changing test builds remain an
observed issue and are not claimed to be fixed by this release.
