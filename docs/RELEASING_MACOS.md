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

Synchronize the version, run tests, commit and push the reviewed source branch.
Push a `v<package.json version>` tag on that exact commit to start **Publish Windows
and macOS release** (`release.yml`). By default it builds macOS and retains the
current signed Windows installer and all compatibility channels, verifying the
artifact signature and pinned URL before publication. A manual dispatch also
supports `publish_windows=true` when the existing Windows signing secret is
configured. Both platform jobs must verify their artifacts before the draft becomes public. The
release includes Windows compatibility manifests and `updates-macos-epoch-1.json`
alongside the actual signed platform bundles. Do not reuse a delivered version
or upload a new signature over an existing version.

Normal PR/branch CI uses unsigned macOS bundles and cannot publish an update.
Local `npm run build:macos` uses the restricted local key if no signing environment
variable is provided. Signed archives, signatures, a verified manifest, DMG, ZIP
and checksums are placed in `artifacts/`.

Use the repository workflow to publish both platforms together. A macOS-only
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
