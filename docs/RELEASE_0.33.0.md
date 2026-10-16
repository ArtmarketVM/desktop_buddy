# Desktop Buddy 0.33.0

Shared update for Windows x64 and Apple Silicon Macs running macOS 14.5 or later. Includes the 0.32.2 Today update: in-place goal/step editing, priority sorting, goal finder, deadlines, progress summary and automatic goal checkpoints.

- The companion's chat and microphone controls now use its selected color, with smaller icons and a subtle divider.
- After half a second outside the companion and its controls, the toolbar smoothly collapses into a thin capsule close to the character. Hovering over the character or capsule reveals it without clicking.
- Open chat, active interactions and keyboard focus keep the controls available. Reduced-motion preferences disable the morph animation.
- The character's interactive area follows its painted SVG silhouette. Transparent margins pass mouse input to the application underneath; the toolbar, chat and suggestion cards remain interactive.
- Native hit testing accounts for display scale and window movement. It uses transient pointer coordinates only, without collecting screen content or sending data to AI services.

macOS installers remain Apple Silicon only. Existing update signature verification, reviewed macOS signing identity and credential helper are preserved.

## Validation

The companion branch passed 192 frontend tests, 515 Rust tests and 18 release/signing checks locally. After merging the 0.32.2 Today update, all 201 frontend tests passed; the combined Rust suites and platform installers are checked again by the coordinated CI workflows. Two existing Rust tests requiring live credentials or a real credential vault remain intentionally ignored. Native macOS expanded/collapsed captures and keyboard interaction were checked. Real OS mouse pass-through and Windows desktop interaction remain manual verification items; window-targeted synthetic clicks are not reported as equivalent to physical mouse testing.
