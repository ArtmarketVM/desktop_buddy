#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Darwin ]]; then
  echo "Build macOS bundles on a Mac with Xcode Command Line Tools." >&2
  exit 1
fi
# Use the optional checkout-local toolchain without changing the user's global PATH.
if [[ -x "$PWD/.tools/cargo/bin/cargo" ]]; then
  export CARGO_HOME="$PWD/.tools/cargo"
  export RUSTUP_HOME="$PWD/.tools/rustup"
  export PATH="$CARGO_HOME/bin:$PATH"
fi
export MACOSX_DEPLOYMENT_TARGET=14.5
target="${1:-aarch64-apple-darwin}"
case "$target" in
  aarch64-apple-darwin) ;;
  *) echo "macOS releases support Apple Silicon only (aarch64-apple-darwin)." >&2; exit 1 ;;
esac
command -v cargo >/dev/null || { echo "Install Rust using rustup first." >&2; exit 1; }
rustup target add "$target"
config=(--config src-tauri/tauri.macos.conf.json)
if [[ "${BUDDY_MACOS_UNSIGNED:-false}" == true ]]; then
  config+=(--config src-tauri/tauri.macos.ci.conf.json)
else
  if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" && -f "$PWD/.tools/signing/desktop-buddy-macos.key" ]]; then
    export TAURI_SIGNING_PRIVATE_KEY="$PWD/.tools/signing/desktop-buddy-macos.key"
  fi
  [[ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]] || { echo "Configure the macOS updater signing key before building a release." >&2; exit 1; }
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"
fi
# Optional Developer ID signing and notarization. Without APPLE_SIGNING_IDENTITY the
# app keeps its ad-hoc signature. Tauri notarizes when APPLE_ID, APPLE_PASSWORD and
# APPLE_TEAM_ID (or an App Store Connect API key) are also present.
identity_config=""
if [[ -n "${APPLE_SIGNING_IDENTITY:-}" && "${BUDDY_MACOS_UNSIGNED:-false}" != true ]]; then
  identity_config="$(mktemp "${TMPDIR:-/tmp}/buddy-identity.XXXXXX")"
  node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({bundle:{macOS:{signingIdentity:process.env.APPLE_SIGNING_IDENTITY}}}))' "$identity_config"
  config+=(--config "$identity_config")
fi
npm run tauri -- build "${config[@]}" --target "$target" --bundles app -- --locked
[[ -z "$identity_config" ]] || rm -f "$identity_config"
version="$(node -p "JSON.parse(require('fs').readFileSync('package.json')).version")"
bundle="src-tauri/target/$target/release/bundle"
if [[ -n "${APPLE_SIGNING_IDENTITY:-}" && "${BUDDY_MACOS_UNSIGNED:-false}" != true ]]; then
  # A Developer ID build must pass the checks Gatekeeper performs.
  app="$bundle/macos/Desktop Buddy.app"
  codesign --verify --deep --strict --verbose=2 "$app"
  spctl --assess --type execute --verbose=2 "$app"
  if [[ -n "${APPLE_ID:-}" || -n "${APPLE_API_KEY:-}" ]]; then xcrun stapler validate "$app"; fi
fi
mkdir -p artifacts
name="Desktop.Buddy_${version}_${target%%-apple-darwin}"
ditto -c -k --sequesterRsrc --keepParent "$bundle/macos/Desktop Buddy.app" "artifacts/$name.zip"
stage="$(mktemp -d "${TMPDIR:-/tmp}/buddy-dmg.XXXXXX")"
trap 'rm -rf "$stage"' EXIT
ditto "$bundle/macos/Desktop Buddy.app" "$stage/Desktop Buddy.app"
ln -s /Applications "$stage/Applications"
hdiutil create -volname "Desktop Buddy $version" -srcfolder "$stage" -format UDZO -ov "artifacts/$name.dmg" >/dev/null
if [[ "${BUDDY_MACOS_UNSIGNED:-false}" != true ]]; then
  cp "$bundle/macos/Desktop Buddy.app.tar.gz" "artifacts/$name.app.tar.gz"
  cp "$bundle/macos/Desktop Buddy.app.tar.gz.sig" "artifacts/$name.app.tar.gz.sig"
  node scripts/create-macos-update-manifest.mjs artifacts "v$version"
fi
shasum -a 256 "artifacts/$name.zip" "artifacts/$name.dmg" > "artifacts/$name.sha256"
echo "Created artifacts/$name.zip and artifacts/$name.dmg (macOS 14.5+)."
