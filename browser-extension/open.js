import { goalLink } from "./link.mjs";
try {
  const value = new URLSearchParams(location.search).get("link");
  const url = new URL(value);
  const canonical = goalLink(url.searchParams.get("text"));
  if (url.href !== canonical) throw new Error("Invalid link");
  const link = document.querySelector("#launch");
  link.href = canonical;
  link.hidden = false;
  document.querySelector("#message").textContent =
    "Open Buddy to review your selected text as a draft goal.";
  link.click();
} catch {
  /* Invalid input never launches an external protocol. */
}
