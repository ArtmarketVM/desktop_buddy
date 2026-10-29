import { video } from "./site-config.mjs?v=youtube-4Vu0HkIB1gY";
import { RELEASE_API, selectDownloads, youtubeEmbed } from "./releases.mjs";

const player = document.querySelector("#player");
const play = document.querySelector("#play-video");
const status = document.querySelector("#download-status");

try {
  const embed = youtubeEmbed(video.youtubeId);
  document.querySelector("#video-poster").src = video.poster;
  document.querySelector("#video-error a").href =
    `https://www.youtube.com/watch?v=${video.youtubeId}`;
  play.hidden = false;
  play.addEventListener(
    "click",
    () => {
      const iframe = document.createElement("iframe");
      iframe.src = embed;
      iframe.title = "Meet Sumi — Your AI Desktop Companion";
      iframe.allow =
        "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen";
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      player.replaceChildren(iframe);
    },
    { once: true },
  );
} catch {
  // The ordinary Watch on YouTube link stays usable if a future config is invalid.
  play.hidden = true;
}

// One unauthenticated metadata request. No tokens, analytics or user data storage.
// If GitHub is unavailable/rate-limited, both ordinary links still open Releases.
async function loadDownloads() {
  try {
    const response = await fetch(RELEASE_API, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(8000),
      credentials: "omit",
    });
    if (!response.ok) throw new Error("Release metadata unavailable");
    const downloads = selectDownloads(await response.json());
    document.querySelector("#download-windows").href = downloads.windows;
    document.querySelector("#download-macos").href = downloads.macos;
    document.querySelector("#release-version").textContent = downloads.version;
  } catch {
    status.hidden = false;
  }
}
loadDownloads();
