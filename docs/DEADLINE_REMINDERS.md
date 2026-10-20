# Overdue goal check-ins

The desktop character can offer a short, factual check-in for an unfinished goal whose deadline has passed:

> “Prepare the demo” is past its deadline. Finished, or do it today?

- **Mark complete** is an explicit user confirmation. It completes the selected goal and its steps through the existing goal mutation, with manual completion attribution.
- **Do today** adds the selected goal to Today and moves its deadline to **23:59:59 today in the computer's local time zone**. Both changes are saved together. It preserves unfinished steps and the user's current focus.
- **Not now** dismisses the check-in without changing the goal, its deadline, or its schedule.

Open goals remain eligible even when a new day removes them from Today's selection. Completed, deferred, and deleted goals are excluded. Current focus takes priority, then the oldest overdue deadline.

Check-ins reuse the existing companion daily-check-in setting, startup delay, daily budget (three ordinary prompts), cooldown, quiet hours, working hours, DND, snooze, meeting/media/idle/fullscreen suppression, and privacy exclusions. They wait while the companion chat is open or activity tracking is paused/unavailable. No provider key, AI inference, or screen-text collection is needed for this local deadline check.

The existing persisted companion reminder history prevents a repeated offer for the same goal, deadline, and local day, including after restart. An unfinished overdue goal may be offered again on a later day within the normal notification budget. A changed deadline is a new reminder identity. Background scans run at most once every 30 seconds when eligible; the configured startup delay and attention gates can postpone delivery.

Before either mutation, Rust rechecks the goal's identity, open state, deadline, title, plan revision, local day, and the two-minute lifetime of the offer. An obsolete offer cannot modify a changed goal. Moving a goal to Today does not select it as the current focus.

No database migration or new memory table is required.
