# Windows workspace design QA — 0.10.0

> Historical 0.10.0 design validation. Current interface rules and screenshot gates are indexed in [docs/README.md](docs/README.md). The dated screenshots and results below are not the current application UI.


**Final result: passed**

## Visual truth and scope

- Source: `C:/Users/mkors/AppData/Local/Temp/codex-clipboard-16bf17ea-3a06-4288-95dc-7ce375c97bcf.png`, 84 × 178 pixels. Source CSS size and capture density were not supplied.
- The source specifies a blue circular download indicator above a purple profile circle. It does not specify a complete application layout. The rest of the workspace follows the user's request for quiet, modern sidebar navigation; it is intentionally not a pixel clone of Codex.
- Implementation: browser-rendered production React components at `http://127.0.0.1:1420/?preview=workspace` and the installed Windows application.
- Full-view evidence: `.tools/qa-focus.jpg` (1264 × 978), `.tools/qa-settings-final.jpg` (1264 × 957), `.tools/qa-update-available.jpg` (1280 × 720).
- Focused/native evidence: `.tools/qa-native-current.png`, showing the installed Windows app checking the real public release and reporting the latest version.
- Desktop CSS viewport: 1280 × 720, reported devicePixelRatio 1.5. Browser output is rendered at approximately CSS-pixel dimensions; the full-page captures include vertical scrolling. The source is a small raster crop, so full-layout pixel equality is not claimed.
- Minimum-window check: CSS viewport 760 × 600; `.tools/qa-settings-760.jpg` is a scaled browser-surface capture (745 × 419). Used to inspect responsive structure, not to make a 1:1 pixel comparison. No horizontal DOM overflow; sidebar Updates and profile controls remain visible.
- Evidence files are local ignored QA artifacts, not release assets.

## Comparison history and findings

1. Compared the source and initial Focus capture together in one image input. The quiet palette, content hierarchy and sidebar placement meet the brief. Neutral charcoal replaces the source's brown background intentionally. The existing companion remains part of this product.
2. [P2, fixed] Settings initially exposed a long page of controls and disclosures, with native checkbox styling. Evidence: `.tools/qa-settings.jpg`. Grouped notifications, services, privacy and feedback into collapsible sections, and styled preference checkboxes as accessible switches. Kept disclosure content and native form semantics.
3. Captured revised Settings at the same desktop viewport and compared it with the source in the same input: `.tools/qa-settings-final.jpg`. The settings list now has consistent section rhythm and restrained controls. No actionable P0/P1/P2 visual issues remain.
4. Compared the blue available-state indicator and source together: `.tools/qa-update-available.jpg`. The 36 CSS-pixel blue circle, white download-to-line icon and purple profile circle preserve the reference motif. The supplied image contains no app-specific text to copy. The icon is from the existing Lucide library, not a handcrafted asset replacement.

The available-state screenshot uses an explicitly labeled, ignored UI fixture with installation disabled. The shipped app never fabricates availability. Native verification used actual GitHub responses: no published release before publication, then the latest published version after publication.

## Required fidelity surfaces

- **Typography:** one system in `docs/TYPOGRAPHY.md`: Instrument Sans for everything, Silkscreen for 8px pixel captions and tags, monospace for code; four sizes (34/18/14/12) as tokens and two weights (400/500).
- **Spacing/layout:** persistent sidebar, aligned header and content margins, restrained 7–13 px radii, consistent card/section spacing. Settings uses progressive disclosure. Navigation preserves mounted form drafts.
- **Colors/tokens:** neutral dark surfaces and subtle separators; blue communicates updates/actions. Available, checking, unavailable and disabled states remain distinct. Visible keyboard focus and reduced-motion handling are provided.
- **Images/assets:** sharp existing companion assets; consistent Lucide icons. No replacement of supplied raster art with custom illustrations. The reference's standard download/profile motifs are implemented with the existing icon system and account initials.
- **Long lists:** any list that can grow without bound (goals, archive, tracked activity) uses the shared `Pager` from `src/core/Pager.tsx`: ten rows per page via `usePage`, numbered page buttons underneath, nothing shown for a single page. Goal lists have no separators between rows, like Today.
- **Copy/content:** English product text, truthful empty states and version status. Browser-only limitations are labeled in previews. Download progress, retry errors and unsaved-plan blocking are explicit. Provider/privacy disclosures remain available within their relevant sections.

## Interaction and verification checklist

