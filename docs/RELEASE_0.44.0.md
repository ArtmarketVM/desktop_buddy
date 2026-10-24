# Desktop Buddy 0.44.0

## Measured time reaches your goals

- Let the AI assign foreground activity to an open goal as the primary attribution. The dedicated goal matcher now runs alongside the observation pass instead of being replaced by it, receives each goal's description, completion criterion and next steps, and judges by purpose: reading, researching, messaging or working with an AI assistant about a goal's subject counts even when the window title never repeats the goal's words.
- Count the whole stable context once a goal is identified. Time measured in the same app, window and page since that context began moves to the matched goal with the actual match confidence, so the minutes before the answer arrived are no longer lost. Confirming a suggested goal counts its context the same way.
- Keep an AI match across title changes in the same window, and across unchanged browser domains, while a refresh confirms or replaces it. A new window, a gap or missing browser metadata still starts over.
- Offer to add work that no goal claims. After three minutes of engaged, unmatched work, sumi proposes a goal with the measured time attached; accepting it moves the recorded intervals without counting them twice. This flow now runs together with the observation pass.
- Match lane-aware. Parking is automatic, so the matcher now sees each goal's lane state: whether it is the active goal, whether it is in Today, and how many days ago it was last worked on. It prefers current and recently active goals when more than one fits. When several goals tie on local keywords, the only one worked on in the last day continues instead of leaving the window ambiguous. A goal parked for two weeks or more leaves the matcher's candidate set unless the window matches its own words, and returns as soon as it is resumed or worked on.
- Continue goal attribution through quiet hours. Only Do not disturb, a paused companion or withdrawn consent stop it; suggestion cards stay quiet as before.
- Read the front page address from the browser window's document attribute on macOS before walking its toolbar, and skip tab strips during the walk, so wide tab bars no longer leave Safari or Chrome time without a domain.

Matching remains a judgment: an app name alone, a generic title without content or several equally plausible goals stay unassigned, and the observation pass applies the same 0.8 threshold as the matcher. New goals and steps still require acceptance. Automatic completion remains opt-in.

Available for Windows x64 and Apple Silicon macOS 14.5 or later.
