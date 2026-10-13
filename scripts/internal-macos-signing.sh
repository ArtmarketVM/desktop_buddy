#!/usr/bin/env bash
# Source from build-macos.sh. The certificate is an internal identity, not an Apple Developer ID.
buddy_prepare_internal_signing() {
  local buddy_p12_path="${BUDDY_MACOS_P12_PATH:-$PWD/.tools/signing/internal-macos/identity.p12}"
  local buddy_keychain_password buddy_actual_fingerprint buddy_identity
  buddy_internal_directory="$(mktemp -d "${TMPDIR:-/tmp}/buddy-code-signing.XXXXXX")"
  chmod 700 "$buddy_internal_directory"
  buddy_internal_keychain="$buddy_internal_directory/signing.keychain-db"
  if [[ -n "${BUDDY_MACOS_P12_BASE64:-}" ]]; then
    [[ -n "${BUDDY_MACOS_P12_PASSWORD:-}" ]] || { echo 'Configure the internal signing certificate password.' >&2; return 1; }
    buddy_p12_path="$buddy_internal_directory/identity.p12"
    printf '%s' "$BUDDY_MACOS_P12_BASE64" | /usr/bin/base64 -D > "$buddy_p12_path"
    chmod 600 "$buddy_p12_path"
  else
    [[ -f "$buddy_p12_path" ]] || { echo 'Configure the existing internal macOS signing identity; do not generate a new certificate for each build.' >&2; return 1; }
    if [[ -z "${BUDDY_MACOS_P12_PASSWORD:-}" && -f "$PWD/.tools/signing/internal-macos/p12-password.txt" ]]; then
      BUDDY_MACOS_P12_PASSWORD="$(cat "$PWD/.tools/signing/internal-macos/p12-password.txt")"
    fi
    [[ -n "${BUDDY_MACOS_P12_PASSWORD:-}" ]] || { echo 'Configure the internal signing certificate password.' >&2; return 1; }
  fi
  export BUDDY_MACOS_P12_PASSWORD
  # Extract public data only, then pin the exact certificate before importing any private key.
  openssl pkcs12 -in "$buddy_p12_path" -passin env:BUDDY_MACOS_P12_PASSWORD -clcerts -nokeys -out "$buddy_internal_directory/certificate.pem"
  buddy_actual_fingerprint="$(openssl x509 -in "$buddy_internal_directory/certificate.pem" -noout -fingerprint -sha256 | sed 's/.*=//;s/://g' | tr '[:upper:]' '[:lower:]')"
  buddy_identity="$(node -p 'JSON.parse(require("fs").readFileSync("src-tauri/macos-code-signing.json")).certificateSha1')"
  [[ "$buddy_actual_fingerprint" == "$(node -p 'JSON.parse(require("fs").readFileSync("src-tauri/macos-code-signing.json")).certificateSha256')" ]] || { echo 'The internal certificate does not match the reviewed signing identity.' >&2; return 1; }
  buddy_keychain_password="$(openssl rand -base64 48 | tr -d '\n')"
  if [[ "${GITHUB_ACTIONS:-false}" == true ]]; then
    printf '::add-mask::%s\n' "$buddy_keychain_password"
  fi
  security create-keychain -p "$buddy_keychain_password" "$buddy_internal_keychain"
  security unlock-keychain -p "$buddy_keychain_password" "$buddy_internal_keychain"
  security set-keychain-settings -lut 21600 "$buddy_internal_keychain"
  security import "$buddy_p12_path" -k "$buddy_internal_keychain" -P "$BUDDY_MACOS_P12_PASSWORD" -T /usr/bin/codesign >/dev/null
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$buddy_keychain_password" "$buddy_internal_keychain" >/dev/null
  # Tauri's generic identity path uses the user search list. No certificate trust is added.
  node --input-type=module - "$buddy_internal_keychain" <<'JS'
import { execFileSync } from 'node:child_process';
const list = execFileSync('/usr/bin/security', ['list-keychains', '-d', 'user'], { encoding: 'utf8' });
const paths = [...list.matchAll(/"([^"]+)"/g)].map(match => match[1]);
execFileSync('/usr/bin/security', ['list-keychains', '-d', 'user', '-s', ...paths, process.argv[2]]);
JS
  export APPLE_SIGNING_IDENTITY="$buddy_identity"
  unset BUDDY_MACOS_P12_PASSWORD BUDDY_MACOS_P12_BASE64
}

buddy_cleanup_internal_signing() {
  if [[ -n "${buddy_internal_keychain:-}" && -f "$buddy_internal_keychain" ]]; then
    security delete-keychain "$buddy_internal_keychain" >/dev/null 2>&1 || true
  fi
  if [[ -n "${buddy_internal_directory:-}" && -d "$buddy_internal_directory" ]]; then
    rm -rf "$buddy_internal_directory"
  fi
}
