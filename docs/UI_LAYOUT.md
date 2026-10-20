# Workspace layout and theme contract

Every workspace screen uses the same column. CSS consolidation preserves the shipped layout, including responsive and companion-window exceptions; it does not redesign it.

## Shared column

- The column is centered, fills the available window and is limited by `--page-column-max` (1040px). `.app-shell .main` exposes it as `--page-max`; direct content blocks share its right edge.
- Default gutters are `--page-gutter-default` (40px), becoming `--page-gutter-wide` (48px) at 1500px, `--page-gutter-narrow` (24px) at 1100px and below, and `--page-gutter-small` (16px) at 650px and below.
- The title row starts 40px below its containing main area. Titles use `--text-title`, `--page-title-leading` (40px) and the shipped emphasis weight. The macOS toolbar reserves `--window-toolbar-size` (44px) above the sidebar/main content.
- The sidebar uses `--sidebar-width-expanded` (192px) and `--sidebar-width-collapsed` (72px). Collapsed labels, tooltips and utilities keep their existing behavior and breakpoints.
- Notices use the shared `.callout` treatment. Do not add per-screen widths, title offsets or alternate callout geometry.
- `.toggle-row` checkboxes use the shipped square switch: `--switch-width` × `--switch-height` (28 × 16), a `--switch-knob` (10px) knob, `--switch-offset` (3px) inset and `--switch-travel` (12px). Focus outlines and reduced-motion handling remain part of the contract.

## Palette

Theme and size tokens live in `:root` in `src/workspace.css`, with dark-theme overrides immediately after the default token block.

| Role                 | Light                  | Dark                   | Token                    |
| -------------------- | ---------------------- | ---------------------- | ------------------------ |
| Canvas               | White `#ffffff`        | Ink `#1f1f1f`          | `--canvas`               |
| Sidebar              | Warm neutral `#f3f3ef` | Near-black `#171717`   | `--sidebar`              |
| Surface              | White `#ffffff`        | Charcoal `#262626`     | `--surface`              |
| Raised surface       | Grey `#ececec`         | Charcoal `#2e2e2e`     | `--raised`               |
| Main text            | Ink `#1f1f1f`          | Warm white `#f3f3ef`   | `--text`                 |
| Muted text           | `#6c6c66`              | `#a3a39d`              | `--muted`                |
| Accent               | Violet `#6c5fff`       | Light violet `#8f85ff` | `--accent`               |
| Soft accent          | `#ecebff`              | `#2d2a4a`              | `--accent-soft`          |
| Lime                 | `#e4fa8e`              | `#e4fa8e`              | `--lime`                 |
| Connected service    | Green `#15803d`        | Green `#22c55e`        | `--service-connected`    |
| Disconnected service | Red `#dc2626`          | Red `#f87171`          | `--service-disconnected` |

The compact sidebar uses lime for verified service dots and violet for attention states. The older green/red `--service-connected` / `--service-disconnected` tokens are retained without recoloring the current dots.

The visual identity is white, ink, lime and violet, not the older moss-green/sky-blue design. Existing priority/status treatments and fixed illustration colors are preserved. A fixed color must stay fixed across themes when the original CSS did so: do not replace it with a theme-dependent token merely because the light value happens to match. `--color-fixed-*` tokens retain those historical values; semantic tokens remain the first choice for new design work.

Typography uses Instrument Sans and Silkscreen via `--sans` and `--pix`. See [TYPOGRAPHY.md](TYPOGRAPHY.md) for the shipped exceptions and decisions still required from the owner.

## Companion window

Both the main workspace and transparent Tauri companion load the global styles. Preserve the transparent root, native avatar anchor, painted-geometry hit testing, chat/intervention geometry, hover-expanding action bar and reduced-motion behavior. A workspace rule must not make the companion's transparent margins opaque or interactive.

The full import/ownership map, retained cascade exceptions and verification evidence are in [CSS_CONSOLIDATION.md](CSS_CONSOLIDATION.md). Do not change stylesheet imports, selectors or DOM structure without coordinating with the component owner.
