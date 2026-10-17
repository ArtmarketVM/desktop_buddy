# Typography

One system for the app, the site and anything else that carries the sumi name.

## Fonts

Two faces with strictly separate jobs. **Instrument Sans** is the typeface: titles, the wordmark, headings, body, labels, buttons, chat. **Silkscreen** is the pixel face and appears only as tiny uppercase captions at 8px: priority tags, chart axis labels, section eyebrows such as "Ideas" or "AI services". It never sets a sentence or anything a person has to read at length. Code uses the system monospace.

## Sizes

Four sizes, exposed as CSS tokens. Nothing else is allowed in a stylesheet.

| Token | Size | Line height | Use |
| --- | --- | --- | --- |
| `--text-title` | 34px | 1.2 | The one page title per screen, and the focused-time figure on Progress. Bold (600), tight tracking. |
| `--text-heading` | 18px | 1.3 | Section headings inside a page, dialog titles, the current chat's title. Sans, medium. |
| `--text-body` | 14px | 1.5 | Goal titles and steps, chat messages, the open chat's name (medium), settings labels, inputs, buttons, navigation. |
| `--text-caption` | 11px | 1.45 | Secondary information: counts, dates, due dates, tags, timestamps, the rare helper line. |

Markdown inside chat uses the body size; its headings use the heading size; code shrinks by 10% relative to the text around it.

## Weights

Two weights: 400 regular and 500 medium. Medium is for headings, the selected state, and the one primary action on a screen. Body text, descriptions and captions are regular. No bold inside sentences.

## Colour of text

Primary text uses `--text`. Captions and descriptions use `--muted`. The accent colour is for links and for the selected item of a control (a segmented button, a selected day), never for titles, labels, tags inside a list or status words. If something needs emphasis, make it medium weight, not green.

## Rules of thumb

- One title per screen at 34px. If a screen has no title (the chat pane, a dialog), its largest text is a heading at 18px.
- A row is body text in ink, including items in a list such as saved chats; whatever qualifies it (count, due date, duration) is a caption beside it in the muted colour.
- Helper text under a control is one caption line. If it needs two sentences, the control is doing too much.
- Buttons and inputs are body size; they never shrink to captions to fit.
- Decorative glyphs (stars, mascot marks) are drawings, not text, so they are exempt.
