# Desktop Buddy 0.39.4

- No visible change. Ten frontend views the app never displayed were removed with their tests, along with the helpers, API wrappers and two font packages only they used.
- About 1,840 lines of styles for classes nothing renders were removed; the global CSS went from 8,246 to 6,402 lines.
- A new blocking check (`npm run lint:unused`, knip) fails CI on unused files, exports, types and dependencies, and on modules imported only by their own tests, with a budget of zero. See `docs/QUALITY_GATES.md`.
- Rust code and native commands are unchanged.

## Distribution

Windows x64 and Apple Silicon macOS 14.5+ ship under the same version. The existing internal Mac signing identity, credential helper and updater trust keys are preserved. No Intel or universal Mac build is included.

## Validation

ESLint (0 errors, 0 warnings), the unused-code check (0 findings), 227 frontend tests and the production build passed locally. All 34 visual screens rendered pixel-identical to the previous release in a local before/after comparison. The strict Windows visual gate, both platform validation jobs and the signed release workflow run in CI before publication.

## Known limitations

The automatic-parking issue noted in 0.39.3 is unchanged and not claimed fixed. Park and Resume have no on-screen control; they remain available through chat. Browser screenshots do not validate native window behavior, credentials, permissions or macOS rendering.
