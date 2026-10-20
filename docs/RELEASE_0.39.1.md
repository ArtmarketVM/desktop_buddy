# Desktop Buddy 0.39.1

This maintenance release integrates the three developers’ frontend, CSS and quality-infrastructure changes on top of 0.39.0.

- Consolidate shared colors, typography and component geometry while preserving the existing appearance, responsive layouts and companion controls.
- Share frontend data snapshots and batch backend reads across workspace screens, the companion, AI settings and activity views. Invalidate affected data after backend changes.
- Preserve user edits in noticed-work suggestions across background refreshes and wait for shared settings snapshots before confirming a save.
- Use the published privacy-policy URL and serve its fonts locally.
- Add reviewed visual regression baselines, frontend and Rust lint reports, and reproducible cross-platform acceptance evidence.

## Distribution

Windows x64 and Apple Silicon macOS 14.5+ use the same release version. macOS retains the existing internal signing identity; this is not Apple Developer ID signing or notarization. Existing updater signing keys and credential-helper trust are unchanged. No Intel or universal Mac installer is provided.

## Validation

Release is gated on strict Windows browser comparisons against the reviewed baselines, frontend tests and production build, release-integrity checks, locked Rust tests, formatting and both platform builds. Detailed results are recorded in the release workflow and integration handoff. Browser screenshots do not establish native window, permission or installed-app behavior.

Integrated frontend validation passed 265 tests across 51 files, TypeScript/Vite build and all 18 release-integrity checks. Strict comparison against the existing owner-reviewed Windows browser baselines passed in [the integration CI job](https://github.com/ArtmarketVM/desktop_buddy/actions/runs/39501993396/job/118901518103); no baseline was regenerated. Existing non-blocking frontend lint findings remain visible (11 errors / 13 warnings), as documented in Developer 2's quality handoff.
