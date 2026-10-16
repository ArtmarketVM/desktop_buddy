# Desktop Buddy 0.32.1

- Goal rows: the ⋯ button is the only control on the left (click for actions, hold to drag); its menu is down to Goal details, Remove from Today, Set aside for later and Delete. Steps get a hover × instead of a menu.
- Goal details is a compact editor (area, done-when, deadline, estimated time, description); title, steps and priority are edited in place.
- Each row shows its deadline (Today goals without one are due today) and the expected time; click it to change.
- Completed goals now live inside the day summary callout, which opens as a dropdown.
- Today is one plain list again: no "In focus" and "Later today" lanes, no focus bar, Focus now, Park or Checkpoint buttons. sumi works out what you are doing by itself.
- Every goal row has a priority tag (Urgent, High, Medium, Low or none) with number-key shortcuts; Today sorts by priority, then by your drag order. Urgent is a new level.
- Goal titles and steps are edited in place like a document: click the text, type, press Enter or click away to save, Escape to undo. Emptying the text deletes the goal or step.
- Fixed: a chat answer was discarded with "Your goal or sharing choices changed" when a goal was edited or the focus moved while sumi was still answering. Only real changes to sharing, privacy, tracking or provider settings discard an answer now.
- One field on Today now finds or adds a goal: typing filters your saved goals by title, description and steps, Enter adds the highlighted match to Today or creates a new goal, and an empty field shows your five most recent goals.
- Clicking the empty field lists every saved goal (unfinished ones first) in a scrollable dropdown, so there is no separate "Choose goals" button.
- The duplicated "Goals", "Choose goals for Today" and "Pick up where you left off" headings and the helper line are gone; unfinished goals from earlier days are marked in the suggestions and can be dismissed there.

This patch release includes Windows x64 and Mac Apple Silicon (macOS 14.5+). The persistent internal macOS signing identity, Tauri updater verification and all trusted updater keys are unchanged. No database migrations or changes to goals, activity, memory or provider keys are included.
