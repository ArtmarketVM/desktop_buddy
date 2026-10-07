export const isMac =
  typeof navigator !== "undefined" &&
  /Macintosh|MacIntel|Mac OS X/.test(navigator.userAgent);
export const systemName = isMac ? "macOS" : "Windows";
export const credentialStore = isMac
  ? "macOS Keychain"
  : "Windows Credential Manager";
export const selectionShortcut = isMac
  ? "Command + Option + B"
  : "Ctrl + Alt + B";
