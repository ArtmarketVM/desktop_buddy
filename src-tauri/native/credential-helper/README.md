# Immutable macOS credential bridge

`BuddyCredentialAccess` is a small Apple Silicon executable signed with the repository's reviewed internal identity. It contains no API keys. It is intentionally committed and copied byte for byte into `Contents/Helpers` for every release. Normal builds **must not rebuild or re-sign it**. `manifest.json` pins its SHA-256 and the reviewed source hash; release checks reject changes.

Why this exists: internal code-signing certificates receive a `cdhash:` partition in the file-based macOS Keychain. The app's hash changes on every update even when its designated requirement is stable. Data Protection Keychain returns `errSecMissingEntitlement` for our internally signed app; it is not a working migration destination. An unchanged bridge retains its partition across different parent app builds and installation paths.

Security boundaries:

- Public Security framework APIs only; no fabricated Apple entitlements or private APIs.
- A request is accepted only from a same-user parent process whose running code satisfies the exact Buddy identifier and pinned certificate requirement.
- The parent must use hardened runtime without task debugging, disabled library validation, or DYLD environment injection entitlements.
- Buddy verifies the helper's identifier/certificate and strict code validity before sending any credential.
- Only the two provider accounts and one isolated synthetic self-test account are supported.
- Requests and results use anonymous pipes, never argv, URLs, environment variables, disk caches, webview IPC, or logs.
- Provider values remain in the encrypted login Keychain. New items retain its default application-specific ACL; there is no all-applications access or partition allowlist expansion.
- Metadata checks suppress UI. Credential reads are serialized and cached only in Buddy process memory. A denied read is not automatically retried by background jobs; Settings' connection test explicitly permits retry.

Existing items may require one **Always Allow** approval for the bridge, separately for each provider. This is a real identity transition; the app cannot grant it itself. Keychain locking, changed passwords, revocation, a future helper security upgrade, or replacing the signing identity can still require user interaction. This is not Apple Developer ID signing or notarization.

## Verification

Run `bash scripts/test-credential-helper.sh` on a trusted Mac with the existing local signing identity. It creates only `BUDDY_KEYCHAIN_SELF_TEST`, verifies reads from two different signed parent binaries and a relocated helper, rejects ad-hoc/direct callers, and removes the synthetic item. It never accesses provider accounts. Normal Rust tests mock providers and do not access the user's vault.

## Maintenance

Rebuild only after reviewing a necessary helper protocol/security change, using `bash scripts/create-credential-helper.sh`. Commit source, binary and manifest together; inspect the signed binary and rerun positive and negative integration tests. A changed helper is a new Keychain identity and may need one renewed authorization. Do not regenerate the internal certificate. Do not import Windows updater signing keys into this component.
