# macOS validation — 0.21.0

Checked locally on **2026-10-08**, on an **Apple Silicon Mac running macOS 27.0.1 (26A434)**, with the macOS 27 SDK, Node 24 and Rust stable. The user requested Apple Silicon only.

| Check | Result |
| --- | --- |
| Frontend tests (`npm test`) | 67 passed |
| Frontend production build | Passed |
| Rust suite (`cargo test --locked`) | 158 passed; 2 opt-in tests ignored |
| Isolated native Keychain test | Passed: create, read, replace, delete, missing-item reads/deletes; test entry removed |
| Updater/signer tests | 6 passed |
| Contact-service tests | 8 passed |
| Rust formatting / Git whitespace | Passed |
| Objective-C bridge compilation | Passed for macOS 14.5 deployment target |
| Release packaging | Apple Silicon `.app`, DMG, ZIP and SHA-256 file produced |
| Executable architecture | arm64 |
| Mach-O `LC_BUILD_VERSION` | Minimum OS 14.5; SDK 27.0 |
| App `LSMinimumSystemVersion` | 14.5 |
| Ad-hoc code-signature verification | `codesign --verify --deep --strict` passed |
| ZIP and DMG checksums | Both passed |
| Native UI on 27.0.1 | Observed installed 0.21.0 app loading and displaying the three-step onboarding UI |
| Final arm64 bundle UI automation | Existing installed instance receives launches via the single-instance plugin; separately launching the final bundle needs that instance to be closed |
| macOS 14.5 hardware | Not available locally; not runtime-tested |
| macOS permissions / full feature parity | Live collection, voice languages, login startup, overlays and deep links still need the documented manual checks with the user's permissions |
| Windows build | Preserved platform code/configuration and existing tests; a Windows runtime/build host was not available locally |
| GitHub CI | Workflows prepared; cannot run on the remote branch until write access is available |
| Real AI provider calls | Not exercised; no credentials required by unit tests |

The initial universal build was also successfully compiled with x86_64 and arm64 slices, both declaring macOS 14.5. The final deliverable follows the user's Apple Silicon preference. There was no Intel runtime test.

The final installable files are `artifacts/Desktop.Buddy_0.21.0_aarch64.dmg` and `artifacts/Desktop.Buddy_0.21.0_aarch64.zip`. Builds are ad-hoc signed, not Developer ID signed/notarized. The minimum deployment target establishes the intended compatibility range; it does not prove exact 14.5 hardware compatibility.
