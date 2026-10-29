# sumi for macOS

Current support: **Apple Silicon, macOS 14.5 or later**. Windows x64 shares the same release version. Intel and universal Mac installers are not produced. See [installation and testing](JUDGES_START_HERE.md) for ready-made downloads.

## Install, signing and reopening

Open the release `sumi_<version>_aarch64.dmg`, then drag **sumi.app** to **Applications**. Releases preserve the reviewed internal code-signing identity and immutable credential helper; they are not ad-hoc builds. Internal signing is not Apple Developer ID signing or notarization, so first launch can require app-specific approval in Privacy & Security. Keep system-wide security protections enabled.

Closing the workspace leaves the tray/menu-bar process running. Open the workspace through the Dock or menu-bar **Open sumi** action; **Quit** stops the process. Saved autostart settings are independent of observation consent. Starting in the background does not universally reset tracking to paused: saved consent/request and current system permissions determine observation.

## Permissions and data boundaries

- **Accessibility** supports foreground application/window metadata and bounded interface text exposed by accessible applications. Hidden tabs, inaccessible/custom content and brief transitions may be unavailable.
- **Screen Recording** permits optional active-window images via ScreenCaptureKit. The focused Accessibility window is resolved to its matching window identity and checked around capture. Excluded/private/locked states remain gates. See [observation](PERSONAL_AI_OBSERVATION.md) and [encrypted temporary evidence](DAILY_ACTIVITY_REVIEW.md).
- **Microphone** is used only for explicit voice input. Local `whisper-rs`/Whisper large-v3-turbo performs transcription with Metal on Apple Silicon. First use downloads about 548 MiB of verified public weights. This path does not depend on Apple Dictation or installed Apple Speech language assets. Audio stays in memory; optional correction sends permitted transcript text to Nebius. See [local voice](LOCAL_VOICE.md).
- **Personal provider keys** use Keychain through the pinned `BuddyCredentialAccess` helper. Built-in AI instead routes through Supabase and does not require the person's Nebius/Tavily keys. No provider key is returned to the frontend.
- **No system notification permission is requested for reminders.** Notifications appear through sumi's own character/chat cards. Legacy saved banner preferences cannot enable OS delivery.

Foreground observation is best-effort, not continuous access to every application or proof of attention. Media and meetings use app-scoped heuristic signals; no calendar integration or meeting transcription is provided. Quiet mode suppresses mascot presentation while permitted tracking can continue. New goal/step proposals require acceptance; verified completion uses its independent saved permission and Undo.

## Development and packaging

Requirements: Apple Silicon macOS 14.5+, Xcode Command Line Tools, Node.js 24, Rust and CMake. The current CI pins its Rust version in the platform workflow.

```sh
npm ci
npm run dev:macos
```

Tauri merges `src-tauri/tauri.macos.conf.json` on macOS. A frontend-only `npm run dev` does not test native collection, permissions, credential access or local transcription. Local native tests that need personal saved keys must use the reviewed internal signature; an ad-hoc parent is refused by the helper.

For a release, prepare the authorized signing environment and run:

```sh
npm run build:macos
```

The helper permits only `aarch64-apple-darwin`, sets deployment target 14.5 and produces the app, DMG, ZIP, signed updater archive, manifest and checksums. Missing signing material must fail; do not regenerate identities or use unsigned validation output as a delivered app. Source and app version must be newer than the latest public release when testing a candidate because startup updating is mandatory.

## Release and validation

Use the coordinated [release process](RELEASE_PROCESS.md), not an old platform-only workflow or tag trigger. One release contains verified Windows x64 and Apple Silicon assets. Exact runtime behavior on a particular macOS version, microphone or third-party app requires an installed manual check; a deployment target or mock test does not establish it. [Historical Mac validation](MACOS_VALIDATION.md) records older runs, including architectures no longer supported.
