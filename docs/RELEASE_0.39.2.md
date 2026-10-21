# Desktop Buddy 0.39.2

- Hide the What's new section in the update dialog until version-specific update descriptions are introduced.
- Remove the repeated placeholder descriptions from Windows and macOS updater manifests. Apps using the current updater channels also stop displaying that placeholder while downloading this update.

## Distribution

Windows x64 and Apple Silicon macOS 14.5+ ship under the same version. The existing internal Mac signing identity, credential helper and updater trust keys are preserved. No Intel or universal Mac build is included.

## Validation

The frontend change already passed all 265 tests across 51 files and the production build before release preparation. Those test results remain applicable because frontend source and dependencies have not changed since that run. Version validation, production build and all release-integrity checks are run for 0.39.2. The signed release workflow additionally runs frontend tests, locked Rust tests and formatting on both systems, builds both platform packages and verifies the complete release before publication.

## Known limitations

The previously identified automatic-parking issue can save the new window's context to the previous goal. That behavior is unchanged by this update and is not claimed fixed. Existing non-blocking lint findings remain documented in the Developer 2 quality handoff. This release does not establish a new live-provider, microphone or complete installed-app manual acceptance run.
