import { readFileSync } from "node:fs";
const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const version = JSON.parse(read("package.json")).version;
const lock = JSON.parse(read("package-lock.json"));
const cargo = read("src-tauri/Cargo.toml").match(/^version = "([^"]+)"/m)?.[1];
const cargoLock = read("src-tauri/Cargo.lock").match(
  /name = "desktop-buddy"\r?\nversion = "([^"]+)"/,
)?.[1];
const tauri = JSON.parse(read("src-tauri/tauri.conf.json")).version;
if (
  [lock.version, lock.packages[""].version, cargo, cargoLock, tauri].some(
    (v) => v !== version,
  )
) {
  throw new Error(
    "Release versions differ. Update package.json, package-lock.json, Cargo.toml, Cargo.lock and tauri.conf.json together.",
  );
}
console.log(`Release version: ${version}`);
