# Desktop Buddy 0.39.3

- Companion window messages use the same reading size as the Chats page, and the companion header is set in medium weight instead of bold.
- The sentence on Settings · Privacy uses body size, and the small question-mark hints in Settings use caption size. The app now uses five reading sizes and no bold text; page titles keep their existing weight.
- The type rule book in `docs/TYPOGRAPHY.md` records the approved scale and the decisions behind it.
- ESLint and Clippy are now blocking quality gates with a budget of zero warnings; all previous findings were fixed or narrowly justified in place.
- Unused legacy settings, privacy, tracking and onboarding views were removed together with their tests and styles.

## Distribution

Windows x64 and Apple Silicon macOS 14.5+ ship under the same version. The existing internal Mac signing identity, credential helper and updater trust keys are preserved. No Intel or universal Mac build is included.

## Validation

The typography change passed 265 frontend tests and the production build, and the strict Windows visual gate compared all 34 screenshots with zero differing pixels after the owner approved the 12 intentionally changed captures. The lint change passed ESLint with 0 errors and 0 warnings, 257 frontend tests, the production build, Apple Silicon Clippy with 0 warnings, both platform validation jobs and the strict visual gate on its pull request. The signed release workflow additionally runs frontend tests, locked Rust tests and formatting on both systems, builds both platform packages and verifies the complete release before publication.

## Known limitations

The previously identified automatic-parking issue can save the new window's context to the previous goal. That behavior is unchanged by this update and is not claimed fixed. Browser screenshots do not validate native window behavior, credentials, permissions or macOS rendering. This release does not establish a new live-provider, microphone or complete installed-app manual acceptance run.
