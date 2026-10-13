# Desktop Buddy 0.27.5

- Focused time counts for the goal you selected again, including meetings, mail and other windows that name no goal. Since 0.27.0 only windows whose title matched the goal's keywords were counted, so Progress stayed empty while raw app time was still recorded.
- Activity whose window clearly belongs to another goal, or is ambiguous between several goals, still stays out of the selected goal's time; excluded apps, distractions and idle time are unchanged.

This patch release includes Windows x64 and Mac Apple Silicon (macOS 14.5+). The persistent internal macOS signing identity, Tauri updater verification and all trusted updater keys are unchanged. No database migrations or changes to goals, activity, memory or provider keys are included. Time not counted between 0.27.0 and 0.27.4 is not recovered.
