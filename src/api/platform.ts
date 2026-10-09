export function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
}

export function submitShortcut(): string {
  return isMac() ? "Cmd + Enter" : "Ctrl + Enter";
}
