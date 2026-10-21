# Typography

This is the type rule book for sumi. It records what the main screens render and the owner's decisions of 21 October 2026. Tokens live in `:root` in `src/workspace.css`; font assets are imported in `src/style.css`. Never write a literal `font-size` in px; use a token.

## Faces

- **Instrument Sans** (`--sans`) for everything people read: titles, headings, body text, labels, buttons, navigation and chat in both windows.
- **Silkscreen** (`--pix`) only for tiny uppercase captions and the sidebar wordmark. It never sets a sentence. Silkscreen ships one weight; pixel rules declare 400 where they set a weight.
- Code uses the system monospace.

## Scale

Five sizes for reading, plus the wordmark.

| Role          | Token             | Face       | Size | Weight    | Line height | Used for                                                                                         |
| ------------- | ----------------- | ---------- | ---- | --------- | ----------- | ------------------------------------------------------------------------------------------------ |
| Title         | `--text-title`    | Sans       | 34px | 600       | 1.2         | The one page title per screen and the focus figure on My progress                                |
| Heading       | `--text-heading`  | Sans       | 18px | 500       | 1.3         | Section headings (Active, Archive, Your sumi), dialog titles                                     |
| Body          | `--text-body`     | Sans       | 14px | 400 / 500 | 1.5         | Goals, steps, chat messages in both windows, settings rows, navigation, the Privacy sentence     |
| Caption       | `--text-caption`  | Sans       | 11px | 400 / 500 | 1.45        | Dates, times, counts, helper lines, the hint `?` glyph; medium for small links such as due dates |
| Pixel caption | `--text-pix`      | Silkscreen | 8px  | 400       | —           | Uppercase eyebrows, priority tags, day chips, chart axis labels                                  |
| Wordmark      | `--text-wordmark` | Silkscreen | 15px | 400       | —           | The sidebar logo only                                                                            |

Chat messages use body size wherever they appear. The Chats page and the companion window must match.

## Weights

- **400 regular** for body text, descriptions and captions.
- **500 medium** for headings, buttons, names, the selected item and small links.
- **600** (`--weight-emphasis`) only for the page title and the My progress focus figure. This is the one deliberate exception; nothing else uses it.
- No bold (700) anywhere, including inside sentences.

## Color

Primary text uses `--text`. Captions and descriptions use `--muted`. The accent is for links and the selected item of a control, never for titles, labels or status words. For emphasis use medium weight, not color.

## Layout rhythm

One title per screen. If a screen has no title (a chat pane, a dialog), its largest text is a heading. The shared page title row keeps its 40px line box (`--page-title-leading`) so titles sit in the same place on every screen.

## Values outside the main screens

These remain as named tokens because the surfaces that use them were not part of this review. Do not reuse them on the main screens.

| Token                      | Value                    | Use                                         |
| -------------------------- | ------------------------ | ------------------------------------------- |
| `--text-rating-mark`       | 30px                     | Feedback rating glyph                       |
| `--text-orbit-mark`        | 35px                     | Decorative orbit mark                       |
| `--text-star-large`        | 27px                     | Large decorative star                       |
| `--text-star-small`        | 16px                     | Small decorative star                       |
| `--text-onboarding`        | `clamp(25px, 3vw, 31px)` | Onboarding title                            |
| `--text-onboarding-legacy` | `clamp(26px, 4vw, 35px)` | Fully overridden historical onboarding size |

Review them when onboarding is redesigned.

## Decision record (21 October 2026)

Measured on the eight main screens of v0.39.2 (Today, My progress, All goals, Chats, Settings General/AI/Privacy, the companion window). The owner approved:

1. The Privacy sentence moved from 15px to body (14px). `--text-privacy` was removed.
2. The hint `?` glyph moved from 10px/600 to caption (11px/500). `--text-hint` was removed.
3. The companion window header ("sumi") moved from bold to medium.
4. Companion window chat messages moved from caption (11px) to body (14px), matching the Chats page.
5. Titles keep 600. The proposal to make them medium was declined.

Pixel rules that declared 500 or 600 now declare 400. This is not visible, because Silkscreen has a single weight. Some pixel elements still inherit 500 from shared button styles; that is equally invisible and needs no override.
