# Desktop Buddy 0.39.0

This update extends the overdue check-in implementation from 0.38.0. There is one deadline scheduler and one shared automatic prompt budget.

- Preserve Mark complete, Do today and Not now. Add Start now, Remind in 1 hour and Move deadline 1 day without conflating their actions.
- Include the first unfinished step and allow one soft automatic repeat per task and local day within existing companion cooldowns and the three-prompt daily budget.
- Honor explicitly requested snoozes beyond the automatic budget, with persisted timing and current quiet/attention controls.
- Allow local deadline reminders without AI or activity tracking, controlled independently from daily planning check-ins. Ignore stale tracking signals when tracking is off or unavailable.
- Add optional native Windows/macOS banners using Tauri's notification adapter. Keep the actionable card when OS banners are disabled.
- Retain the upstream goal/day/deadline/title/plan-revision/expiry checks and atomic goal mutations. Extend rollback to snooze persistence and the new actions.
- Accept existing release tags with or without the `v` prefix when comparing versions, while retaining duplicate-version and downgrade protection.

## Validation

Integration is based on main commit `1e9c908` (0.38.0). Existing published release notes and signing identities are unchanged.

Verified on 2026-10-20: all 36 targeted companion Rust tests passed; all 242 frontend tests across 45 files passed with one worker (ignored backup/history folders excluded); the TypeScript/Vite production build passed; all 18 release integrity checks passed; the full locked Rust suite passed 603 tests with two existing optional live/credential tests ignored. Rust formatting and Git whitespace checks passed. A fresh fetch confirmed that the integration base still matched origin/main.

The release workflow validates and builds Windows x64 and signed Apple Silicon macOS installers before publishing one complete release. Native system banners still require installed-app checks on both systems.
