# Add to sumi (Chrome / Edge)

Use the current installed Windows x64 release of sumi. The extension is an optional explicit selected-text intake, not the background observation engine. The protocol retains the compatibility identifier `desktopbuddy://`.

1. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge).
2. Enable Developer mode, click Load unpacked, select this directory.
3. Select text on a page and right-click **Add as goal in Buddy**.
4. On the local bridge page, allow the browser to open Buddy or click **Open Buddy**.
5. Review/edit the draft in Today and click **Add as goal**.

The extension requests only `contextMenus`. It does not read page contents in the background, contact a server or invoke AI. Selected text is passed through the registered `desktopbuddy://goal` protocol and stored locally as a draft. Up to 4,000 selected characters can be reviewed; goal titles are limited to 500 characters.

Browsers can ask permission to launch a desktop app. The protocol is registered by sumi's installer, so an uninstalled development executable alone is insufficient for the extension. To test development intake without registration, pass a synthetic `desktopbuddy://goal?text=Example` URL as the executable's argument. Do not re-register a debug executable over the production installation.

Outside browsers, use Ctrl+Alt+G with selected text while sumi is running. Availability depends on the application's Windows accessibility support and whether another program has reserved the shortcut.

The current extension menu/bridge still display the legacy labels **Add as goal in Buddy** and **Open Buddy**. Those are the actual shipped strings in background.js/open.html, not a second application. This documentation audit does not change extension code or re-register the installed protocol.
