# sumi 0.49.2

- The app, executable, Dock name, installers, Windows shortcuts, update screen, browser extension and current setup documentation consistently use sumi.
- Existing macOS installations rename the legacy app bundle before opening the workspace, retaining the same signing identity, credential helper and application data. An existing destination is never overwritten.
- Windows updates retain the existing installation registry and data while migrating the executable, shortcut labels and startup registration to sumi.
- New download assets use sumi filenames. Previously published update bridges and signing trust remain unchanged.

This naming update does not change screen-observation reasoning or goal-completion criteria. macOS remains Apple Silicon only, minimum 14.5; Windows remains x64.
