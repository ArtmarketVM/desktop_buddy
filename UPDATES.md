# Windows app updates

Desktop Buddy uses [Tauri's signed updater](https://v2.tauri.app/plugin/updater/) with public GitHub Releases endpoints. A commit or push alone is not an app update. The blue **Update available** icon appears only when the published manifest contains a newer version for Windows x64. Version 0.13.0 introduces several trusted developer keys and compatibility channels; this source update must be released before installed 0.12.0 clients gain that support. See [team signing and migration](docs/TEAM_SIGNING.md).

Checks run when the workspace opens, every four hours, and when returning to the app after at least 30 minutes. **Updates → Check for updates** checks on demand. Offline errors, invalid manifests and a repository without published releases have distinct states. The app never installs automatically.

**Update & restart** downloads the exact checked installer, verifies its Minisign signature, starts the current-user Windows installer and restarts Buddy. Only HTTPS installers from this repository are accepted. Existing SQLite data and Windows Credential Manager entries retain their paths. Unsaved plan edits block installation; other unsaved forms should be saved first. Developer builds cannot install updates.

## Builds without a key

Running Buddy, tracking and development do not require a private updater key. `./scripts/dev.ps1` starts development. `./scripts/dev.ps1 -Task build` creates a personal Windows installer with no updater signing, in the ignored `.tools/builds/development` target directory. Downloaded official installers never contain private signing keys; users need not generate one.

## Local signed release

```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 -Task test
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 -Task release
```

The installer, `.exe.sig` and `latest.json` appear in `src-tauri/target/release/bundle/nsis/`. The helper uses `%USERPROFILE%/.desktop-buddy/signing-key.dpapi`, protected with Windows DPAPI for the current Windows user, or an explicitly supplied `TAURI_SIGNING_PRIVATE_KEY`. For a newly generated `.tools/updater.key`, run `scripts/protect-signing-key.ps1` to encrypt it outside the project and remove the plaintext source. Keep signing material outside OneDrive and other synchronized source folders. The helper clears its temporary signing environment variable after building. The private key is not included in the installer; the configured public key is safe to commit.

DPAPI storage is tied to your Windows account and computer. Keep a separate secure, encrypted backup before reinstalling Windows or changing computers. Losing the private key prevents signing updates for this installed public key. Never commit or print it.

## Publish with the key kept only on your computer

Push the reviewed source code and create a draft GitHub Release for the matching version tag. Upload the locally signed installer, its `.exe.sig`, `latest.json` and every generated `updates-epoch-*.json`, then publish the release. Archive the generated public `updates/compatibility.json` with the release source. Older clients follow pinned transition manifests; current clients use their trust-epoch channel. The signing key never needs to leave its developer's computer.

Normal branch and pull-request CI still runs without secrets. Creating or pushing a release tag does not trigger signing; local releases are published with already signed assets.

## GitHub release setup

As an optional alternative, save the decrypted signing key **contents** in this repository's Actions secrets as `TAURI_SIGNING_PRIVATE_KEY`. Do this only after explicit owner approval. The generated key has no password; leave `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` unset. For a password-protected replacement, set that second secret as well and distribute a compatible public key before switching signing keys. Repository visitors cannot read Actions secrets, but workflows with access can use and potentially expose them; restrict release-workflow changes to trusted maintainers.

Synchronize all five version files, commit and push the reviewed code to main. If you later choose GitHub signing, run `.github/workflows/build-windows.yml` manually with `publish_release=true` and a matching `release_tag`. It tests and builds the signed installer, creates verified manifests, uploads the installer, signature and every compatibility channel to a draft release and publishes it after upload. Retrieve and commit its generated public compatibility archive for subsequent releases. This opt-in job fails if the signing secret is absent or the selected branch is not main. Ordinary builds use `tauri.ci.conf.json` and never need the private key. CI installers are test artifacts and must not be distributed as signed updates.

Publish each delivered installer under a unique version. Use minor releases for new features and patch releases for fixes. Do not replace the assets of an already delivered version. GitHub Releases must remain public for this unauthenticated endpoint. See [the release workflow](.github/workflows/build-windows.yml).

Minisign verification protects the app's update mechanism. It is separate from Microsoft Authenticode signing and Windows SmartScreen publisher reputation.

## Design references

The sidebar, quiet neutral palette, consistent spacing and progressive disclosure follow the user's Codex icon reference and the principles in [Linear's UI redesign](https://linear.app/now/how-we-redesigned-the-linear-ui) and [Notion's sidebar navigation](https://www.notion.com/help/navigate-with-the-sidebar). The product retains its own companion and goal workflow.
