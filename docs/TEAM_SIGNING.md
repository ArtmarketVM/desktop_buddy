# Windows builds and team signing

Version 0.13.0 provides personal builds without signing credentials and support for approved team signers. Existing 0.12.0 installations still trust the original key and receive 0.13.0 through the initial compatibility channel. No additional developer is enrolled and no private key has been shared or uploaded to GitHub.

## Running and building without a private key

Users download the official installer and run it normally. There is no signing-key setup in onboarding. Developers can run and build independently:

```powershell
npm ci
./scripts/dev.ps1
./scripts/dev.ps1 -Task build
```

The last command creates a personal installer without an updater signature under `.tools/builds/development/release/bundle/nsis/`. It requires the normal Rust/MSVC/Windows SDK prerequisites, but no signing credential. It does not publish a release or replace official signed artifacts. Provider keys for optional AI remain separate runtime credentials.

## A developer creates their own key once

```powershell
./scripts/setup-signing-key.ps1 -SignerId developer-name
```

The script refuses to overwrite an existing signer. It creates a key outside the repository, verifies Windows DPAPI protection and removes its temporary plaintext file without printing the private key. The private key stays at `%USERPROFILE%/.desktop-buddy/signers/developer-name/signing-key.dpapi`. Only `public-key.pub` is shared with the maintainer. Keep a separately encrypted backup: DPAPI is bound to the Windows account/computer. Reuse the same key for later releases.

The owner keeps the existing protected primary key at `%USERPROFILE%/.desktop-buddy/signing-key.dpapi`. No changes are made to that key. GitHub Actions Secrets remain optional and are not configured by this work.

## Enroll the public key and ship a transition

First publish the initial 0.13.0 bridge signed with the existing primary key. Then a maintainer reviews the developer's public file and runs:

```powershell
node scripts/add-trusted-signer.mjs developer-name C:/path/to/public-key.pub
```

This changes only public source: `src-tauri/trusted-signers.json`, the Tauri endpoint and `updates/trust-history.json`. It advances the trust epoch and rejects private key files, duplicate keys and duplicate names. It does not give repository write access, import a private key or publish anything. Bump all five version files to a new patch/minor version; do not reuse a delivered installer version.

Review and build this transition with an **already trusted** signer. A new key cannot authorize itself. The existing owner signs the first such transition; after that, any currently trusted team member can sign a later transition. Once users install it, their apps accept signatures from either developer. Ordinary users never receive private keys.

## Build an official signed release

```powershell
./scripts/dev.ps1 -Task test
./scripts/dev.ps1 -Task release -SignerId developer-name
# The owner uses -SignerId primary (the default).
```

The release task loads only the selected local protected key (or an explicit signing environment override), builds the installer, verifies the signature against the trusted public list and checks its signed version. It then creates all required updater manifests. Unknown keys and altered artifacts are rejected. The signing environment loaded by the helper is cleared afterward. This command does not push or publish.

Commit the generated **public** `updates/compatibility.json` with the release source before publishing. Keep the trust history and compatibility manifests; do not regenerate older installers. Publish the installer, its `.sig`, `latest.json` and **every** `updates-epoch-*.json` to the same new GitHub Release. The optional workflow includes these channel files; when using CI, retrieve its generated compatibility archive and commit it for subsequent releases. Never add private keys to Git.

## Why the compatibility files are required

The original app looks at `latest.json`. That file stays pinned to the initial bridge signed by the original key. New apps read a channel for the trust epoch embedded in their build. When an epoch changes, the previous channel stays pinned to a transition installer signed by a key it already trusts; the newest channel points to current releases signed by any approved developer.

Example: 0.12.0 reads `latest.json` and installs 0.13.0 (epoch 1). After enrollment, epoch 1 points to an owner-signed 0.13.1 (epoch 2). Epoch 2 can then receive 0.14.0 signed by the other developer. Even a user who skips intermediate releases still follows these verified transitions. The manifest generator checks that each new bridge is signed by a previously trusted key. The installer remains on the pinned official repository; no keys from the network are automatically trusted.

A key introduced after an app was installed still requires a trusted transition. A newly generated arbitrary key cannot sign updates for existing installations until this enrollment is shipped. Otherwise signature verification would provide no publisher authentication.
