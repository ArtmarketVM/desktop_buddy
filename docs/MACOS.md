# Desktop Buddy for macOS — 0.21.0

Windows and macOS share the React UI, Rust application state, SQLite schema, AI providers and companion. Platform adapters are selected at compile time. Windows retains its NSIS configuration and native adapters; `tauri.macos.conf.json` is merged automatically on macOS.

## Install

Use `artifacts/Desktop.Buddy_0.21.0_aarch64.dmg`, open it and drag **Desktop Buddy.app** into **Applications**. The application contains an Apple Silicon executable and declares macOS **14.5** as its minimum system version. The same app is intended for macOS **14.5** and **27.0.1**; separate OS-specific installers are unnecessary.

Local builds use ad-hoc code signing and are not notarized by Apple. For personal use, macOS may require **System Settings → Privacy & Security → Open Anyway** after the first launch attempt. Do not disable Gatekeeper globally. Public distribution requires a Developer ID certificate and notarization; these are separate from Tauri updater signatures.

## Permissions and behavior

- **Accessibility**: explicitly enable Desktop Buddy under System Settings → Privacy & Security → Accessibility to collect foreground app/window titles and selected text. Onboarding and Activity & Privacy settings include a permission button. Resume tracking after granting permission. Goals and chat work without it.
- **Microphone / Speech Recognition**: requested only for explicit voice input. Recognition requires an available on-device recognizer and installed language support. Audio is temporarily stored with private file permissions and removed after recognition; it is never sent to an AI provider by this adapter. Russian and English availability varies by Mac and installed Dictation assets. Automatic language uses the system locale, rather than mixed-language recognition.
- Provider keys use the current user's **Keychain** through Security framework APIs. They are never returned to the frontend or stored in SQLite. Environment fallback and provider consent remain unchanged.
- Login startup uses a per-user `com.artmarketvm.desktopbuddy.plist` LaunchAgent, written only by installed release builds after setup. It launches the installed `.app` with `--background`, with tracking paused. Disabling startup removes that file. Moving the app requires saving the startup setting again.
- Closing the workspace keeps Buddy in the menu bar. Choose **Quit** there to stop it. The companion supports transparency, dragging and always-on-top behavior. macOS fullscreen Spaces may hide overlays; fullscreen suppression remains enabled. Tauri transparency uses its macOS private API feature, so this configuration targets distribution outside the Mac App Store.
- **Command + Option + B** opens selected text in Buddy; **Command + Option + G** proposes it as a goal. Secure fields are excluded. Inaccessible selections require manual paste. **Command + Enter** sends chat messages.

## Tracking limits

The collector uses NSWorkspace, Accessibility and CoreGraphics idle time. Browser domains are best-effort chrome-only Accessibility reads for Safari, Chrome, Edge, Firefox, Brave and Arc. Reads are bounded, skip web document nodes and secure controls, and discard full addresses after hostname sanitization. Unknown, localized, hidden or edited address bars fall back to the window title. No screenshots, keystrokes, or page HTML are captured. Automatic visible-text suggestions have their own consent and read only bounded static text with on-screen frames; they exclude editable and secure controls.

The output audio-device running flag is a conservative suppression guard; it does not identify media content. Meeting detection is heuristic. Installed app discovery inspects app-bundle metadata under `/Applications`, `/System/Applications` and `~/Applications`, without launching applications or returning their paths. Known executables such as VS Code's `Electron` receive a stable app-specific alias so their role rules do not classify unrelated Electron apps.

## Build

Requirements: macOS, Xcode Command Line Tools (`xcode-select --install`), Node.js 24+, and Rust stable through rustup.

```bash
npm ci
npm test
npm run build
MACOSX_DEPLOYMENT_TARGET=14.5 cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
npm run build:macos
```

The build helper installs the selected Rust macOS target, sets the deployment target to 14.5 and produces an Apple Silicon `.app`, `.dmg`, `.zip`, and SHA-256 checksums. It uses the optional ignored `.tools` Rust installation when present; it does not modify the global PATH. For an optional universal or Intel build:

```bash
npm run build:macos -- universal-apple-darwin
npm run build:macos -- x86_64-apple-darwin
```

`npm run dev:macos` runs the desktop development app. Generated apps and installers live in ignored `src-tauri/target` and `artifacts` directories. The checked-in `.icns` preserves the existing Buddy artwork.

## GitHub and updates

The macOS workflow tests on `macos-14` and `macos-latest` and uploads the Apple Silicon installation artifacts. The Windows workflow also runs on the macOS feature branch, preserving a shared source version. CI runners do not establish exact 14.5 or 27.0.1 GUI compatibility.

The initial macOS build is installed manually. The existing Windows updater and signer trust are preserved. macOS checks accept only trusted, repository-pinned `.app.tar.gz` updater archives for `darwin-aarch64` or `darwin-x86_64`; a Windows-only manifest reports that no macOS update is published. The current Mac packaging does not publish such archives or manifests. Do not replace the Windows update channels or publish a new updater key without following the repository's signing procedure.

No release tag or public release is created by the feature branch. To distribute both platforms in one reviewed release, merge the branch, run both build workflows and attach the matching version's Mac artifacts to the Windows release. Use Developer ID signing/notarization for wider Mac distribution.

## Validation

Record actual local checks in `docs/MACOS_VALIDATION.md`. A deployment target and successful cross-compilation do not replace testing on an Intel Mac or on a Mac actually running 14.5. Before declaring exact compatibility, check first launch, permission refusal/grant, activity and idle time, app rules, companion movement, menu-bar reopen/quit, Keychain persistence, voice with supported languages, deep links, login startup and multi-monitor/fullscreen behavior on each requested OS.
