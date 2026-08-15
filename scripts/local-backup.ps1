# ==========================================================
# Pharmacy ERP - Local Backup Script (Node.js version)
# Uses node to connect to Neon and dump the database.
# ==========================================================

$BackupFolder = "C:\PharmacyBackups"
$RetentionDays = 30

if (!(Test-Path $BackupFolder)) {
    New-Item -ItemType Directory -Path $BackupFolder | Out-Null
}

$DateStamp = Get-Date -Format "yyyy-MM-dd"
$BackupFile = Join-Path $BackupFolder "backup-$DateStamp.sql"

Write-Host "Starting backup to $BackupFile ..."

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeScript = Join-Path $scriptDir "backup-dump.js"

node $nodeScript $BackupFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "Backup completed successfully: $BackupFile"
    $FileSize = (Get-Item $BackupFile).Length / 1MB
    Write-Host ("Backup size: {0:N2} MB" -f $FileSize)
} else {
    Write-Host "ERROR: Backup failed with exit code $LASTEXITCODE"
    exit 1
}

$CutoffDate = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -Path $BackupFolder -Filter "backup-*.sql" | Where-Object {
    $_.LastWriteTime -lt $CutoffDate
} | ForEach-Object {
    Write-Host "Deleting old backup: $($_.Name)"
    Remove-Item $_.FullName -Force
}

Write-Host "Done. Current backups in folder:"
Get-ChildItem -Path $BackupFolder -Filter "backup-*.sql" | Select-Object Name, LastWriteTime
