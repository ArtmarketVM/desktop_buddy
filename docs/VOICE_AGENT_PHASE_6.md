# Voice as the agent interface (Phase 6)

> Historical milestone / design record. This file describes its recorded source and may contain superseded UI, models, permissions or commands. For current behavior and diagrams, use the [documentation index](README.md) and [architecture](AI_ARCHITECTURE.md). Historical test results are not current live verification.


Built on `524079f feat(agent): add event driven personal AI runtime`. The existing
microphone recorder, WAV validation, local speech recognizers, shared chat
planner, skill registry, confirmations and SQLite state are reused.

## One pipeline after STT

```text
Microphone -> recordVoice -> transcribe_core_voice (local STT) -> transcript
                                                                    |
Typed text ---------------------------------------------------------+
                                                                    v
aiApi.send -> send_buddy_message -> send_message
  -> AgentRuntime.begin_explicit (user_message or voice_message)
  -> AgentRuntime.handle_explicit_actions
  -> existing structured chat planner (unified reasoning JSON Schema)
  -> skills.execute_for_event -> same backend validation/transaction
  -> authoritative result -> normal Buddy response
```

`AgentRuntime.handle_explicit_actions` is in `src-tauri/src/agent_runtime.rs`.
It delegates to the existing chat orchestration, rather than introducing another
model, provider or voice-specific action planner. Ordinary conversation/research
keeps the existing chat/Tavily policy. The source enum affects deletion
confirmation, not ID resolution, permissions or validation.

Both platforms now use `recordVoice` and `coreApi.transcribe` in ordinary chat as
well as the compact Buddy interface. The old ordinary-chat Windows+H/system
voice-typing branch has been removed. Windows uses the existing local
`System.Speech.Recognition.SpeechRecognitionEngine` through
`scripts/local-transcribe.ps1`. macOS uses the existing Speech framework bridge
and requires `supportsOnDeviceRecognition` / `requiresOnDeviceRecognition=YES`.
There is no cloud STT fallback.

WAV bytes are passed only to `transcribe_core_voice`. The existing backend accepts
bounded mono PCM WAV at 16 kHz, up to 60 seconds, from the main/Buddy windows.
Windows temporary audio is removed after local recognition; macOS processes it
locally. Agent/chat/provider requests receive the transcript, never raw audio or
an audio attachment. The shared source flag persists through queued chat sends.

## Supported actions

