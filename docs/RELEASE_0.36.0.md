# Desktop Buddy 0.36.0

- **Help me start** opens a voluntary Tiny Habits session from an unfinished goal
  or the full chat's goal picker. The selected goal and optional step are explicit.
- Coaching controls cover readiness, barriers, a 10–60 second suggested action,
  ease, an optional anchor, commitment and a user-reported result. Sessions survive
  restart and support pause, resume and stop; ordinary chat stays available.
- Real AI suggestions respect existing AI, sharing and memory settings. Invalid
  responses have one bounded repair attempt; provider failure leaves the saved
  step available for manual retry. Changed goals, privacy or sessions invalidate
  in-flight proposals. Providers never submit user replies or confirm completion.
- Result memory requires an explicit choice and the existing memory permissions.
  Completing a micro-action does not complete its goal or checklist. Conversation
  clearing, scoped forgetting and retention include coaching records.

- An explicit `--check-coaching` diagnostic exercises a real provider proposal on
  a synthetic in-memory goal, followed by synthetic user answers. It does not open
  the installed app's database or report a real user's work as completed.

Windows x64 and Apple Silicon macOS 14.5+ share this version. Publication requires
both native test suites, signed updater artifacts and verification of all release
channels. The reviewed macOS app identity and trusted updater signers are
preserved. Internal macOS signing is not Apple Developer ID signing or notarization.

Automated checks do not establish live-model reliability or installation/restart
on every device. Source validation evidence and remaining manual checks are
recorded in `docs/COACHING_0.36.0_VALIDATION.md`.
