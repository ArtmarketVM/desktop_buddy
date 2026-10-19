# sumi 0.36.10 — AI reliability and clearer daily planning

- AI settings refresh verified provider status after connection checks and key
  changes. Expired checks ask for a new check; editing goals or chat no longer
  discards a valid authentication result.
- Interactive AI requests have a separate 60-second timeout. Timed-out generation
  is not automatically resubmitted, and provider outages have specific messages.
  Kimi K3 uses its supported low reasoning effort unless explicitly overridden.
- The initial Today picker says it contains previous goals, supports multiple
  selections and waits for **Done**. Selections are saved together; an invalid
  goal rolls back the entire selection. Failed saves keep your choices.
- Saved-goal search results use the clickable row without redundant plus or
  dismiss buttons. The Progress summary uses a neutral grey surface, a violet
  time total in light mode and a lime time total in dark mode.
- This release includes the 0.36.1 goal-bound coaching fixes: dedicated chat
  sessions, validated natural replies, explicit result-memory consent and stale
  response rejection.

The shared release workflow tests and builds Windows x64 and Apple Silicon
macOS 14.5+ before publishing both systems together. Existing Windows bridge
channels and the separate macOS updater channel are preserved. Updater trust,
the reviewed persistent internal Mac signing identity and the immutable
credential helper are unchanged. No private keys are included in the source.
Internal Mac signing is not Apple Developer ID signing or notarization.

Local validation covers frontend tests, the production frontend build, Rust
tests, release/signature regression checks and a signed Apple Silicon app.
Synthetic live-provider checks previously passed the nine action scenarios and
a mixed goal/step/checkpoint request without changing the installed database.
Finite checks do not guarantee provider availability or model correctness.

The local 0.36.9 predecessor was installed and restarted on this Mac. The final
CI release must also pass both platform jobs and publication verification.
Windows installation/restart, Intel Mac operation and runtime compatibility on
an exact macOS 14.5 machine have not been manually tested here. Remote computers
are not assumed to have updated.
