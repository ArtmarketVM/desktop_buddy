# Shared Windows and macOS releases

macOS 0.22.0 introduces a signed Apple Silicon updater channel. Install this
bootstrap version once; later releases use the existing Updates button, download
and verify the archive, replace the installed app, and restart. Existing Windows
signers and compatibility channels are unchanged.

The macOS updater key is independent of Developer ID signing/notarization. Its
public key is in `src-tauri/trusted-signers.macos.json`. The private key stays in
the ignored `.tools/signing/desktop-buddy-macos.key` file with restricted file
permissions on the owner's Mac. Keep a secure backup; losing it requires a
reviewed signing-key transition. Never add the private key to Git or an installer.
The build supports the path or contents through `TAURI_SIGNING_PRIVATE_KEY`, as
documented by the [Tauri updater](https://v2.tauri.app/plugin/updater/).

For GitHub automation, configure repository Actions secrets:

- `TAURI_SIGNING_PRIVATE_KEY` and its optional password: existing Windows signer.
- `TAURI_SIGNING_PRIVATE_KEY_MACOS` and its optional
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD_MACOS`: the owner's macOS updater key.

Synchronize all five version files, test, commit and push the reviewed source to main.
Build Windows locally with `scripts/dev.ps1 -Task release -SignerId developer2`
using the existing protected key; do not upload that key to GitHub. Dispatch
**Build signed macOS release** (`release.yml`) with the matching release tag to
test and build Apple Silicon and Intel using the existing macOS Actions secret.

Collect both Mac artifacts and the locally signed Windows installer in one draft
release. Verify every archive signature and its signed version, then generate a
combined Mac manifest containing `darwin-aarch64` and `darwin-x86_64`. Include the
Windows signature, `latest.json`, every Windows compatibility channel, the Mac
manifest, both DMGs, both signed updater archives and checksums. Publish only
after all three platform builds and signatures pass. Existing installers under
older version tags must not be replaced. Archive the generated public Windows
compatibility metadata with the release source.

Normal PR/branch CI uses unsigned macOS bundles and cannot publish an update.
Local `npm run build:macos` uses the restricted local key if no signing environment
variable is provided. Signed archives, signatures, a verified manifest, DMG, ZIP
and checksums are placed in `artifacts/`.

Publish both platforms together after collecting the verified workflow artifacts. A macOS-only
release must also retain the latest Windows compatibility manifests as release
assets because existing Windows clients resolve the latest GitHub release.
Publishing a release without those manifests interrupts Windows update checks.

Ad-hoc app signing supports local installation. Public distribution should use
the owner's Developer ID certificate and notarization; macOS may otherwise
require renewed Accessibility approval after a changed app signature. macOS
14.5 needs its own runtime validation; the minimum deployment target alone is
not a hardware test.

# Goal monitoring

The onboarding switch **Track goals and suggest completed work** explicitly
enables local activity collection and bounded Nebius text checks together. The
same switch in Settings pauses both. The onboarding screen offers Nebius key
setup, and macOS requests Accessibility access. Missing permissions, missing
keys, and provider failures are visible on Today and Progress. Progress checks
continue outside notification hours, and proposals remain available in Buddy chat.

Activity time and completion remain separate. An AI completion proposal needs
an exact visible receipt and confidence of at least 0.9. Completing a whole goal
requires that no steps remain unfinished, and always requires user confirmation.
Editing the plan, changing the goal, or withdrawing sharing invalidates proposals.
App names, time spent, drafts and title similarity do not prove completion.
