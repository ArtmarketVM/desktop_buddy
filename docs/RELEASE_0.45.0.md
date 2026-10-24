# Desktop Buddy 0.45.0

## Fix false goal attribution and preserve verified task time

- Stop assigning a goal on one shared word. A single word such as a company name, and any word taken from a page's domain, no longer assigns time or selects a lane: every Google property used to count toward an interview at Google and, worse, blocked the AI matcher. Two shared words and explicit user Work rules still assign locally. A single shared word is passed to the matcher as a hint to check, never as evidence.
- Require clearer evidence for goals outside Today. A goal in today's plan is assigned at confidence 0.8; a goal outside it needs 0.85, and an answer between those is offered as a suggestion instead. The observation pass follows the same rule.
- Count the earlier stages of one task. When the matcher confirms a goal, it names which recent windows were stages of the same task, for example searching, choosing seats and paying for one purchase, and the pending time of those stages moves to the goal. Only unassigned time moves, only within the 20-minute trail, and the matcher must name each stage explicitly.
- Correct an automatic assignment the AI now contradicts. When a refresh names a different goal with confidence 0.9 or higher, the intervals an automatic match had given the previous goal move to the right one atomically, without counting them twice. One correction per visit to a window; a later answer never flips it back. Explicit focus and manual decisions never move.

Verified by tests: a discount search and Google Maps no longer count toward an interview at Google; choosing seats counts in a confirmed purchase; switching to unrelated activity stops accrual; a correction moves time without duplicating it; an index outside the trail is rejected.

Historical time recorded before this release is not re-attributed.

Available for Windows x64 and Apple Silicon macOS 14.5 or later.
