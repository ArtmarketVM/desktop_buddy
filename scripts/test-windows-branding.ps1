$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'Run the installer migration rehearsal on Windows.' }
if (-not $env:GITHUB_ACTIONS) { throw 'Use an isolated hosted runner for this installer rehearsal.' }
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$stage = Join-Path $env:RUNNER_TEMP 'sumi-branding-rehearsal'
New-Item -ItemType Directory -Force $stage | Out-Null
$legacy = Join-Path $stage 'legacy.exe'
Invoke-WebRequest 'https://github.com/ArtmarketVM/desktop_buddy/releases/download/v0.49.1/Desktop.Buddy_0.49.1_x64-setup.exe' -OutFile $legacy
Invoke-WebRequest 'https://github.com/ArtmarketVM/desktop_buddy/releases/download/v0.49.1/Desktop.Buddy_0.49.1_x64-setup.exe.sig' -OutFile "$legacy.sig"
node --input-type=module -e 'import {readFileSync} from "node:fs"; import {readTrust,verifyArtifact} from "./scripts/signing-trust.mjs"; verifyArtifact(readFileSync(process.argv[1]),readFileSync(process.argv[1]+".sig","utf8").trim(),readTrust(process.cwd()),"0.49.1");' $legacy
if ($LASTEXITCODE -ne 0) { throw 'Legacy installer signature failed.' }
$installation = Join-Path $stage 'Desktop Buddy'
$p = Start-Process -FilePath $legacy -ArgumentList "/S /D=$installation" -PassThru -Wait
if ($p.ExitCode -ne 0) { throw "Legacy installer failed: $($p.ExitCode)" }
$oldBinary = Join-Path $installation 'desktop-buddy.exe'
if (-not (Test-Path $oldBinary)) { throw 'Legacy executable was not installed.' }
$shortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Desktop Buddy.lnk'
$oldLink = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcut)
$oldLink.TargetPath = $oldBinary
$oldLink.Save()
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
New-Item -Path $runKey -Force | Out-Null
Set-ItemProperty -Path $runKey -Name 'DesktopBuddy' -Value "`"$oldBinary`" --background"
$data = Join-Path $env:APPDATA 'com.artmarketvm.desktopbuddy'
New-Item -ItemType Directory -Force $data | Out-Null
$sentinel = Join-Path $data 'branding-rehearsal.txt'
Set-Content -Path $sentinel -Value 'preserve-existing-data' -NoNewline
$installer = Join-Path (Get-Location) "src-tauri/target/release/bundle/nsis/sumi_${version}_x64-setup.exe"
$p = Start-Process -FilePath $installer -ArgumentList "/S /UPDATE /D=$installation" -PassThru -Wait
if ($p.ExitCode -ne 0) { throw "sumi installer failed: $($p.ExitCode)" }
if (-not (Test-Path (Join-Path $installation 'sumi.exe'))) { throw 'Renamed executable missing.' }
if (Test-Path $oldBinary) { throw 'Legacy executable was not migrated.' }
$entry = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Desktop Buddy'
if ($entry.DisplayName -ne 'sumi' -or $entry.DisplayVersion -ne $version) { throw 'Installed product metadata did not migrate.' }
if ((Get-Content $sentinel -Raw) -ne 'preserve-existing-data') { throw 'Existing application data changed.' }
$newShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'sumi.lnk'
if (-not (Test-Path $newShortcut)) { throw 'sumi shortcut missing.' }
$link = (New-Object -ComObject WScript.Shell).CreateShortcut($newShortcut)
if ($link.TargetPath -ne (Join-Path $installation 'sumi.exe')) { throw 'Shortcut target did not migrate.' }
if (Test-Path $shortcut) { throw 'Legacy shortcut remains.' }
$startup = Get-ItemProperty $runKey
$expectedStartup = "`"$(Join-Path $installation 'sumi.exe')`" --background"
if ($startup.sumi -ne $expectedStartup -or $null -ne $startup.DesktopBuddy) { throw 'Existing startup registration did not migrate before first launch.' }
Write-Output 'Verified old-to-sumi Windows upgrade, product name, executable, shortcut, installation identity, startup opt-in and retained data.'
