param([switch]$Demo, [switch]$MockAI, [ValidateSet('dev', 'build', 'test')][string]$Task = 'dev')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vswhere) {
    $vsPath = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($vsPath) {
        & "$vsPath\Common7\Tools\Launch-VsDevShell.ps1" -Arch amd64 -HostArch amd64 -SkipAutomaticLocation
    }
}
if (Test-Path "$projectRoot\.tools\cargo\bin\cargo.exe") {
    $env:CARGO_HOME = "$projectRoot\.tools\cargo"
    $env:RUSTUP_HOME = "$projectRoot\.tools\rustup"
    $env:PATH = "$env:CARGO_HOME\bin;$env:PATH"
}
if ($Demo) { $env:DEMO_MODE = 'true' }
if ($MockAI) { $env:AI_MOCK = 'true' }
switch ($Task) {
    'dev' { npm run tauri dev }
    'build' {
        if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
            $protectedPath = Join-Path $env:USERPROFILE '.desktop-buddy/signing-key.dpapi'
            $signingPath = Join-Path $projectRoot '.tools/updater.key'
            if (Test-Path -LiteralPath $protectedPath) {
                Add-Type -AssemblyName System.Security
                $keyBytes = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($protectedPath), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
                try { $env:TAURI_SIGNING_PRIVATE_KEY = [Text.Encoding]::UTF8.GetString($keyBytes).Trim() }
                finally { [Array]::Clear($keyBytes, 0, $keyBytes.Length) }
            } elseif (Test-Path -LiteralPath $signingPath) {
                $env:TAURI_SIGNING_PRIVATE_KEY = $signingPath
            } else {
                throw 'A signed installer requires a protected local signing key or TAURI_SIGNING_PRIVATE_KEY. See UPDATES.md.'
            }
            $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
            try { npm run tauri -- build --ci -- --locked }
            finally { Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue }
        } else {
            npm run tauri -- build --ci -- --locked
        }
    }
    'test' {
        npm test
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        npm run build
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        npm run test:release
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        npm run test:contact
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        cargo test --locked --manifest-path src-tauri/Cargo.toml
    }
}
exit $LASTEXITCODE
