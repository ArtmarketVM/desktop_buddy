# Desktop Buddy 0.47.1

## Work noticed actually notices

- Measure unlisted work per context, not per review segment. Time in the same app, title and page now adds up regardless of the daily summary's five-minute review segments, which restart every five minutes and on any gap. Previously the suggestion clock followed those segments, so a 29-minute session became dozens of sub-four-minute pieces and the three-minute threshold for a "Work noticed" card was almost never reached.
- Let the model, not a clock, say what the card covers. When sumi asks whether sustained unlisted work deserves a goal, it shows the model the last 20 minutes of windows and the model names which of them were stages of the same work, for example a company search followed by its job posting. The card's minutes and the time moved on acceptance cover exactly the current presence in the window plus the named stages. Earlier time in the same window stays unassigned unless named, so a morning session is never relabelled by an afternoon decision. There is no visit timer.
- Let the observation pass propose a goal for sustained unlisted work. It may now suggest a goal when two or more observations over several minutes show one subject that matches no listed goal, such as researching a company before an interview, instead of only for an explicit request addressed to you. Adding the goal still requires your acceptance.

Detected calls remain excluded from "Work noticed" cards. Time recorded before this release is not re-grouped.

Available for Windows x64 and Apple Silicon macOS 14.5 or later.
