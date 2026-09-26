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
    'build' { npm run tauri -- build -- --locked }
    'test' {
        npm test
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        npm run build
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        cargo test --locked --manifest-path src-tauri/Cargo.toml
    }
}
exit $LASTEXITCODE
