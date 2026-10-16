# Desktop Buddy 0.32.1

- Fixed: a chat answer was discarded with "Your goal or sharing choices changed" when a goal was edited or the focus moved while sumi was still answering. Only real changes to sharing, privacy, tracking or provider settings discard an answer now.
- One field on Today now finds or adds a goal: typing filters your saved goals by title, description and steps, Enter adds the highlighted match to Today or creates a new goal, and an empty field shows your five most recent goals.
- "Choose goals" opens a compact panel with search and pages of eight goals instead of the long inline list, so Today stays readable.
- The duplicated "Goals", "Choose goals for Today" and "Pick up where you left off" headings and the helper line are gone; unfinished goals from earlier days are marked in the suggestions and can be dismissed there.

This patch release includes Windows x64 and Mac Apple Silicon (macOS 14.5+). The persistent internal macOS signing identity, Tauri updater verification and all trusted updater keys are unchanged. No database migrations or changes to goals, activity, memory or provider keys are included.
