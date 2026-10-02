# Desktop Buddy 0.12.1 signing handoff

Version 0.12.1 fixes the desktop avatar hover background and cropped ears. The release is prepared as a GitHub draft; updater users will continue receiving 0.12.0 until the signed assets are uploaded and the draft is published.

## Sign the prepared installer on the key owner's computer

1. Update a clean source checkout to the prepared main commit and run `npm ci`.
2. Open the draft release in GitHub. Download `Desktop.Buddy_0.12.1_x64-setup.exe` into `.tools/release-0.12.1/assets/` inside the checkout. Verify its SHA-256 against `SHA256SUMS.txt` from the draft before signing.
3. Sign that exact file with the existing updater key. Do not generate a replacement key or upload the private key to GitHub.

For a key already protected by the project's Windows DPAPI helper, run from the project root in PowerShell:

```powershell
$installer = Join-Path (Get-Location) '.tools/release-0.12.1/assets/Desktop.Buddy_0.12.1_x64-setup.exe'
$protectedKey = Join-Path $env:USERPROFILE '.desktop-buddy/signing-key.dpapi'
Add-Type -AssemblyName System.Security
$keyBytes = [Security.Cryptography.ProtectedData]::Unprotect(
    [IO.File]::ReadAllBytes($protectedKey), $null,
    [Security.Cryptography.DataProtectionScope]::CurrentUser
)
try {
    $env:TAURI_SIGNING_PRIVATE_KEY = [Text.Encoding]::UTF8.GetString($keyBytes).Trim()
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
    npm run tauri -- signer sign --app-version 0.12.1 $installer
    if ($LASTEXITCODE -ne 0) { throw 'Installer signing failed.' }
} finally {
    [Array]::Clear($keyBytes, 0, $keyBytes.Length)
    Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
}
```

If the same existing key is held in a local file instead, use `npm run tauri -- signer sign --app-version 0.12.1 --private-key-path '<existing-key-path>' '<installer-path>'`. Supply the key's existing password if it has one. Keep the key file outside the repository and synchronized folders.

## Generate the updater manifest and publish

The asset directory must contain only this version's installer and its generated `.exe.sig`. From the updated checkout, run:

```powershell
node --input-type=module -e "import { createManifest } from './scripts/create-update-manifest.mjs'; import { readFileSync, writeFileSync } from 'node:fs'; const directory = '.tools/release-0.12.1/assets'; const notes = readFileSync('docs/RELEASE_0.12.1.md', 'utf8'); const manifest = createManifest({ directory, version: '0.12.1', tag: 'v0.12.1', notes }); writeFileSync(directory + '/latest.json', JSON.stringify(manifest, null, 2) + '\n');"
```

Upload `Desktop.Buddy_0.12.1_x64-setup.exe.sig` and `latest.json` to the existing draft. The prepared installer is already attached. Confirm the manifest installer URL uses the exact uploaded asset name, all three versioned update assets are present, and the release targets the prepared main commit. Publish the draft as the latest release, without replacing any older release's files.

Then verify the public `releases/latest/download/latest.json` endpoint reports 0.12.1 and the installer URL works. In an updater-enabled Buddy installation, choose **Updates → Check for updates → Update & restart** and confirm the installed workspace reports 0.12.1. The updater verifies the signature against the existing public key before installation.

## Validation on the preparation computer

- 52 frontend tests passed; TypeScript/Vite production build passed.
- Release-manifest test and eight isolated contact contract tests passed.
- Rust tests: 91 passed; one optional credential-vault test ignored.
- The avatar fix was visually checked in Edge for compact, hover, keyboard focus and expanded states. The avatar background remained transparent, and the compact avatar and Workspace button fit within the 140-pixel window.
- Signing and the installed update cycle remain pending on the key owner's computer.
