param([switch]$Demo, [switch]$MockAI, [ValidateSet('dev', 'build', 'release', 'test')][string]$Task = 'dev', [ValidatePattern('^[a-z][a-z0-9-]{0,39}$')][string]$SignerId = 'primary')
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
        # Personal installers require no signing key. Keep them separate from release artifacts.
        $previousTarget = $env:CARGO_TARGET_DIR
        $env:CARGO_TARGET_DIR = Join-Path $projectRoot '.tools/builds/development'
        try { npm run tauri -- build --ci --config src-tauri/tauri.ci.conf.json -- --locked }
        finally {
            if ($null -eq $previousTarget) { Remove-Item Env:\CARGO_TARGET_DIR -ErrorAction SilentlyContinue }
            else { $env:CARGO_TARGET_DIR = $previousTarget }
        }
    }
    'release' {
        $version = (Get-Content package.json -Raw | ConvertFrom-Json).version
        $releaseInstaller = Join-Path $projectRoot "src-tauri/target/release/bundle/nsis/Desktop Buddy_${version}_x64-setup.exe"
        if (Test-Path -LiteralPath $releaseInstaller) { throw 'This release installer already exists. Use a new version; do not replace delivered artifacts.' }
        $signingPassword = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
        if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
            $protectedPath = if ($SignerId -eq 'primary') { Join-Path $env:USERPROFILE '.desktop-buddy/signing-key.dpapi' } else { Join-Path $env:USERPROFILE ".desktop-buddy/signers/$SignerId/signing-key.dpapi" }
            $signingPath = Join-Path $projectRoot '.tools/updater.key'
            if (Test-Path -LiteralPath $protectedPath) {
                Add-Type -AssemblyName System.Security
                $keyBytes = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($protectedPath), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
                try { $env:TAURI_SIGNING_PRIVATE_KEY = [Text.Encoding]::UTF8.GetString($keyBytes).Trim() }
                finally { [Array]::Clear($keyBytes, 0, $keyBytes.Length) }
            } elseif ($SignerId -eq 'primary' -and (Test-Path -LiteralPath $signingPath)) {
                $env:TAURI_SIGNING_PRIVATE_KEY = $signingPath
            } else {
                throw 'Only official releases need a trusted signing key. For an installer without a key use -Task build. See UPDATES.md.'
            }
            $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
            try { npm run tauri -- build --ci -- --locked }
            finally {
                Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
                if ($null -eq $signingPassword) { Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue }
                else { $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $signingPassword }
            }
        } else {
            npm run tauri -- build --ci -- --locked
        }
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        $version = (Get-Content package.json -Raw | ConvertFrom-Json).version
        node scripts/create-update-manifest.mjs "v$version"
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
