$ErrorActionPreference = 'Stop'
$receipt = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'installation.json') | ConvertFrom-Json
$target = Join-Path $receipt.easyreadDir 'resources\app.asar'
if (@(Get-Process -Name EasyRead -ErrorAction SilentlyContinue | Where-Object {$_.Path -eq (Join-Path $receipt.easyreadDir 'EasyRead.exe')}).Count) {throw 'Close EasyRead normally before restoring.'}
if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $receipt.patchedSHA256) {throw 'EasyRead has changed. Refusing to overwrite another version.'}
if ((Get-FileHash -LiteralPath $receipt.desktopBackup -Algorithm SHA256).Hash.ToLowerInvariant() -ne $receipt.originalSHA256) {throw 'Backup checksum mismatch.'}
Copy-Item -LiteralPath $receipt.desktopBackup -Destination $target -Force
Write-Output 'Desktop archive restored. Reading data, notes and the separately installed Zotero plugin were preserved.'
