# Desktop Buddy 0.23.1

This transition enrolls the third developer's `windows-ci` public key for future
Windows CI releases. Windows trust epoch 3 retains both existing signers,
`primary` and `developer2`. The Windows installer is signed with `primary` and
published on both epoch-2 and epoch-3 channels. An existing installation must
install this transition before it can accept a `windows-ci` signature. Legacy
0.13.0 and epoch-1 0.17.1 bridges remain available for older installations.

The macOS updater keeps its existing independent key, trust epoch 1 and endpoint.
The shared source includes the compact Buddy, chat history, local voice and
workspace changes prepared in 0.23.0. macOS installation remains ad-hoc signed;
Apple Developer ID notarization and exact macOS 14.5 runtime checks are separate.

Only the new public key was imported on this Windows computer. Its encrypted
private key remains on the third developer's Mac. GitHub cannot sign Windows
releases with it until the owner configures the Windows Actions signing secrets.
The original Windows private key remains local and is not uploaded to GitHub.

After installing this transition, the Mac owner can securely configure
`TAURI_SIGNING_PRIVATE_KEY` with the full encrypted Windows CI private-key file
and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` with its password in GitHub Actions
Secrets for `ArtmarketVM/desktop_buddy`. These are distinct from the existing
macOS secret names. Do not put either secret in Git, logs, chat or release assets.
Run future signed builds from reviewed `main` with a new synchronized version.
Collect and verify Windows and macOS artifacts before publishing a shared release.
