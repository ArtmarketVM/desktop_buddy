# Desktop Buddy 0.31.3

This patch completes the research and Keychain reliability update from 0.31.2 by fixing a false disconnected indicator observed in the installed app.

A successful saved-provider test now refreshes the cached startup configuration status. Previously, if startup metadata was checked before Keychain authorization or an app update finished, the Settings test could say Connected while the sidebar continued to say Not connected. Nebius, NVIDIA model access and Tavily now reflect the successful current probe. Failed or stale probes cannot restore configuration status after credentials or sharing settings change.

The immutable macOS credential bridge is unchanged byte for byte. This patch does not introduce another Keychain reader identity or require a new transition approval. Provider credentials, privacy choices, work data, reviewed Mac certificate and updater signing keys remain intact.

Includes 0.31.2's version-aware research evidence selection, verbatim quotation validation and rejection of unsupported API/configuration paths. Internal Mac signing is not Apple notarization; OS keychain locking/revocation and a future helper security upgrade can still require authorization. Research applicability remains model-assisted and provider timeouts can still occur.

Both Windows x64 and Apple Silicon macOS 14.5+ receive version 0.31.3. No Intel or universal Mac installers are produced.
