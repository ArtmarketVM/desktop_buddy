#!/usr/bin/env bash
set -euo pipefail
app="$1"
rehearsal="$(mktemp -d "${TMPDIR:-/tmp}/sumi-branding.XXXXXX")"
trap 'rm -rf "$rehearsal"' EXIT
legacy="$rehearsal/Desktop Buddy.app"
report="$rehearsal/report.json"
ditto "$app" "$legacy"
"$legacy/Contents/MacOS/sumi" --check-branding-migration "--branding-report=$report"
for attempt in $(seq 1 100); do
  [[ ! -f "$report" ]] || break
  sleep 0.2
done
node --input-type=module - "$report" <<'JS'
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const report=JSON.parse(readFileSync(process.argv[2],'utf8'));
assert.equal(report.bundle_name,'sumi.app');
assert.equal(report.executable_name,'sumi');
assert.equal(report.user_state_opened,false);
JS
[[ ! -e "$legacy" && -d "$rehearsal/sumi.app" ]]
node scripts/macos-code-signing.mjs "$rehearsal/sumi.app"
# Existing destinations are never replaced, even an empty directory.
rm -rf "$rehearsal/sumi.app"
mkdir "$rehearsal/sumi.app"
printf 'preserve' > "$rehearsal/sumi.app/sentinel"
ditto "$app" "$legacy"
"$legacy/Contents/MacOS/sumi" --check-branding-migration "--branding-report=$report"
node --input-type=module - "$report" <<'JS'
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
assert.equal(JSON.parse(readFileSync(process.argv[2],'utf8')).bundle_name,'Desktop Buddy.app');
JS
[[ -d "$legacy" && "$(cat "$rehearsal/sumi.app/sentinel")" == preserve ]]
echo 'Verified signed legacy-to-sumi macOS relaunch, untouched user state and existing-destination protection.'