- [x] Focus, Activity, Resources, Goal history and Settings navigation.
- [x] Empty-data screens and grouped Settings rendering.
- [x] Update dialog opening/closing and disabled browser installation.
- [x] Available-state indicator and Update & restart layout in a separate UI fixture.
- [x] Minimum native-window size layout without horizontal overflow.
- [x] Browser console checked: no errors or warnings.
- [x] 40 frontend tests, production build and release-manifest verification passed.
- [x] 82 Rust tests passed; one pre-existing credential-vault test intentionally ignored.
- [x] Signed installer verified against the configured public key; tampered bytes rejected.
- [x] Windows installation, shortcut launch and native GitHub update check verified.
- [x] Public 0.10.0 manifest and version-pinned installer URL verified.
- [x] Release metadata uses GitHub-normalized asset names (spaces become periods); the installer bytes and signature remain unchanged.
- [x] Installed executable matches the build apart from Tauri's expected NSIS bundle marker.

## Residual gaps

This is the first updater-enabled release. A complete live upgrade to a genuinely newer release has not yet been exercised; there is no fabricated newer release or simulated installer run. Existing onboarding retains its clearly labeled draft privacy notice. These are functional/release limits rather than outstanding visual drift.

**final result: passed**

# Companion controls design QA — 0.33.0

## Source, evidence and normalization

- Visual truth: the user's capsule reference (`Photo 1.jpg`), subsequent `Screenshot 2026-10-16 at 14.59.08.png`, and divider reference `Screenshot 2026-10-16 at 15.02.41.png`.
- Final native captures: `.tools/reports/buddy-action-bar/native-collapsed.png` and `native-expanded.png`, each 320 × 304 pixels from a 160 × 152 CSS-pixel companion window at scale factor 2.
- Source and final collapsed capture were opened together in one comparison input. The source and implementation character bodies both measure approximately 112 physical pixels wide. Compare the character/capsule region, excluding the native capture's white transparency composite and synthetic cursor overlay.
- Component preview: `http://127.0.0.1:1421/.tools/reports/buddy-action-bar/preview.html`, using real React components in a separate native test webview. Three selected avatar colors were inspected. Local artifacts are ignored, not release assets.

## Comparison history

- P2, fixed: the first implementation disappeared completely. Replaced it with a persistent capsule and animated width/height transitions.
- P2, fixed: the initial strip was too far from the character and too thick. Reduced thickness from 6 to 4 CSS pixels and moved it closer, following both user corrections.
- P2, fixed: moving the capsule vertically during expansion could move it out from under a stationary pointer and cause repeated collapse/expand. Its top edge is now stationary; it grows downward.
- Added the requested subtle vertical divider between the chat and microphone buttons.
- Final native expanded/collapsed captures show no remaining actionable visual mismatches within the requested component scope. The existing sumi character and selected palette are intentionally preserved.

## Fidelity surfaces

- Typography: no new visible text; existing English accessible labels and tooltips retained.
- Layout: 64 × 32 CSS-pixel expanded surface, 24 × 4 collapsed capsule; fixed layout slot prevents mascot movement. Both native captures reviewed at equal density.
- Color: inherited selected avatar color, existing ink token and a low-opacity divider. Transparent native window compositing differs from the supplied dark desktop intentionally.
- Assets: existing vector mascot and Lucide icons retained; no replacement illustrations or raster approximations.
- Content: text and voice actions retain their original behavior. The capsule has no misleading extra label or action.

## Interaction verification and limits

- Half-second timeout, pointer reveal, capsule reveal, keyboard focus, open-chat pinning and native hover callbacks covered by component tests.
- Native macOS keyboard focus reveals the toolbar; removing focus returns to the capsule. The two final native captures verify the divider and spacing.
- SVG hit targets, physical-to-logical coordinates including negative monitor origins, native input restoration, window geometry changes, drag hold, hidden-window suppression, cleanup and failure recovery covered by pointer-adapter tests.
- OS-level composite click-through and hover cannot be certified through this computer-use tool: its window-targeted synthetic clicks do not move the real global macOS cursor. Native overlapping test windows were attempted; those clicks are not reported as an OS-level pass.
- Windows interactive desktop testing remains a manual follow-up; the common adapter is compiled and regression-tested in the coordinated release workflow.
- Reduced-motion CSS disables both surface and icon transitions. No provider calls or credentials are involved in this UI review.

**final result: passed**
