# Desktop Buddy 0.31.2

This fix targets two failures observed in the installed 0.31.1 application.

## Research evidence

The old response could combine version 1 configuration nesting with a version 2 setting, while displaying a mixture of official, outdated and third-party links. Research now has an explicit evidence selection stage, using the configured dialogue model (Kimi K3 by default).

Each retrieved source needs an applicability decision for the requested version, platform and scope. Conflicting and unverified sources are excluded. Applicable sources require exact excerpts from the retrieved content; Rust checks source indices, uniqueness, lengths and literal quotation membership. Only those excerpts reach research synthesis. A separate deterministic guard rejects qualified API/configuration paths absent from the selected evidence, even if a model reviewer would approve them. Chat allows one bounded rewrite before withholding an unverified answer.

The same source selection is used for general chat research, consent-bound goal research and goal analysis. Existing consent, privacy, stale-state, source URL and deduplication checks remain. If research is off/unavailable, chat reports that directly without asking a writer to manufacture an answer. The live audit rubric rejects the specific v1 prefix and old/WIP sources in its Tauri 2 fixture.

This adds one bounded inference per nonempty research result. It does not run on collector ticks. The applicability decision is still model-assisted, and snippets may lack enough information; this is a safer research pipeline, not a universal factual accuracy guarantee.

## macOS Keychain

The internally signed app cannot use the attempted Data Protection Keychain migration (`errSecMissingEntitlement`, reproduced using an isolated fixture). The old code ignored migration write failures. File-based Keychain partitions internally signed binaries by their changing code hash, causing update-to-update prompts despite the unchanged certificate.

A separately signed, immutable credential bridge now accesses the existing encrypted login Keychain items. Its bytes and signature are pinned and preserved across releases. It authenticates the running Buddy parent and hardened-runtime policy; Buddy verifies the bridge before passing credentials through anonymous pipes. It does not allow arbitrary applications, weaken ACLs, export real keys, or change updater signers.

Reads are serialized and cached only in process memory. A failed read stays suppressed until an explicit Settings retry or restart. Existing provider items may need one transition approval for Buddy Credential Access. Subsequent unchanged-helper reads are tested across different signed parent binaries and helper paths. OS keychain locking/revocation and a future helper upgrade may still require authorization.

Windows continues to use Credential Manager. Both systems receive the shared research fixes under the same version. Mac packages support Apple Silicon only, macOS 14.5 or later. Internal signing is not Apple notarization.

## Verification

- Full frontend and Rust regressions, release/signature checks, and signed Apple Silicon packaging.
- Mixed-version fixtures, invented quotations, invalid/duplicate indices, missing evidence, independent answer repair, and minimal evidence-request context.
- Isolated OS Keychain integration: two parent builds, relocated helper, denied ad-hoc and direct callers, synthetic item cleanup.
- Native Windows validation and live provider evidence are recorded with the release work; they must pass before describing the release as complete for both systems.
