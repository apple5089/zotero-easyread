param([Parameter(Mandatory=$true)][string]$EasyReadDir)
$ErrorActionPreference = 'Stop'
$installDir = (Resolve-Path -LiteralPath $EasyReadDir).Path
$target = Join-Path $installDir 'resources\app.asar'
if (-not (Test-Path -LiteralPath (Join-Path $installDir 'EasyRead.exe'))) {throw 'EasyRead.exe was not found in this directory.'}
if (@(Get-Process -Name EasyRead -ErrorAction SilentlyContinue | Where-Object {$_.Path -eq (Join-Path $installDir 'EasyRead.exe')}).Count) {throw 'Close EasyRead normally before installing the desktop bridge.'}
$payload = Join-Path $PSScriptRoot 'dist\app.asar'
$metadata = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'dist\desktop-patch.json') | ConvertFrom-Json
$currentHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
if ($currentHash -ne $metadata.originalSHA256 -and $currentHash -ne $metadata.patchedSHA256) {throw 'Installed EasyRead differs from the source archive. Rebuild the patch before installing.'}
if ((Get-FileHash -LiteralPath $payload -Algorithm SHA256).Hash.ToLowerInvariant() -ne $metadata.patchedSHA256) {throw 'Patch checksum mismatch.'}
$receiptPath = Join-Path $PSScriptRoot 'installation.json'
if ($currentHash -eq $metadata.patchedSHA256 -and (Test-Path -LiteralPath $receiptPath)) {
    $receipt = Get-Content -Raw -LiteralPath $receiptPath | ConvertFrom-Json
    if ($receipt.easyreadDir -ne $installDir) {throw 'Existing receipt belongs to a different installation.'}
} elseif ($currentHash -eq $metadata.patchedSHA256) {
    throw 'Archive is already patched and no original backup receipt exists. Refusing to create an unusable backup.'
} else {
    $backupDir = Join-Path $PSScriptRoot ('backups\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    $backupPath = Join-Path $backupDir 'app.asar'
    Copy-Item -LiteralPath $target -Destination $backupPath
    if ((Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $currentHash) {throw 'Backup checksum mismatch.'}
    $receipt = [ordered]@{installedAt=(Get-Date).ToString('o');easyreadDir=$installDir;desktopBackup=$backupPath;originalSHA256=$currentHash;patchedSHA256=$metadata.patchedSHA256}
    $receipt | ConvertTo-Json | Set-Content -LiteralPath $receiptPath -Encoding utf8
}
try {
    Copy-Item -LiteralPath $payload -Destination $target -Force
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $metadata.patchedSHA256) {throw 'Installed patch checksum mismatch.'}
} catch {
    Copy-Item -LiteralPath $receipt.desktopBackup -Destination $target -Force
    throw
}
Write-Output 'Desktop bridge installed. Start EasyRead normally; install the XPI through Zotero Tools > Plugins.'
