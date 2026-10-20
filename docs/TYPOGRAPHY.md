# Typography

This document records the current typography and the conflicts still awaiting an owner decision. CSS consolidation keeps the rendered values; it does not resolve conflicting design rules by changing the UI.

## Fonts and primary scale

Instrument Sans (`--sans`) is the primary typeface for titles, headings, body text, labels, buttons and chat. Silkscreen (`--pix`) is used for tiny uppercase captions and tags. Code uses the existing monospace treatment. Font assets remain imported in `src/style.css`; shared tokens are defined in `:root` in `src/workspace.css`.

| Token            | Shipped value | Typical role                                         |
| ---------------- | ------------- | ---------------------------------------------------- |
| `--text-title`   | 34px          | Page titles and the Progress focus figure            |
| `--text-heading` | 18px          | Section/dialog headings and chat titles              |
| `--text-body`    | 14px          | Goal/step text, messages, controls and navigation    |
| `--text-caption` | 11px          | Counts, dates, timestamps and supporting information |

The corresponding unitless line-height tokens are `--leading-title` (1.2), `--leading-heading` (1.3), `--leading-body` (1.5) and `--leading-caption` (1.45). The workspace title row retains its explicit `--page-title-leading` (40px).

Regular 400 and medium 500 remain the normal weights. Primary text uses `--text`, secondary text uses `--muted`, and links/selected controls use their existing accent tokens. Preserve existing hover, focus and selected states.

## Preserved special values

These are named exceptions, not permission to introduce arbitrary sizes. Stylesheet declarations use the tokens rather than literal pixel font sizes.

| Token                      | Value                    | Existing use                                                                          |
| -------------------------- | ------------------------ | ------------------------------------------------------------------------------------- |
| `--text-pix`               | 8px                      | Silkscreen eyebrows, priority/day/chart labels, memory headings and custom-color chip |
| `--text-wordmark`          | 15px                     | Sidebar wordmark                                                                      |
| `--text-privacy`           | 15px                     | Privacy summary sentence                                                              |
| `--text-hint`              | 10px                     | The hint `?` glyph                                                                    |
| `--text-rating-mark`       | 30px                     | Feedback rating glyph                                                                 |
| `--text-orbit-mark`        | 35px                     | Existing decorative orbit mark                                                        |
| `--text-star-large`        | 27px                     | Existing large decorative star                                                        |
| `--text-star-small`        | 16px                     | Existing small decorative star                                                        |
| `--text-onboarding`        | `clamp(25px, 3vw, 31px)` | Shipped onboarding title override                                                     |
| `--text-onboarding-legacy` | `clamp(26px, 4vw, 35px)` | Earlier onboarding title declaration retained until safely consolidated               |
| `--weight-emphasis`        | 600                      | Existing title, brand, focus-figure and hint emphasis                                 |

Decorative glyphs are drawings, but their existing font-based dimensions are also tokenized. Tokenization does not change the selected face or the amount of emphasis.

## Owner decisions still open

1. **Weight:** AGENTS.md permits 400/500 only; the previous typography document explicitly requested 600 for titles and the shipped CSS uses it. The refactor preserves all five declarations: `h1, .workspace-brand > div, .onboarding-brand`; `.chat-conversations > h1`; `.app-shell .main > .page-title h1`; `.progress-total`; and `.hint` (the grouped first rule counts as one declaration). Decide separately whether 600 should remain in all those contexts.
2. **Four-size limit:** the earlier document allowed only four sizes while also requiring 8px pixel captions. The shipped UI additionally has 15px wordmark/privacy text, a 10px hint, responsive onboarding sizes and decorative sizes. All are preserved above; any removal or resizing is a visible design proposal.
3. **Wordmark face:** the earlier prose said Instrument Sans everywhere except tiny captions, while the shipped wordmark rule selects `--pix` at 15px. Preserve that face until the owner chooses a separate design change.
4. **Title rhythm:** the scale lists a 1.2 line height, while the shared workspace title uses 40px. The current row geometry is preserved rather than forced to 40.8px.

No visible typography change is part of this refactor. Any future proposal to normalize weights, faces or special sizes must be reviewed separately and must not be hidden in baseline updates.
