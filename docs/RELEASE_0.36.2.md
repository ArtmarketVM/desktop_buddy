# sumi 0.36.2 — AI connection reliability

Settings now refreshes the authoritative provider status after testing or changing
a key and while the AI settings are visible. A successful connection no longer
reverts to the status cached before the test. Expired checks ask for another
check instead of claiming that the saved key is broken. Dashboard refresh errors
are kept separate from provider authentication results.

Interactive reasoning requests allow up to 60 seconds instead of the short
20-second background request limit. Timed-out reasoning requests are not
automatically resubmitted, since the provider may still be processing them.
Authentication failures and provider timeouts remain distinct. Connection tests
verify authentication; they do not prove generation or search availability.

This patch includes the existing 0.36.1 coaching fixes from main. It preserves
saved keys, the credential helper, signing identities and updater verification.
The source changes apply to macOS and Windows. A local Apple Silicon build does
not establish Windows installer validation; both platform builds are required
before publishing the coordinated GitHub release.

Local Apple Silicon verification:

- 225 frontend tests and the production frontend build passed.
- 549 backend tests passed; two existing opt-in native tests were ignored.
- All 18 release-safety checks passed.
- The local app's internal signature and immutable credential helper verified.
- All nine real-provider action checks passed using the installed app and saved
  key, with synthetic goals in an isolated in-memory database.
- Both provider rows remained Connected after testing in the installed app.

The signed local 0.36.2 app was installed on macOS. No GitHub release was published,
and Windows installer validation remains pending.
