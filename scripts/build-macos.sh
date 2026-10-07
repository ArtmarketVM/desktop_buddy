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
  universal-apple-darwin|aarch64-apple-darwin|x86_64-apple-darwin) ;;
  *) echo "Choose universal-apple-darwin, aarch64-apple-darwin or x86_64-apple-darwin." >&2; exit 1 ;;
esac
command -v cargo >/dev/null || { echo "Install Rust using rustup first." >&2; exit 1; }
if [[ "$target" == universal-apple-darwin ]]; then
  rustup target add aarch64-apple-darwin x86_64-apple-darwin
else
  rustup target add "$target"
fi
npm run tauri -- build --config src-tauri/tauri.macos.conf.json --target "$target" -- --locked
version="$(node -p "JSON.parse(require('fs').readFileSync('package.json')).version")"
bundle="src-tauri/target/$target/release/bundle"
mkdir -p artifacts
name="Desktop.Buddy_${version}_${target%%-apple-darwin}"
ditto -c -k --sequesterRsrc --keepParent "$bundle/macos/Desktop Buddy.app" "artifacts/$name.zip"
for disk in "$bundle"/dmg/*.dmg; do
  [[ -f "$disk" ]] && cp "$disk" "artifacts/$name.dmg"
done
shasum -a 256 "artifacts/$name.zip" "artifacts/$name.dmg" > "artifacts/$name.sha256"
echo "Created artifacts/$name.zip and artifacts/$name.dmg (macOS 14.5+)."
