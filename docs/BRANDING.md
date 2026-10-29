# sumi product naming

All current user-facing app, installer, shortcut, release and extension names use **sumi**. New public assets beginning with 0.49.2 use `sumi_<version>_*`. macOS bundles are `sumi.app`; the packaged executable is `sumi` / `sumi.exe`.

Compatibility identifiers intentionally retain their historical values: `com.artmarketvm.desktopbuddy`, the `desktopbuddy://` protocol, package/crate/library identifiers, credential services, the immutable credential helper and signing requirements, repository URLs, Windows installation registry keys and previously published update assets. Renaming these is not a visual-branding change and could disconnect existing data, keys or update channels.

Windows uses the Tauri CLI 2.11.5 installer template with only its legacy installation registry identities preserved. Visible names use `product_name`; only shortcuts targeting the existing executable are migrated. The updater continues installing into the running installation directory. Existing startup registration is migrated when startup preferences synchronize.

The standard macOS updater extracts into the existing bundle path. On the next release startup, the exact legacy `Desktop Buddy.app` is renamed to `sumi.app` in the same directory before any windows or user state initialize. Its existing certificate-bound signature must verify. An atomic exclusive move refuses an existing destination; failed relaunch restores the old path. Read-only or conflicting installations remain usable and can be moved manually. No database, keychain entry, permissions or signing identity is rewritten.

Historical release notes, signed compatibility channels and validation evidence retain the names actually used at publication. Do not rename or replace delivered assets.

Release gates rehearse the actual signed macOS legacy-bundle relaunch before packaging and install the verified published Windows 0.49.1 package followed by the new installer on an isolated hosted Windows runner. The Windows gate checks executable/shortcut names, the retained installation registry and a user-data sentinel; it never launches the app or sends provider requests. The macOS check exits before application state is opened. These rehearsals run during release packaging, not at every application startup.
