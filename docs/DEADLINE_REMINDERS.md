# Overdue goal check-ins

The desktop character can offer a short, factual check-in for an unfinished goal whose deadline has passed:

> “Prepare the demo” is past its deadline. Finished, or do it today?

- **Mark complete** is an explicit user confirmation. It completes the selected goal and its steps through the existing goal mutation, with manual completion attribution.
- **Do today** adds the selected goal to Today and moves its deadline to **23:59:59 today in the computer's local time zone**. Both changes are saved together. It preserves unfinished steps and the user's current focus.
- **Not now** dismisses the check-in without changing the goal, its deadline, or its schedule.
- **Start now** adds the task to Today, selects it as the focus and starts its timer. It leaves completion and the deadline unchanged.
- **Remind in 1 hour** saves a task-specific request across restarts. This explicit request is honored after the automatic budget is spent; quiet hours and attention suppression still apply.
- **Move deadline 1 day** puts the deadline 24 hours after the current time without changing focus, steps or completion.

When available, the first unfinished step is included as a small starting point. Imported titles and step text are bounded to keep the card readable.

Open goals remain eligible even when a new day removes them from Today's selection. Completed, deferred, and deleted goals are excluded. Current focus takes priority, then the oldest overdue deadline.

Check-ins have their own **Remind me about overdue tasks** switch in Settings > General > Nudges. They work while sumi is running, including when AI or activity tracking is off. Automatic offers share the existing companion budget of three ordinary prompts per local day, the configured startup delay and cooldown (at least one hour). Quiet hours, working hours, DND, companion pause/snooze, native meeting/away/fullscreen signals, and fresh tracking signals for media, sensitive windows and privacy exclusions remain authoritative. New offers wait while the companion chat is open.

The existing persisted companion history allows at most one soft automatic repeat for the same task and deadline per local day, after at least one hour and within the shared cooldown/budget. Explicit snoozes use a small separate setting and do not consume another automatic prompt. Both survive restarts. Changed deadlines and later local days have new reminder identities. Background scans run at most once every 30 seconds when eligible.

The optional **Show deadline reminders in system notifications** switch enables native Windows/macOS banners through Tauri's notification adapter. The actionable sumi card remains available if the OS disables banners. No reminders run after quitting the app; closing the workspace keeps the tray/menu-bar process running. Native banner delivery needs verification on installed apps on both systems.

Before either mutation, Rust rechecks the goal's identity, open state, deadline, title, plan revision, local day, and the two-minute lifetime of the offer. An obsolete offer cannot modify a changed goal. Moving a goal to Today does not select it as the current focus.

All deadline actions, including snooze persistence, commit together or roll back together. No database migration or new memory table is required. The original Mark complete and Do today behavior is preserved.
