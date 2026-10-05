param([Parameter(Mandatory)][ValidatePattern('^[a-z][a-z0-9-]{0,39}$')][string]$SignerId)
$ErrorActionPreference = 'Stop'
if ($SignerId -eq 'primary') { throw 'The primary signer is reserved for the existing release key. Choose your own name.' }
Add-Type -AssemblyName System.Security
$projectRoot = Split-Path -Parent $PSScriptRoot
$storageFolder = Join-Path $env:USERPROFILE ".desktop-buddy/signers/$SignerId"
$protectedPath = Join-Path $storageFolder 'signing-key.dpapi'
$publicPath = Join-Path $storageFolder 'public-key.pub'
if ((Test-Path -LiteralPath $protectedPath) -or (Test-Path -LiteralPath $publicPath)) { throw 'This signer already exists. Reuse its key; do not generate one for every release.' }
$temporaryFolder = Join-Path ([IO.Path]::GetTempPath()) ('buddy-signing-' + [guid]::NewGuid().ToString('N'))
$keyPath = Join-Path $temporaryFolder 'signing.key'
$temporaryPublicPath = "$keyPath.pub"
$keyBytes = $null
$restoredBytes = $null
try {
    [void][IO.Directory]::CreateDirectory($temporaryFolder)
    # Capture CLI output: key-generation output must never reach logs or chat.
    # Windows PowerShell treats native stderr warnings as errors under Stop.
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $captured = & node (Join-Path $projectRoot 'node_modules/@tauri-apps/cli/tauri.js') signer generate --ci --write-keys $keyPath 2>&1
        $generationExitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousErrorActionPreference }
    if ($generationExitCode -ne 0) { throw 'Key generation failed. Install project dependencies and Node.js first.' }
    $keyBytes = [IO.File]::ReadAllBytes($keyPath)
    $encrypted = [Security.Cryptography.ProtectedData]::Protect($keyBytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    [void][IO.Directory]::CreateDirectory($storageFolder)
    [IO.File]::WriteAllBytes($protectedPath, $encrypted)
    $restoredBytes = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($protectedPath), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    if ([Convert]::ToBase64String($keyBytes) -ne [Convert]::ToBase64String($restoredBytes)) { throw 'Protected key verification failed.' }
    [IO.File]::Copy($temporaryPublicPath, $publicPath, $false)
    Write-Output "Created signer $SignerId. Private key is protected for this Windows account outside the repository."
    Write-Output "Share only this public file for enrollment: $publicPath"
} finally {
    if ($keyBytes) { [Array]::Clear($keyBytes, 0, $keyBytes.Length) }
    if ($restoredBytes) { [Array]::Clear($restoredBytes, 0, $restoredBytes.Length) }
    $captured = $null
    foreach ($temporaryFile in @($keyPath, $temporaryPublicPath)) {
        if ([IO.Path]::GetFullPath($temporaryFile).StartsWith([IO.Path]::GetFullPath($temporaryFolder) + [IO.Path]::DirectorySeparatorChar)) {
            Remove-Item -LiteralPath $temporaryFile -Force -ErrorAction SilentlyContinue
        }
    }
    # No recursive deletion. Remove only the empty task-created temporary folder.
    if (Test-Path -LiteralPath $temporaryFolder) { [IO.Directory]::Delete($temporaryFolder, $false) }
}
