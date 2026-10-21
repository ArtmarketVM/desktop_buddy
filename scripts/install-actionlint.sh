#!/usr/bin/env bash
set -euo pipefail
version=1.7.12
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) platform=linux_amd64; digest=8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8 ;;
  Darwin-arm64) platform=darwin_arm64; digest=aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f ;;
  *) echo 'Install the reviewed workflow validator on Linux x64 or Apple Silicon.' >&2; exit 1 ;;
esac
mkdir -p .tools/ci/bin
archive=".tools/ci/actionlint_${version}_${platform}.tar.gz"
curl --fail --silent --show-error --location --retry 2 --retry-delay 2 "https://github.com/rhysd/actionlint/releases/download/v${version}/actionlint_${version}_${platform}.tar.gz" -o "$archive"
if command -v sha256sum >/dev/null; then printf '%s  %s\n' "$digest" "$archive" | sha256sum --check -; else printf '%s  %s\n' "$digest" "$archive" | shasum -a 256 -c -; fi
tar -xzf "$archive" -C .tools/ci/bin actionlint
