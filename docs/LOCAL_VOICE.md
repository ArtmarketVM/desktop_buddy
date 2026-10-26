# Local voice recognition

Voice input uses `whisper-rs` 0.16.0 and its pinned whisper.cpp dependency on both platforms: Metal on Apple Silicon, CPU on Windows. It no longer compares macOS/Windows dictation guesses. Audio is transcribed in its original language, with automatic language detection, no chat-history prompt and no translation. Recordings remain in memory, never go to a speech service, and produce an editable draft. Only Send submits its text to the chat/action path. The optional text-correction setting, described below, can send recognized text to Nebius before it reaches the editor; audio stays local.

Each recording receives a bounded local vocabulary: app terms such as “sumi” and “current goal”, followed by the current goal title and recent open goal titles. Up to 12 titles are read, each capped at 120 characters; the hint is capped at 900 characters and 180 decoder tokens. Control characters are removed. Completed/deferred goals, chat history, screen text, descriptions and credentials are not used. This context stays on the device and helps the decoder recognize names; it does not rewrite the transcript or execute a command. A new lookup and fresh decoder are used for each recording.

The first microphone action prepares a one-time download before opening the microphone. The UI shows download progress and then Listening. Closing voice mode cancels the pending microphone start. The model download may finish in the background so it can be reused. No recording begins until the person enters voice mode again.

## Model integrity and storage

- Model: `ggml-large-v3-turbo-q5_0.bin`, multilingual Whisper large-v3-turbo, 574,041,195 bytes (about 548 MiB).
- Source: [ggerganov/whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp), revision `5359861c739e955e79d9a303bcbc70fb988958b1`.
- SHA-256: `394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2`.
- Cache: `<app_data_dir>/speech/ggml-large-v3-turbo-q5_0.bin`. Only public model weights persist. Deleting activity/chat history does not remove this non-personal model cache.
- Downloads are GET-only, streamed into a temporary file, size bounded, verified, and renamed only after completion. Interrupted, oversized or corrupt downloads are never loaded. A valid cache avoids another download. Provider credentials are not used.

The complete 16 kHz mono PCM recording is retained, including pauses, with a short tail after Stop. Quiet recordings receive bounded gain; silence is rejected rather than supplied to a language model as a guess. The existing 60-second limit remains. No transcript or microphone data is logged by the native model. A fresh decoder state is used per recording, and model memory is released afterward.

## Building and validation

The Rust dependency builds native C/C++ code. Builds require CMake and a C++ toolchain; macOS uses Xcode Command Line Tools and Windows uses the existing MSVC tools. macOS model shaders are embedded by whisper-rs-sys, so users do not install Python, CMake, a command-line recognizer or separate shader files. Model weights download at runtime rather than bloating installers.

Ordinary `cargo test --locked --manifest-path src-tauri/Cargo.toml` uses local fixtures and wiremock to cover audio validation, verified/cached downloads, corrupt/short/oversized responses and cleanup. It never downloads a model or records a microphone. Frontend tests cover preparation before capture, cancellation, React Strict Mode, complete PCM capture and review before Send.

For an opt-in real-model test, provide canonical 16 kHz mono 16-bit WAVs named `reels-uk.wav` and `reels-us.wav`, spoken as: “Please add a goal to create reels for my feminist account. One reel about Jane Doe, and one reel about a new organ discovered.” Then run:

```sh
SUMI_TEST_VOICE_MODEL=/path/to/ggml-large-v3-turbo-q5_0.bin \
SUMI_TEST_VOICE_FIXTURES=/path/to/fixtures \
cargo test --locked --manifest-path src-tauri/Cargo.toml real_local_voice_preserves -- --ignored --nocapture
```

Synthetic voices validate the real inference pipeline; they do not establish recognition accuracy for a person's microphone, accent or background noise. Repeat with consented real recordings before reporting real-world word error rates. Proper names can still need an edit, and no automatic word correction invents what the person intended.

## Upstream and licenses

