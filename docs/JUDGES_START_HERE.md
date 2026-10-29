# Install and test sumi

sumi is a desktop application. **You do not need to build the source code, install developer tools, register an account or enter API keys.** Download the appropriate installer, complete onboarding and keep **Built-in AI** selected.

## 1. Download a ready-made installer

Reference submission release: [sumi 0.49.4](https://github.com/ArtmarketVM/desktop_buddy/releases/tag/v0.49.4).

| Your computer | Download | Supported system |
| --- | --- | --- |
| Mac with Apple Silicon (M1 or newer) | [sumi_0.49.4_aarch64.dmg](https://github.com/ArtmarketVM/desktop_buddy/releases/download/v0.49.4/sumi_0.49.4_aarch64.dmg) | macOS 14.5 or later |
| Windows PC, x64 | [sumi_0.49.4_x64-setup.exe](https://github.com/ArtmarketVM/desktop_buddy/releases/download/v0.49.4/sumi_0.49.4_x64-setup.exe) | Windows 10 or 11 |

[Latest release](https://github.com/ArtmarketVM/desktop_buddy/releases/latest) lists subsequent updates. Use the `.dmg` or `-setup.exe` asset; the automatically generated **Source code** archives are for developers. Intel Macs, Linux and a browser-only application are not supported by these packages. Internet access is needed for AI features.

### macOS

1. Open the downloaded DMG, then drag **sumi.app** to **Applications**.
2. Open sumi from Applications.
3. This hackathon build uses the project's internal signing identity. It is not Apple Developer ID signed or notarized, so macOS may block the initial launch. If you trust the package downloaded from the linked project release, follow [Apple's app-specific approval instructions](https://support.apple.com/en-gb/102445) in **System Settings → Privacy & Security → Open Anyway**. Complete any password or Touch ID prompt yourself. Keep system-wide security protections enabled.
4. Grant the observation permissions you want to use during onboarding. Accessibility supports interface-text observation; screen recording permission is needed for screenshots. Voice additionally needs microphone and speech permission. After a permission change, restart sumi if macOS requests it.

A managed Mac can prohibit app-specific approval. In that case, use a permitted test machine or ask its administrator; changing the app's updater trust does not resolve an operating-system policy.

### Windows

1. Run the downloaded `sumi_0.49.4_x64-setup.exe` and complete installation.
2. Open **sumi** from the Start menu or its shortcut.
3. Windows may show an unknown-publisher or reputation notice. Updater signatures are independent of Windows Authenticode/reputation certification. Review the source and your organization's installation policy; do not disable Defender or SmartScreen. A managed device may need administrator approval.
4. If prompted, install the Microsoft WebView2 runtime from Microsoft's official source. Voice recognition depends on Windows microphone permission and an installed supported recognition language.

## 2. Start with Built-in AI

1. Complete onboarding. Select the observation options you want; manual goal and chat use remain available without screen observation.
2. In **Settings → AI → Services → AI connection**, keep **Built-in AI** selected. This is the default. No invitations, access codes or personal provider keys are needed.
3. The sidebar indicators refer to the selected connection. Allow their checks to finish. A successful connection check verifies access; a successful chat or research response verifies the corresponding operation.
4. **Use my API keys** remains available in the same settings row for people who prefer their own Nebius and Tavily accounts. Switching modes preserves existing saved keys.

Built-in AI uses a Supabase gateway. Nebius and Tavily keys remain on the server and are not embedded in the installer or public source. Provider/network availability and uniform anti-abuse limits apply.

## 3. A short testing path

- Create a disposable goal such as **Prepare the launch checklist** and add two steps.
- Ask the chat to inspect the goal, add a specific step and make it the current focus. Review the execution receipt.
- Park the goal, switch to another goal, then Resume. Check that the previous checkpoint and next step are available.
- Request research, for example: **Find the official Nebius Token Factory documentation for this goal.** Complete any search-confirmation step and open the attached sources.
- For observation, use a visible fictional email or result receipt whose request/outcome clearly matches a test goal. Keep that window foreground. New tasks require acceptance; uncertain completion requires confirmation. Automatic completion additionally depends on the saved permission and independently verified current evidence. A window title or elapsed time alone does not prove a result.
- Open **My progress** to inspect recorded activity and confirmed work. Restart the app and check that saved goals and conversation/context remain available.

Quiet Mode, quiet/working hours, excluded or private windows, inactivity, a locked session and other context gates can suppress observation or prompts. The companion remaining visible is not proof that observation is running.

## 4. If a check does not work

- Open **Settings → About → Diagnostics → Personal AI Engine**. Inspect runtime status, interface-text capability, screenshot status/detail and the most recent failure.
- Check that the selected connection is **Built-in AI**, internet access is available, and observation permissions/settings are enabled for the scenario being tested.
- Report the app version, operating system, operation and sanitized error category. Do not include API keys, private emails, full screen contents or raw credential/session files.
- The [demo runbook](HACKATHON_DEMO_RUNBOOK.md) separates mock tests, real-provider backend checks and a manual native demonstration. The public presentation images use fictional data; they are not live test receipts.

The app checks GitHub Releases for updates at startup. The repository contains the source and build instructions for reproducibility; installing the ready-made release is the intended judging path.
