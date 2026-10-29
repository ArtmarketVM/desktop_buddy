import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { assertNewerRelease } from "./verify-release.mjs";
import { checkPrivacySource } from "./check-privacy-source.mjs";

export function validateNotes(text, version) {
  text = text.replaceAll("\r\n", "\n");
  if (
    !text.startsWith(`# sumi ${version}\n`) ||
    text.replace(/^#[^\n]*\n/, "").trim().length < 20 ||
    /\b(?:TODO|TBD|PLACEHOLDER)\b/.test(text)
  )
    throw new Error(
      "Provide complete version-specific release notes before CI",
    );
}
export function prepare(root, version, notes) {
  const current = JSON.parse(
    readFileSync(resolve(root, "package.json")),
  ).version;
  assertNewerRelease(`v${version}`, `v${current}`);
  validateNotes(notes, version);
  const target = resolve(root, `docs/RELEASE_${version}.md`);
  if (existsSync(target))
    throw new Error(
      "Release notes already exist; review them instead of overwriting",
    );
  const updates = new Map();
  for (const name of [
    "package.json",
    "package-lock.json",
    "src-tauri/tauri.conf.json",
  ]) {
    const value = JSON.parse(readFileSync(resolve(root, name)));
    if (
      value.version !== current ||
      (name === "package-lock.json" &&
        value.packages?.[""]?.version !== current)
    )
      throw new Error(
        "Existing versions differ; reconcile before release preparation",
      );
    value.version = version;
    if (name === "package-lock.json") value.packages[""].version = version;
    updates.set(name, JSON.stringify(value, null, 2) + "\n");
  }
  const cargo = readFileSync(
    resolve(root, "src-tauri/Cargo.toml"),
    "utf8",
  ).replaceAll("\r\n", "\n");
  const lock = readFileSync(
    resolve(root, "src-tauri/Cargo.lock"),
    "utf8",
  ).replaceAll("\r\n", "\n");
  if (
    !cargo.includes(`version = "${current}"`) ||
    !lock.includes(`name = "desktop-buddy"\nversion = "${current}"`)
  )
    throw new Error(
      "Existing versions differ; reconcile before release preparation",
    );
  updates.set(
    "src-tauri/Cargo.toml",
    cargo.replace(`version = "${current}"`, `version = "${version}"`),
  );
  updates.set(
    "src-tauri/Cargo.lock",
    lock.replace(
      `name = "desktop-buddy"\nversion = "${current}"`,
      `name = "desktop-buddy"\nversion = "${version}"`,
    ),
  );
  for (const [path, text] of updates) writeFileSync(resolve(root, path), text);
  writeFileSync(target, notes);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [version, flag, source] = process.argv.slice(2);
  if (version === "--check") {
    checkPrivacySource();
    execFileSync(process.execPath, ["scripts/check-version.mjs"], {
      stdio: "inherit",
    });
    const current = JSON.parse(readFileSync("package.json")).version;
    validateNotes(readFileSync(`docs/RELEASE_${current}.md`, "utf8"), current);
    console.log("Synchronized release metadata and completed notes verified.");
  } else {
    if (flag !== "--notes-file" || !source)
      throw new Error(
        "Usage: npm run release:prepare -- VERSION --notes-file FILE",
      );
    prepare(process.cwd(), version, readFileSync(source, "utf8"));
    console.log(
      `Prepared ${version}; review all changes before committing and running CI.`,
    );
  }
}
