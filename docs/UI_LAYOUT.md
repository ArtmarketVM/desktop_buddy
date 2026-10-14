# Screen layout rule

Every screen in the workspace uses the same column. Do not add per-screen widths or title offsets.

- **Column:** one centered column that fills the window up to `--page-max` (1040px). Defined once on
  `.app-shell .main` in `src/compact.css`.
- **Gutters:** `--page-gutter` is 48px on windows 1500px and wider, 40px normally, 24px at 1100px and
  below, and 16px at 650px and below.
- **Title:** the page title is the first block of the column. It has a fixed top margin (40px), a
  40px line height and no per-page overrides, so it sits in the same place on every screen. A page
  action (for example Quiet mode) is right-aligned in the title row.
- **Content:** every block after the title (notices, page content) spans the full column, so all
  right edges line up with the title row.
- **Notices:** warnings and notices use the shared callout strip (see `.callout` in `src/core/core.css`).
- **Switches:** use `.toggle-row` with a checkbox; the track is 40 x 24 and the knob stays inside it.
- **Type and color:** fonts and colors come only from the `:root` variables in `src/workspace.css`
  (`--serif` Shippori Mincho for headings and the brand, `--sans` Zen Maru Gothic for text, the sumi
  moss-green accent on sky-blue and white, deep green in dark mode). Do not add hard-coded hex colors or other font families.
