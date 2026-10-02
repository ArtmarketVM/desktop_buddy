# Desktop Buddy 0.13.0 for Windows

- Keep the desktop companion transparent on hover and fit its ears and Workspace button inside the compact window.
- Build personal Windows installers without a release signing key. Use `./scripts/dev.ps1 -Task build`; official update releases use the separate `-Task release` command.
- Prepare shared updates from multiple approved developers, each with their own locally protected signing key. Adding a developer requires review of their public key and a signed transition release.
- Keep signed update compatibility for existing installations, including users who skip intermediate releases.

This release includes the avatar fixes prepared for 0.12.1. No additional developer is enrolled yet. Private signing keys remain on their owners' computers and are not included in the repository or installer.

## Install or update

Download `Desktop.Buddy_0.13.0_x64-setup.exe`, or use **Updates → Check for updates → Update & restart** in an existing updater-enabled installation. The updater verifies the installer signature. Install over the existing application to keep local goals, preferences and provider credentials.

Windows x64 only. Source setup, developer key enrollment and future release instructions are in [TEAM_SIGNING.md](https://github.com/ArtmarketVM/desktop_buddy/blob/main/docs/TEAM_SIGNING.md). This is the initial compatibility release; newly approved developer keys still require a subsequent signed transition.
