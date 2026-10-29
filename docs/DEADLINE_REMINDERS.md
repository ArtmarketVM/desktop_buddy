# Deadline reminders

Current implementation: `src-tauri/src/companion/deadlines.rs`, the shared mascot queue, and `src/companion/InterventionCard.tsx`.

## What the user sees

Enable **Settings → General → Nudges → Remind me before, at, and after deadlines**. Open goals with a saved deadline can receive one factual character card for each current phase:

- **An upcoming deadline**: during the hour before the deadline.
- **Your deadline is here**: from the deadline until one hour later. If delivery is late, the text states the actual due time rather than claiming it is due now.
- **A deadline has passed**: at least one hour after the deadline, while still open.

Example: “Prepare the demo” was due at 15:00 and is still open. Are you on it, or do you need to reschedule?

The current card offers **I’m on it**, **Reschedule**, and **Chat**:

- **I’m on it** acknowledges the reminder. It does not complete the goal, change its deadline, add it to Today or start a timer.
- **Reschedule** opens the date/time editor. **Save deadline** persists a valid future date/time after a fresh backend check. Focus, steps and Today membership are unchanged.
- **Chat** opens the related conversation. Dismissal changes no goal state.

The earlier Mark complete / Do today / Start now / one-hour-snooze buttons are not the current deadline-card interface. Explicit goal actions remain available through the goal list and validated chat.

## Delivery, persistence and safety

Reminders require the app process to be running, but not a model inference or provider key. They use the character, not native macOS/Windows notification banners. The legacy `system_deadline_notifications` field is forced off.

The common mascot queue respects quiet mode/hours/days, pause/snooze, detected meeting/away/fullscreen states and an open floating chat. Legacy working-hour settings do not schedule mascot delivery. Deadlines do not use the former generic three-per-day cap or one-hour spacing. See [mascot message policy](MASCOT_NOTIFICATIONS.md) for priority and suppression.

Only the currently applicable phase is considered after a missed tick; old phases are not replayed in a burst. Phase delivery is recorded per goal/deadline and survives restart. Editing the deadline creates a new identity. Completed/deleted goals are excluded; candidates prefer due-now, then overdue, then upcoming, with current focus breaking ties.

Offers expire after five minutes. Before responding or presenting a retained card, Rust validates the exact goal, current phase/deadline, title, plan revision and expiry. A stale card cannot modify a changed goal. The queue and backend, not model wording, own the mutation.
