# macOS validation

## 0.23.2 coordinated release and installed Mac update

Checked on 2026-10-09. Release source: `7d8caf76839072d7cff465439a60789955ac59b9`.
The complete [release workflow](https://github.com/ArtmarketVM/desktop_buddy/actions/runs/37985717570)
passed and published [0.23.2](https://github.com/ArtmarketVM/desktop_buddy/releases/tag/v0.23.2)
for Windows x64, Apple Silicon and Intel macOS.

| Check | Result |
| --- | --- |
| Frontend suite on all three build hosts | 79 passed per host |
| Release and signing suite | 13 passed per host |
| Rust suite | Windows: 163 passed; each Mac architecture: 166 passed; 2 opt-in tests ignored per host |
| Native production builds and signed updater packages | Passed on all three hosts |
| Downloaded public release | All SHA-256 checks passed; actual Windows and both Mac updater signatures verified |
| Published release completeness | Both Mac architectures and Windows have matching 0.23.2 channels and required installer assets |
| Windows compatibility | Legacy channels unchanged: latest.json -> 0.13.0, epoch 1 -> 0.17.1, epoch 2 -> primary-signed 0.23.1; epoch 3 -> windows-ci-signed 0.23.2 |
| Mac channel | Existing macOS epoch 1 and signer retained; both architectures point to 0.23.2 |
| Public latest/download endpoints | All five channel URLs fetched and their versions/platforms checked |
| Mac packaging | Both DMG image checks passed; ZIP and updater executables match; native architectures and minimum OS 14.5 verified |
| Installed Apple Silicon update | Existing 0.22.1 app automatically installed 0.23.2 after relaunch; installed executable matches the public updater archive |
| Installed app code signature | codesign --verify --deep --strict passed |
| User data | All three goal records exactly match the preinstallation SQLite backup |
| Post-update launch | User confirmed Keychain access and that the 0.23.2 workspace opens; automation could not inspect the new window |
| Release ordering | Shared workflow concurrency and same/newer-version publication guards enabled; published assets are not replaced |

The Windows install/restart cycle and runtime on exact macOS 14.5 hardware were
not exercised in this Mac session. Renewed Accessibility and live AI behavior
after this update were not verified. macOS remains ad-hoc signed without
Developer ID notarization, so system permission renewal can still be required.
The prior provider connection checks are historical evidence, not a new
post-update provider test.

## 0.23.0 coordinated release

Checked on 2026-10-09 using GitHub macOS runners for Apple Silicon and Intel and a local Windows build host. Release source: `2aa0879cfca4b9eb67930d03b7fbceb9179fb159`. Both signed macOS jobs passed in [workflow run 37979721334](https://github.com/ArtmarketVM/desktop_buddy/actions/runs/37979721334).

| Check | Result |
| --- | --- |
| Shared frontend suite on each Mac architecture | 79 tests passed |
| Rust suite on each Mac architecture | 166 passed; 2 opt-in tests ignored |
| Windows Rust suite | 163 passed; 2 opt-in tests ignored |
| Release/signing checks | 8 passed |
| Production frontend and native release builds | Passed on Windows, Apple Silicon and Intel |
| Apple speech and existing macOS bridge linkage | Passed on both Mac architectures |
| Packaging | Windows NSIS installer; Apple Silicon and Intel DMG, ZIP and updater archives |
| Downloaded CI artifact digests and DMG/ZIP checksums | Verified |
| macOS app version and native architecture | 0.23.0; arm64 and x86_64 respectively |
| Mach-O minimum OS and app minimum version | macOS 14.5 for both Mac builds |
| Updater archive and ZIP executable consistency | Verified for both Mac builds |
| Windows and Mac updater signatures | Verified against the existing platform trust sets |
| Update channels | Windows epoch 2, preserved legacy Windows channels, combined Mac manifest for both architectures |
| Apple signing | Ad hoc; Developer ID notarization is not configured |
| Native interaction | Microphone permissions, speech, dragging and multi-monitor behavior still need manual checks on installed systems |

See [the compact macOS guide](COMPACT_MACOS.md) for the remaining manual checks. The earlier local validation below remains historical evidence; it does not validate the new compact UI.

## 0.21.0 local validation

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
