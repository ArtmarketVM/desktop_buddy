#!/usr/bin/env bash
# Isolated OS-vault integration test. Uses one synthetic item, never provider credentials.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/internal-macos-signing.sh
buddy_prepare_internal_signing
stage="$(mktemp -d "${TMPDIR:-/tmp}/buddy-credential-check.XXXXXX")"
helper="$PWD/src-tauri/native/credential-helper/BuddyCredentialAccess"
cleanup() {
  [[ ! -x "$stage/parent2" ]] || "$stage/parent2" "$helper" remove >/dev/null 2>&1 || true
  rm -rf "$stage"
  buddy_cleanup_internal_signing
}
trap cleanup EXIT
for build in 1 2; do
  xcrun clang -arch arm64 -mmacosx-version-min=14.5 -fobjc-arc -O2 -DBUILD="$build" -framework Foundation scripts/fixtures/credential-parent.m -o "$stage/parent$build"
  codesign --force --options runtime --timestamp=none --sign "$APPLE_SIGNING_IDENTITY" --keychain "$buddy_internal_keychain" --identifier com.artmarketvm.desktopbuddy "$stage/parent$build"
done
[[ "$(shasum -a 256 "$stage/parent1" | cut -d ' ' -f1)" != "$(shasum -a 256 "$stage/parent2" | cut -d ' ' -f1)" ]]
"$stage/parent1" "$helper" write
"$stage/parent1" "$helper" read
"$stage/parent2" "$helper" read
# A copied helper at an update's new location retains its exact identity too.
mkdir "$stage/updated"
cp "$helper" "$stage/updated/BuddyCredentialAccess"
"$stage/parent2" "$stage/updated/BuddyCredentialAccess" read
cp "$stage/parent2" "$stage/untrusted"
codesign --force --sign - --identifier com.artmarketvm.desktopbuddy "$stage/untrusted"
if "$stage/untrusted" "$helper" read; then echo 'Untrusted parent was admitted' >&2; exit 1; fi
if "$helper" </dev/null; then echo 'Direct invocation was admitted' >&2; exit 1; fi
"$stage/parent2" "$helper" remove
printf 'Credential bridge: cross-build/cross-path access passed; untrusted callers rejected.\n'
