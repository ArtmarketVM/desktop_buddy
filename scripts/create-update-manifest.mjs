import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function createManifest({ directory, version, tag, notes = "", publishedAt = new Date().toISOString() }) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || tag !== `v${version}`) {
    throw new Error("The release tag must match the synchronized app version.");
  }
  const installers = readdirSync(directory).filter(name => name.endsWith("_x64-setup.exe"));
  if (installers.length !== 1 || !installers[0].endsWith(`_${version}_x64-setup.exe`)) {
    throw new Error("Expected exactly one x64 installer for this release version.");
  }
  const installer = installers[0];
  // GitHub normalizes spaces to periods when naming uploaded release assets.
  const assetName = installer.replaceAll(" ", ".");
  if (readFileSync(resolve(directory, installer)).length === 0) throw new Error("The installer is empty.");
  const signature = readFileSync(resolve(directory, `${installer}.sig`), "utf8").trim();
  const decoded = Buffer.from(signature, "base64").toString("utf8");
  if (!decoded.startsWith("untrusted comment:") || !decoded.includes("trusted comment:")) {
    throw new Error("The installer is missing a Tauri updater signature.");
  }
  return {
    version, notes, pub_date: publishedAt,
    platforms: { "windows-x86_64": {
      signature,
      url: `https://github.com/ArtmarketVM/desktop_buddy/releases/download/${tag}/${encodeURIComponent(assetName)}`,
    } },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, "..");
  const version = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
  const directory = resolve(root, "src-tauri/target/release/bundle/nsis");
  const manifest = createManifest({ directory, version, tag: process.argv[2],
    notes: "A refreshed Windows workspace with signed, on-demand app updates. See the GitHub release for details.",
  });
  writeFileSync(resolve(directory, "latest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Updater manifest created for ${version}.`);
}
