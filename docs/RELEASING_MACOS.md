# Shared Windows and macOS releases

Release from reviewed main using the `Publish Windows and macOS release` workflow
(`release.yml`) and the synchronized new `release_tag`. It builds and tests
Windows x64 and Mac Apple Silicon (14.5+), verifies signatures and compatibility
channels, then publishes one complete GitHub release. Intel Mac and universal
Mac installers are not produced. Never replace delivered installers under an
existing version.

Required repository Actions secrets:

- `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the existing Windows updater signer.
- `TAURI_SIGNING_PRIVATE_KEY_MACOS` and optional `TAURI_SIGNING_PRIVATE_KEY_PASSWORD_MACOS`: the existing Mac updater signer.
- `BUDDY_MACOS_P12_BASE64` and `BUDDY_MACOS_P12_PASSWORD`: the reviewed persistent internal Mac app-signing identity.

App signing and updater signing are separate. Preserve both identities. Follow
[the permission persistence procedure](MACOS_PERMISSION_PERSISTENCE.md) for the
internal certificate, its encrypted backups and local validation. Missing app
signing credentials must fail the delivered build rather than silently fall
back to ad-hoc signing. Do not generate fresh certificates per developer.

Normal PR CI uses ad-hoc Mac artifacts for validation and cannot publish an
update. Those validation artifacts must not replace a delivered internally
signed app. Local release packaging uses `npm run build:macos`; output includes
the DMG, ZIP, signed updater archive, verified manifest and checksums in the
ignored `artifacts/` directory. Existing Windows compatibility bridges are kept.

Internal signing is not Apple Developer ID signing or notarization. The initial
transition from old ad-hoc releases may require one Accessibility approval;
future versions must preserve the same certificate-bound identity. A browser
download may still require macOS Open Anyway. Apple Developer ID is an explicit
future distribution option and requires its own reviewed identity transition.
The minimum deployment target does not establish exact macOS 14.5 runtime testing.

## Goal monitoring is a separate validation boundary

Signing and packaging do not establish screen-to-goal accuracy. Use [current observation architecture](AI_ARCHITECTURE.md), [observation permissions and evidence](PERSONAL_AI_OBSERVATION.md), and [the native demo runbook](HACKATHON_DEMO_RUNBOOK.md). Built-in AI is the default; personal-key mode remains available. New goal/step proposals require acceptance. Independently verified completion uses its saved permission (on for new profiles), otherwise asks for confirmation; Undo is durable. Do not infer success from a green connection indicator or a package build.
