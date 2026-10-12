# Desktop Buddy 0.26.0

A simpler Progress screen, with minutes per step. Shared by Windows and macOS.

- **Overview:** period control (Day, Week, Month, Year), previous/next navigation, total focused time,
  a chart stacked by goal and one row per goal. Year groups the chart by month.
- **One goal:** click a goal to see only that goal: its total, its chart and its finished steps with the
  minutes spent on each. "Other work on this goal" keeps the total adding up.
- **Per-step time:** relevant activity is now recorded against the step being worked on (the chosen
  current step if still open, otherwise the first unfinished step) in `goal_relevant_step_daily`. It
  follows the same privacy retention as other activity history. Time recorded before this release
  cannot be split by step and appears as "Other work on this goal".
- **Calendar picker:** clicking the period label opens a small calendar like a date field: pick a day,
  any day of a week to choose that Monday–Sunday week, a month, or a year. Future periods are disabled.
  Month and year now cover the whole calendar month or year ending at the chosen date, so a finished
  month or year is shown complete. **Day** shows an hourly chart.
- Every screen uses one page column and title position (see docs/UI_LAYOUT.md), so headings and right
  edges line up and the layout adapts to the window width. Switches in Settings were redrawn.
- **Buddy chat can add goals and steps.** Ask in the side chat or the app chat ("add a goal to publish a
  website", "add steps to the desktop app goal") and Buddy works out sensible steps itself instead of
  asking for exact wording. A separate strictly structured request decides whether the message is an
  add request; the app applies it and replies with the exact result and the list of added steps, so
  Buddy can no longer claim a change that did not happen. Chat can also rename a goal, edit, delete, complete or reopen a step, complete or reopen a goal, and move a goal on or off Today. Deleting a goal asks for confirmation first ("Reply yes to confirm") and expires after ten minutes.
- Questions about Desktop Buddy itself are answered from built-in product facts, with no web search and
  no links to other products' guides.
- Warnings and notices share one style everywhere: a flat strip with an icon, a short sentence and the
  action on the right (for example "Tracking is blocked. Fix in Settings"). The Accessibility block uses it too.

No signing, update trust or permission changes. Windows install and restart were not verified from
this Mac; they run through the shared release workflow.
