# Developer handoff — 0.12.0

This release includes the workspace changes developed after 0.10.0. Source is on `main`; Windows distribution uses the signed **v0.12.0** GitHub release. The [Russian handoff](DEVELOPER_HANDOFF_RU.txt) opens in Word or Notepad.

## What changed since 0.10.0

- **Onboarding:** three fixed colors (Red, Yellow, Blue); nine illustrated role cards with continuous scrolling, arrows and wheel/touchpad support. **Other** requires a custom role; any role may declare up to 20 apps. Old profiles remain readable.
- **Focus:** a simpler checklist with automatic saves; advanced planning actions are collapsed. Activity time uses minutes/hours and does not represent goal completion. Resources is now **Discover**.
- **Companion:** stays visible with tracking paused and when the workspace closes. A **Show on desktop** switch controls desktop visibility while preserving the workspace illustration. No body bouncing/swaying; blinking remains. Tray show/hide controls added.
- **Settings/profile:** persistent Light/Dark themes and native icons; installed Windows app inventory with editable per-goal categories; separate profile menu and local sign-out/reset that preserves goals, history and provider credentials. Key entry is under advanced connection settings.
- **Contact:** Share an idea starts expanded. With no server, it opens a draft to `artmarket.vm@gmail.com`. The Supabase template supports private feedback, confirmed email subscriptions and separately consented/confirmed email + role + declared apps research. **Nothing is deployed or uploaded automatically.** Research is not marketing consent and has a separate removal action. Declared apps are not tracking rules or an uploaded inventory.

Character prompts: [BUDDY_ART_PROMPTS.md](BUDDY_ART_PROMPTS.md). Server setup: [CONTACT_SERVICE.md](CONTACT_SERVICE.md). Verification: [VALIDATION.md](VALIDATION.md). Hackathon product ideas are proposals, not implemented features.

## Update and run on Windows

First preserve your own edits on a feature branch, then run from your existing checkout:

```powershell
git status
git switch main
git pull --ff-only origin main
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# Fill your own runtime provider keys in .env.
./scripts/dev.ps1
```

Install Node.js 22+, Rust stable/MSVC, Visual Studio C++ Build Tools with Windows SDK, and WebView2. `.tools` and `.env` are local and are not shared through Git. `npm run dev` is a UI-only preview; use Tauri for tracking and desktop controls. Checks: `./scripts/dev.ps1 -Task test`.

Latest validation: 44 frontend tests, 91 Rust tests and eight isolated contact contract tests passed. See [VALIDATION.md](VALIDATION.md) for build and native checks. The updater signing key stays on the owner's PC. Use your own provider credentials; never commit keys. A Git push alone does not trigger the installed app's update badge: it needs a newer published signed release.

## Update the installed app

In an updater-enabled installation (0.10.0 or later), open **Updates → Check for updates → Update & restart**. Alternatively download the x64 setup executable from [v0.12.0](https://github.com/ArtmarketVM/desktop_buddy/releases/tag/v0.12.0), quit Buddy from its tray menu, and run the installer over the existing installation. Keep the existing installation directory. Local data and Windows Credential Manager entries are retained. Pulling Git changes does not update an already installed executable.

No signing secret is uploaded to GitHub. Another developer can run development builds with their own provider credentials; distributing an official signed installer requires the owner or an authorized signing workflow.
