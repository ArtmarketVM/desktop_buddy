$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot '.tools/updater.key'
$storageFolder = Join-Path $env:USERPROFILE '.desktop-buddy'
$storagePath = Join-Path $storageFolder 'signing-key.dpapi'
if (-not (Test-Path -LiteralPath $sourcePath)) { throw 'No local plaintext signing key found.' }
if (Test-Path -LiteralPath $storagePath) { throw 'Protected signing key already exists; refusing to overwrite it.' }
$keyBytes = [IO.File]::ReadAllBytes($sourcePath)
try {
    $encryptedBytes = [Security.Cryptography.ProtectedData]::Protect($keyBytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    [void][IO.Directory]::CreateDirectory($storageFolder)
    [IO.File]::WriteAllBytes($storagePath, $encryptedBytes)
    $restoredBytes = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($storagePath), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    try {
        if ([Convert]::ToBase64String($keyBytes) -ne [Convert]::ToBase64String($restoredBytes)) { throw 'Protected key verification failed.' }
    } finally { [Array]::Clear($restoredBytes, 0, $restoredBytes.Length) }
    Remove-Item -LiteralPath $sourcePath
    Write-Output 'Signing key protected with Windows DPAPI and removed from the project folder.'
} finally { [Array]::Clear($keyBytes, 0, $keyBytes.Length) }
