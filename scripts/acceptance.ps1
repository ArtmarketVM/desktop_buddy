param([Parameter(ValueFromRemainingArguments = $true)][string[]]$RunnerArguments)
$ErrorActionPreference = 'Stop'
$acceptanceRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $acceptanceRoot
$acceptanceVswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (Test-Path -LiteralPath $acceptanceVswhere) {
    $acceptanceVsPath = & $acceptanceVswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($acceptanceVsPath) {
        & "$acceptanceVsPath\Common7\Tools\Launch-VsDevShell.ps1" -Arch amd64 -HostArch amd64 -SkipAutomaticLocation
    }
}
node scripts/run-acceptance.mjs @RunnerArguments
exit $LASTEXITCODE
