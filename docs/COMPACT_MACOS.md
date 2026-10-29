# macOS build quick reference

This file is a short entry point, not a separate build policy. Current installation, permissions, local Whisper voice, internal signing and Apple Silicon-only packaging are documented in [sumi for macOS](MACOS.md).

- macOS 14.5+, Apple Silicon only; no Intel or universal releases.
- Development: `npm ci`, then `npm run dev:macos`; requires Xcode Command Line Tools, Rust, Node.js 24 and CMake.
- Delivered packaging: `npm run build:macos`, with the reviewed internal identity and existing Mac updater signing credential.
- Never install ad-hoc CI validation artifacts as a saved-key test or replace trusted signing material.
- Publish both Windows x64 and macOS together through [the shared release workflow](RELEASING_MACOS.md).
- Voice uses downloaded verified local Whisper weights, not OS Dictation language assets. See [local voice](LOCAL_VOICE.md).

Older platform measurements are retained in [historical validation](MACOS_VALIDATION.md); they are not current support promises or setup instructions.
