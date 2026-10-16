# Typography

One system for the app, the site and anything else that carries the sumi name.

## Fonts

| Role | Font | Where |
| --- | --- | --- |
| Display | Shippori Mincho (serif) | Page titles (`h1`) and the sumi wordmark. Nothing else. |
| Text | Zen Maru Gothic (rounded sans) | Everything else: headings inside a page, body, labels, buttons, captions, chat. |
| Code | System monospace | Code spans and blocks only. |

The serif is the voice of the product name and of a screen's title. It never appears in a card, a list, a dialog or a chat message.

## Sizes

Four sizes, exposed as CSS tokens. Nothing else is allowed in a stylesheet.

| Token | Size | Line height | Use |
| --- | --- | --- | --- |
| `--text-title` | 34px | 1.2 | The one page title per screen; the big number on Progress. Serif. |
| `--text-heading` | 18px | 1.3 | Section headings inside a page, dialog titles, the current chat's title. Sans, medium. |
| `--text-body` | 14px | 1.5 | Goal titles and steps, chat messages, settings labels, inputs, buttons, navigation. |
| `--text-caption` | 12px | 1.4 | Secondary information: counts, dates, helper lines under a label, tags, timestamps. |

Markdown inside chat uses the body size; its headings use the heading size; code shrinks by 10% relative to the text around it.

## Weights

Two weights: 400 regular and 500 medium. Medium is for headings, the selected state, and the one primary action on a screen. Body text, descriptions and captions are regular. No bold inside sentences.

## Colour of text

Primary text uses `--text`. Captions and descriptions use `--muted`. Links and the accent use `--accent-text`. Never lower opacity to make text quieter; pick the muted token.

## Rules of thumb

- One title per screen, serif, 34px. If a screen has no title (the chat pane, a dialog), its largest text is a heading at 18px.
- A row is body text; whatever qualifies it (count, due date, duration) is a caption beside it in the muted colour.
- Helper text under a control is one caption line. If it needs two sentences, the control is doing too much.
- Buttons and inputs are body size; they never shrink to captions to fit.
- Decorative glyphs (stars, mascot marks) are drawings, not text, so they are exempt.
