import { goalLink } from "./link.mjs";
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "buddy-goal",
    title: "Add as goal in Buddy",
    contexts: ["selection"],
  });
});
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== "buddy-goal") return;
  try {
    // A local bridge page launches the OS protocol; it sends nothing to a server.
    chrome.tabs.create({
      url: `${chrome.runtime.getURL("open.html")}?link=${encodeURIComponent(goalLink(info.selectionText))}`,
    });
  } catch {
    chrome.tabs.create({ url: chrome.runtime.getURL("open.html") });
  }
});
