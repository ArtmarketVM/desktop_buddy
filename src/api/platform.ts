export const isMac =
  typeof navigator !== "undefined" &&
  /Macintosh|MacIntel|Mac OS X/.test(navigator.userAgent);
export const credentialStore = isMac
  ? "macOS Keychain"
  : "Windows Credential Manager";
export const selectionShortcut = isMac
  ? "Command + Option + B"
  : "Ctrl + Alt + B";
