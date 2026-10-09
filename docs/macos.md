# macOS builds

Version 0.22.0 uses the same Today, Goals, Chats, collapsed sidebar and compact Buddy components as Windows. Conversation history and goal data use the shared SQLite implementation. Full chat accepts Cmd + Enter; compact chat accepts Enter. No duplicate Mac frontend is maintained.

## Build on a Mac

Install Node.js 24, Rust stable and Xcode Command Line Tools, then run:

```sh
npm ci
npm test
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run tauri -- build -- --locked
```

Tauri automatically merges `src-tauri/tauri.macos.conf.json`. The configuration builds `.app` and `.dmg` bundles for macOS 12 or later, enables Buddy's transparent window and includes microphone/speech permission descriptions. The native speech bridge is compiled with the installed Apple SDK for the selected architecture. It has no additional Rust dependencies or runtime helper executable.

The GitHub `macOS build` workflow tests and builds Apple Silicon and Intel separately. Download the matching `desktop-buddy-macos-apple-silicon` or `desktop-buddy-macos-intel` artifact, open its disk image and copy Desktop Buddy to Applications. CI artifacts use ad hoc signing; Developer ID signing and Apple notarization are not configured. macOS automatic updates remain unpublished, so install new Mac builds manually. The app does not select the Windows updater channel on macOS.

## Local voice

Allow microphone access when starting a recording. Apple Speech requests speech recognition permission when transcribing the first recording. Denied permissions can be changed in System Settings > Privacy & Security. The app checks `supportsOnDeviceRecognition` and sets `requiresOnDeviceRecognition`; unsupported languages produce a visible error without a cloud fallback. English (`en-US`) and Russian (`ru-RU`) are tried when available; automatic mode selects the strongest non-overlapping candidate using the shared confidence filter. The native recognizer waits at most 45 seconds per language. Recording ends at 60 seconds; the transcript remains editable before sending.

The full Chats page records and transcribes on Mac too. The compact voice bar supports mute, stop and switching back to text. Closing it or switching modes releases the microphone. Audio is converted from WebKit's native sample rate to the backend's validated 16 kHz WAV format; native recognition consumes the audio in memory without temporary files.

## Validation on macOS

Windows checks cover shared frontend behavior, PCM normalization, transcript validation and backend regressions. Compilation against Apple frameworks, native permissions and window behavior must also pass on a Mac. The workflow runs the Apple compiler and a local language discovery test without requesting permissions or recording audio.

Validated on Windows on 2026-10-09: 78 frontend tests, 159 backend tests (two optional live/vault tests ignored), six release/signing checks and the TypeScript/Vite production build passed. Rust formatting and property-list parsing passed. The Apple framework bridge and macOS workflow have not been executed on this host; no Mac installer has been built or delivered yet.

Before delivering a Mac installer, verify:

1. Today, Chats, sidebar collapse and saved conversations after restarting the installed app.
2. Transparent desktop Buddy, text/voice switching, dragging, restoring its position and fallback after disconnecting a monitor.
3. Microphone and speech permissions granted and denied; English/Russian availability; short recording, mute, stop and closing while recording.
4. Cmd + Enter in Chats, Enter in compact chat, and an editable transcript before sending.

Existing Windows-only activity collection, global selection shortcut, saved provider credentials and startup registration are separate platform integrations. This change does not add Mac adapters for those services; provider keys can still be supplied through the existing runtime environment fallback. Live voice replies are not implemented on either platform.
