# Stable internal macOS app identity

## Why permission was repeatedly lost

Older Mac releases used ad-hoc signing. Their designated requirement was a `cdhash`, identifying one exact binary. A rebuilt app no longer satisfied that requirement even when the bundle ID and Applications path stayed unchanged. Buddy's tracking setting was already persistent; the failing grant belonged to macOS, not SQLite.

See Apple's [code identity explanation](https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements) and [discussion of self-issued identities](https://developer.apple.com/library/archive/technotes/tn2206/).

## Identity and secrets

The reviewed public certificate is `src-tauri/internal-macos-signing.pem`; its SHA-256 and SHA-1 pins are in `src-tauri/macos-code-signing.json`. It is an internal certificate, not an Apple-issued certificate. Keep this identity for every developer and release. Do not generate a replacement key on another developer's computer.

GitHub Actions uses these encrypted repository secrets:

- `BUDDY_MACOS_P12_BASE64`: the existing certificate and private key as base64-encoded PKCS#12.
- `BUDDY_MACOS_P12_PASSWORD`: the encrypted PKCS#12 password.

Local builds may use the ignored `.tools/signing/internal-macos/identity.p12` and `p12-password.txt`, or explicitly provided signing environment variables. Keep a secure backup of the existing identity and its password. Never commit private keys, PKCS#12 files or passwords. The public PEM is safe to commit.

These are app-signing credentials. The existing `TAURI_SIGNING_PRIVATE_KEY_MACOS` authenticates updater archives independently and must not be replaced by this key.

## Build behavior

`npm run build:macos` defaults to internal signing. The helper validates the certificate pin before importing the private key into an isolated temporary keychain, authorizes only signing tools and adds that keychain temporarily to the search list. The build does not add a trusted root or change macOS privacy settings. Cleanup deletes the temporary keychain and private copies on success or failure.

Tauri signs the app before generating its updater archive and signature. The build checks both cryptographic validity and the exact certificate-bound designated requirement. Missing or wrong credentials fail the build. `BUDDY_MACOS_UNSIGNED=true` remains available for non-delivered PR validation; never install those ad-hoc CI artifacts over the internally signed release.

`BUDDY_MACOS_CODE_SIGNING=developer-id` remains an explicit future path for Apple-issued signing and notarization. Changing identity requires a reviewed transition and may require a new user grant.

## Local experiment on 2026-10-13

Host: Apple Silicon, macOS 27.0.1. Trial apps 0.27.1 and 0.27.2 contained different Mach-O binaries and satisfied each other's exact designated requirement:

```text
identifier "com.artmarketvm.desktopbuddy" and certificate root = H"9b85d29dad2e9328ec27631337e3e9313383ab20"
```

Trial A received the one-time grant after clearing the legacy ad-hoc entry. Its Privacy screen reported Accessibility enabled and Receiving activity. Buddy was quit, replaced at the same Applications path with trial B, and launched again. Trial B reported Accessibility enabled and Receiving activity without resetting or granting permission again. The monitoring switch remained ON. The previous 0.27.0 app was backed up locally; user data was not replaced.

This proves the tested local replacement on this host, not every macOS version, future operating-system update or Gatekeeper download flow. No Apple notarization is supplied. A user can still revoke access, and changing or losing the certificate changes code identity. Production releases remain common to Windows and Mac Apple Silicon.
