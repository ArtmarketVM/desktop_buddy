# Desktop Buddy 0.24.1

A polish release for Windows and macOS, built from the same shared code.

- Dark theme: primary buttons use a darker green so white labels meet WCAG AA contrast,
  form controls have clearly visible borders, and surfaces are slightly more separated.
  The light theme is unchanged.
- Feedback now has one mechanism: an email draft to the project address, with a clear
  success message and, if no email app is configured, an error with a Copy message button.
  See docs/FEEDBACK.md.
- `scripts/build-macos.sh` can sign with a Developer ID certificate and verify it with
  codesign, spctl and stapler when `APPLE_SIGNING_IDENTITY` (and notarization credentials)
  are set. Without them nothing changes and the app stays ad-hoc signed. The release
  workflow does not import a certificate yet, so published macOS builds are still not
  notarized.

Windows installer, restart and startup registration have not been verified on a Windows
machine from this Mac; they run through the shared release workflow.