The existing shared skills support spoken create/rename goal, create/complete
step, add to Today, set focus, Park, Resume and inspect work context ("Where did I
stop?"). No fuzzy ID matching or voice-specific mutation path was added.
Ambiguous references require the same clarification as typed input.

A new read-only `inspect_today` skill answers "What did I do today?" / "Что я
сегодня сделал?" using the existing local-day summary. It returns confirmed daily
results/completed goals and separate manual timer, observed and relevant time.
It does not equate time with completion or restrict the daily answer to a single
selected goal. It works through both text and voice and requires existing goal
context sharing. Yesterday's results are excluded. The registry now has 20
skills; the reasoning schema derives action alternatives from that registry.

## Transcript review and destructive actions

Ordinary chat shows a local transcript in the composer for review before Send.
Compact voice retains its existing auto-send behavior after stopping speech; the
recognized command is entered into the common chat. Both voice entry modes use
the same backend safeguards.

- Spoken `delete_goal` now requires a separate confirmation, retaining the
  existing 30-day undo backup after execution.
- `delete_step` retains its existing exact-batch confirmation for text and voice.
- A destructive batch is previewed transactionally and rolled back. No action in
  the batch commits before confirmation.
- The backend returns the recognized transcript, exact affected goal/step and
  Confirm/Cancel instructions. This receipt is deterministic; a model cannot
  rewrite the preview into a false success claim.
- Confirm or Cancel can be typed or spoken through the same pipeline. Pending
  state stays bound to its chat, snapshot, privacy revision and five-minute expiry.
  Changed state/consent, expired or replayed confirmations cannot execute.
- Text goal deletion retains its existing undo behavior; speech adds confirmation
  because recognition may have misheard a destructive command.

## Failure handling

Local speech-language discovery happens before opening the microphone. No local
recognizer means actionable guidance to install an on-device language or type;
no remote recognizer is used.

Microphone permission denial is explained with system-settings guidance. Empty
or whitespace-only recognition, native STT failures and oversized transcripts
produce an error and do not send an AI request. Existing typed drafts remain
intact. Oversized speech is rejected rather than truncated into a different
command. Closing/changing the voice interface invalidates an in-flight transcript
so late STT completion cannot send or execute it. This discards the result; it
does not forcibly terminate a native recognizer already running.

## Changed files

- `src-tauri/src/agent_runtime.rs`: one post-transcript action entry and explicit
  event classification for both input sources.
- `src-tauri/src/ai_chat.rs`: route through that entry, use the actual event kind,
  deterministic confirmation receipts and Today skill guidance.
- `src-tauri/src/skills.rs`: shared source-aware executor, voice goal-deletion
  confirmation and validated read-only daily result.
- `src-tauri/src/core_import.rs`: correct unsupported-platform guidance; existing
  Windows/macOS adapters and audio validation are preserved.
- `src-tauri/src/ai_chat_tests.rs`: mocked recognizer output through real local
  HTTP structured planning, validation and SQLite execution.
- `src/companion/Conversation.tsx`: shared local STT on Windows/macOS, language
  preflight, failure handling and cancellation of late transcripts.
- `Conversation.runtime.test.tsx`, `Conversation.windows-voice.test.tsx`,
  `Companion.test.tsx`: source/queue, privacy/error and platform UI regressions.

No migration, dependency, provider-key storage or signing-trust change is needed.

## Verification

- `npm test`: **126 passed** in 22 files (nine additional frontend tests).
- Locked full Rust suite: **321 passed, 2 pre-existing ignored** (nine additional
  backend tests).
- `npm run build`: successful version check, TypeScript check and Vite build.
- Locked `cargo check` and native macOS locked `cargo build`: successful.
- `git diff --check` and Rust formatting check: successful.
- Release/update signature regressions: **13 passed**; contact regressions:
  **8 passed**.

New backend integration coverage:

1. Mocked recognizer candidates -> create goal for voice and equivalent text.
2. Create/complete step, rename goal, Today and focus through spoken commands.
3. Spoken Park, inspect checkpoint and Resume, preserving the saved next action.
4. Ambiguous spoken references request clarification without mutation.
5. Spoken goal deletion displays the transcript, previews only, then executes
   after a separate spoken Confirm; preview skips model response generation.
6. Voice and text reject the same invalid step ID.
7. Spoken daily question receives confirmed results with zero completion inferred
   from elapsed time.
8. Spoken step deletion is safe under Cancel and changed privacy before Confirm.
9. Today read excludes yesterday, respects sharing OFF and does not mutate goals.

New frontend coverage includes empty/whitespace speech, STT failure with draft
preservation, microphone permission failure with typed fallback, missing local
recognizers, WAV-to-local-STT-only routing, late-result cancellation, oversized
speech rejection and a Windows platform fixture. Existing WAV/resampling,
recognizer-candidate selection, macOS on-device language discovery, queue/source,
chat/goal/memory/runtime and confirmation tests all remain in the full suite.

## Known limitations

- Native Windows build/runtime and real Windows microphone/recognizer behavior
  cannot be validated on this Mac. The Windows UI fixture tests routing, not a
  native Windows installation. A joint installer release still needs its runner.
- Real microphone quality, accents/noise and live Nemotron intent accuracy are
  not proven by mocked STT/HTTP integration tests. Native macOS language discovery
  is tested without requesting microphone capture or exposing user audio.
- Local recognition languages depend on the OS-installed on-device recognizers.
- Two existing optional Rust tests remain ignored: live-provider smoke and
  credential-vault write. No production goals/provider keys are used by tests.
- No installer or GitHub release is produced. Version 0.26.1 remains unchanged;
  the next delivered installer update requires a synchronized version bump.
- Phase 7 is not started.
