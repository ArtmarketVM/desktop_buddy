# Windows workspace design QA — 0.10.0

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

- **Typography:** locally bundled DM Sans, clear heading/body/helper hierarchy, consistent weights and line heights. Long descriptions wrap; account names truncate in the sidebar. Native Windows title bar retains OS typography.
- **Spacing/layout:** persistent sidebar, aligned header and content margins, restrained 7–13 px radii, consistent card/section spacing. Settings uses progressive disclosure. Navigation preserves mounted form drafts.
- **Colors/tokens:** neutral dark surfaces and subtle separators; blue communicates updates/actions. Available, checking, unavailable and disabled states remain distinct. Visible keyboard focus and reduced-motion handling are provided.
- **Images/assets:** sharp existing companion assets; consistent Lucide icons. No replacement of supplied raster art with custom illustrations. The reference's standard download/profile motifs are implemented with the existing icon system and account initials.
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
