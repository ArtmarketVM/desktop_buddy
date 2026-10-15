#!/usr/bin/env bash
# Explicit maintenance operation, never invoked by normal app/release builds.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/internal-macos-signing.sh
buddy_prepare_internal_signing
trap buddy_cleanup_internal_signing EXIT
path=src-tauri/native/credential-helper/BuddyCredentialAccess
xcrun clang -arch arm64 -mmacosx-version-min=14.5 -fobjc-arc -O2 -Wall -Wextra -Wno-deprecated-declarations -framework Foundation -framework Security src-tauri/native/credential-helper/main.m -o "$path"
codesign --force --options runtime --timestamp=none --sign "$APPLE_SIGNING_IDENTITY" --keychain "$buddy_internal_keychain" --identifier com.artmarketvm.desktopbuddy.credentials "$path"
node --input-type=module <<'JS'
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='src-tauri/native/credential-helper/';
const hash=p=>createHash('sha256').update(readFileSync(root+p)).digest('hex');
writeFileSync(root+'manifest.json',JSON.stringify({protocol:1,binarySha256:hash('BuddyCredentialAccess'),sourceSha256:hash('main.m')},null,2)+'\n');
JS
