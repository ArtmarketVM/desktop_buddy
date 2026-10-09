# Desktop Buddy 0.23.2

Windows and macOS now ship together through one release workflow. A release is
published only after Windows x64, Apple Silicon and Intel macOS pass their checks,
updater signatures are verified, and all platform assets and channels are uploaded
to a draft. Published versions cannot be replaced.
Publication also stops if a same or newer release appears while the builds run,
so concurrent development cannot move the update channels backward.

Windows updates use the enrolled `windows-ci` signer. Existing Windows clients
receive the primary-signed 0.23.1 transition through retained compatibility
channels before accepting the new CI signature. `primary` and `developer2`
remain trusted. macOS keeps its existing independent key and channel, with
macOS 14.5 as the minimum deployment target.

The shared app includes compact Buddy, local voice, chat history, goal monitoring
and workspace changes from 0.23.1. Buddy checks for updates at launch. During a
session, available updates appear in the blue Updates entry; choose Update &
restart after saving edits. Offline machines receive updates when they reconnect
and check again.

macOS bundles remain ad-hoc signed. macOS may request renewed Accessibility or
Keychain access after installation; Apple Developer ID signing and notarization
are separate work. Runtime compatibility on an exact macOS 14.5 machine and a
Windows install/restart cycle have not been verified on this Mac.

For future releases, synchronize the five version files, add release notes,
push reviewed `main`, and run `release.yml` with the new `release_tag`. The
Windows validation workflow no longer publishes partial releases.
