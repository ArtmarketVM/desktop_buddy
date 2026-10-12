export function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem("buddy-sidebar-collapsed") === "true";
  } catch {
    return false;
  }
}

export function isSidebarShortcut(
  event: Pick<
    KeyboardEvent,
    | "key"
    | "code"
    | "metaKey"
    | "ctrlKey"
    | "altKey"
    | "shiftKey"
    | "repeat"
    | "isComposing"
  >,
  mac: boolean,
): boolean {
  return (
    (event.key === "\\" || event.code === "Backslash") &&
    (mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    !event.repeat &&
    !event.isComposing
  );
}
