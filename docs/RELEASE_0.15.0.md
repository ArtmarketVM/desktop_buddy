# Desktop Buddy 0.15.0 for Windows

This update combines the daily workspace from commit `abc7dfc` with the desktop companion from `d237c27`.

- Plan Today with one to three goals, organize parallel goals into areas, edit steps and review day/week progress.
- Run a manual focus timer without enabling screen tracking. Keep unfinished work for another day and see a positive daily summary.
- Import reviewed text, images and PDFs. Voice import uses local Windows speech recognition; AI proposals require explicit sharing and confirmation before saving.
- Click the desktop character for mini chat, quick tasks, AI help or Windows voice typing. The tray controls visibility, tracking, Settings and Quit.
- Keep automatic task/completion detection optional. All proposed changes require confirmation; quiet hours, meetings/full-screen suppression and cooldowns remain in place.
- Both editors share goal IDs, plan revisions and completion history. Existing local profiles, goals and provider credentials are retained through additive storage migration.

## Windows installation and updates

Download `Desktop.Buddy_0.15.0_x64-setup.exe` from this release, or choose **Updates → Update & restart** in Buddy. Use Windows 10/11 with Microsoft Edge WebView2.

Installations with the team updater receive 0.15.0 through `updates-epoch-1.json`. Older installations receive the pinned signed 0.13.0 compatibility bridge through `latest.json`, then check again for 0.15.0. Existing published installers are not replaced. The release is signed with the owner's existing trusted local key; no private key is uploaded or required by users downloading the app.

## Validation and limits

See [VALIDATION.md](VALIDATION.md), [CORE_EXPERIENCE.md](CORE_EXPERIENCE.md) and [COMPANION_MVP.md](COMPANION_MVP.md) in the source. Production provider content is not used for automated checks. Microphone recognition, provider/model quality and selected-text support across all Windows applications still require manual verification. Image imports need a configured vision-capable Nebius model. Automatic visible-text detection starts off; goals and manual timers work without it.

Developers: pull `main`, run `npm ci` with Node.js 22.13+ or 24+, and use the documented Windows build commands. Provider keys remain runtime-only. The installer and its updater signature are accompanied by verified update manifests and `SHA256SUMS.txt`.
