// Apply transparent-window styling before React, theme CSS or the first visible frame.
if (new URLSearchParams(location.search).has("buddy")) {
  document.documentElement.classList.add("buddy-window");
  document.documentElement.dataset.theme =
    localStorage.getItem("buddy-theme") === "dark" ? "dark" : "light";
}
