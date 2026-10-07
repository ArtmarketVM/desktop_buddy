import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateTrust, verifyArtifact } from "./signing-trust.mjs";

export function createMacManifest({ directory, version, tag, trust }) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || tag !== `v${version}`)
    throw new Error("Release tag must match the app version.");
  validateTrust(trust);
  const name = `Desktop.Buddy_${version}_aarch64.app.tar.gz`;
  if (!readdirSync(directory).includes(name))
    throw new Error("Missing Apple Silicon updater archive.");
  const bytes = readFileSync(resolve(directory, name));
  if (!bytes.length) throw new Error("The updater archive is empty.");
  const signature = readFileSync(
    resolve(directory, `${name}.sig`),
    "utf8",
  ).trim();
  verifyArtifact(bytes, signature, trust, version);
  return {
    version,
    notes:
      "Goal tracking and completion checks, with signed in-app macOS updates.",
    pub_date: new Date().toISOString(),
    platforms: {
      "darwin-aarch64": {
        signature,
        url: `https://github.com/ArtmarketVM/desktop_buddy/releases/download/${tag}/${name}`,
      },
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const root = resolve(import.meta.dirname, "..");
  const directory = resolve(process.argv[2] ?? "artifacts");
  const version = JSON.parse(
    readFileSync(resolve(root, "package.json")),
  ).version;
  const trust = JSON.parse(
    readFileSync(resolve(root, "src-tauri/trusted-signers.macos.json")),
  );
  const manifest = createMacManifest({
    directory,
    version,
    tag: process.argv[3],
    trust,
  });
  writeFileSync(
    resolve(directory, `updates-macos-epoch-${trust.epoch}.json`),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(`Verified macOS updater manifest for ${version}.`);
}