- [whisper.cpp](https://github.com/ggml-org/whisper.cpp), MIT license, copyright the ggml authors.
- [OpenAI Whisper](https://github.com/openai/whisper), MIT license; model weights are distributed under its terms.
- [whisper-rs](https://codeberg.org/tazz4843/whisper-rs), Unlicense.

The corresponding notices are included in `THIRD_PARTY_NOTICES.md`.

The additional opt-in test `real_local_voice_context_recognizes_goal_rename_without_forcing_unrelated_speech` uses `rename-uk.wav` and `rename-us.wav` spoken as “Change the current goal to fix saved AI disconnecting to fix the microphone issue in sumi app.” It prints recognition with and without the local hints. Controls `colour-uk.wav` (“Change the colour to violet and leave the other colours alone.”) and `unrelated-us.wav` (“I need to buy fresh bread and tomatoes for dinner.”) check that goal vocabulary does not replace unrelated speech. Run it with the same environment variables and `cargo test ... real_local_voice_context -- --ignored --nocapture`.

## Understanding submitted dictation

When optional pre-editor correction is off, the editable draft remains the recognizer's transcript. Once the user presses Send, the existing chat request is marked as voice input. Its planner, independent action reviewer and reply composer receive the same voice-specific guidance: use the whole sentence and uniquely matching shared goal/step names to interpret likely sound-alike mistakes. A reference such as “safety eye keys disconnecting” can identify the saved goal “Fix saved AI keys disconnecting”. There is no phrase-replacement dictionary and no separate correction request before Send.

Ambiguous targets or operations require a short clarification. Negation, numbers, dates, names and literal quoted new titles must retain their meaning. Unusual new titles must not be replaced with existing titles. Sharing controls, backend validators, independent authorization and destructive-action confirmations still apply. Reply wording follows verified execution receipts rather than claiming a guessed change. Audio stays local; only submitted text follows the existing chat-sharing path. This improves interpretation after Send, not the appearance of the pre-send transcript.

Six synthetic text cases in `src-tauri/test-data/voice-dialogue-cases.json` extend the existing live dialogue check. They use isolated in-memory goals, never installed goals:

```sh
BUDDY_DIALOGUE_CASE_FILTER=voice-soundalike cargo run --manifest-path src-tauri/Cargo.toml -- --check-agent-dialogue
```

The signed packaged binary accepts the same flag when local development credential-helper access is unavailable. The check includes the reported garbled rename, ambiguous goal names, a negated command and an intentionally literal new title, a second rename paraphrase and an actual theme request. Wiremock covers prompt delivery and unchanged input through planning/authorization/reply; live results separately establish model behavior on these fixtures, not a general speech accuracy rate.

## Optional correction before the editor

`voice_text_cleanup` in AI preferences defaults to false, including for old saved settings. Settings → AI and Privacy expose a separate opt-in, **Correct dictated text before editing**. With it and AI assistance enabled, Stop first runs local Whisper, then sends only the recognized transcript (up to 4,000 characters), the app name and up to 12 bounded open goal titles to the existing Nebius response model. Goal titles are omitted when goal sharing is off. No audio, chat history, screen content, memory or activity is included. There is no new local model download.

The eight-second correction request has no retry or web/skill access. It proposes short, literal anchored edits. Backend validation rejects ambiguous/repeated spans, overlaps, changed numbers/negation, edits inside quotes/URLs/email/code, excessive expansion or oversized text. It cannot create goals, save a conversation or execute commands. Consent is rechecked before, during and after HTTP; revocation drops the result. AI_MOCK leaves the original unchanged without HTTP and remains distinct from DEMO_MODE.

The editor receives the finished corrected draft, not intermediate raw text. **Use original** restores the original including any pre-existing typed prefix; manual edits dismiss that shortcut. If correction fails, the original draft stays available with a plain fallback message. Closing voice during recognition prevents a cleanup request; closing during cleanup discards its late result. Provider detail stays in Diagnostics, never the user-facing fallback. Send remains explicit.

Run `--check-voice-drafts` on a signed packaged binary (or `cargo run -- --check-voice-drafts` with configured development credentials) for live synthetic proofreading checks. It uses only synthetic transcripts and in-memory goal fixtures and verifies no goal mutation. This evaluates text correction, not microphone accuracy. The earlier after-Send interpretation remains a second safeguard; it does not replace pre-editor correction when this option is enabled.

## Request lead-ins versus past reports

The local vocabulary includes common goal-command phrasing. Optional text cleanup considers the entire utterance when “add the goal” is heard as “I had the goal”. Polite/request cues such as “please” and a specific action followed by “for me” can support restoring an imperative. Genuine past reports, negative instructions, quoted wording and uncertain bare “I had a goal” statements stay unchanged; this is model interpretation, not a blanket string substitution. Names and domains must retain the supplied spelling, and bare domains are protected alongside URLs. Homophones in unfamiliar names can still require review.

Seven fictional cases in `src-tauri/test-data/voice-draft-intent-cases.json` extend `--check-voice-drafts` to 13 built-in cases. To test private wording without placing it in the repository, the explicit diagnostic can read up to 60 additional Case-shaped fixtures from a local JSON file under 64 KiB via `BUDDY_VOICE_DRAFT_CASES=/absolute/path/cases.json`. Only that CLI reads this variable; normal app commands do not. Reports include the supplied text, so keep private reports outside Git. No microphone, installed goals or conversations are accessed by this check.

The opt-in test `real_local_voice_preserves_add_goal_commands_and_actual_past_reports` uses local `add-goal-us.wav` and `past-goal-us.wav` fixtures with the same model/fixture environment variables as the other real-ASR tests. It checks the request/past lead-in, not full proper-name accuracy or the owner's live voice.
