<#
  Production database backup (pre-migration safety net).

  Runs pg_dump inside Docker so no local PostgreSQL client install is needed.
  Connection details come from .env.local:
    NEXT_PUBLIC_SUPABASE_URL  → project ref (pooler user: postgres.<ref>)
    SUPABASE_DB_HOST          → Session pooler host (Supabase → Connect → Session pooler)
  The database password is prompted for and passed as an environment variable to
  the container, so it is never written to disk, git, or the shell history.

  Usage (from the repository root):
      powershell -ExecutionPolicy Bypass -File scripts/db-backup.ps1

  Output: backups/booknexa-prod-<timestamp>.dump  (custom format, restorable)
          backups/booknexa-prod-<timestamp>.sql   (plain SQL, human-readable)

  The backups/ folder is gitignored — the dump contains real user data.
#>

$ErrorActionPreference = "Stop"

function Get-EnvValue {
  param([string]$Path, [string]$Key)
  if (-not (Test-Path $Path)) { return $null }
  foreach ($line in Get-Content -Path $Path) {
    $match = [regex]::Match($line, "^\s*" + [regex]::Escape($Key) + "\s*=\s*(.*)$")
    if ($match.Success) { return $match.Groups[1].Value.Trim().Trim('"').Trim("'") }
  }
  return $null
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile  = Join-Path $repoRoot ".env.local"

$siteUrl = Get-EnvValue -Path $envFile -Key "NEXT_PUBLIC_SUPABASE_URL"
if ([string]::IsNullOrWhiteSpace($siteUrl)) {
  throw "NEXT_PUBLIC_SUPABASE_URL is not set in .env.local — point it at the BookNexa Supabase project first."
}
$projectRef = ([Uri]$siteUrl).Host.Split('.')[0]

$PgHost = Get-EnvValue -Path $envFile -Key "SUPABASE_DB_HOST"
if ([string]::IsNullOrWhiteSpace($PgHost)) {
  throw "SUPABASE_DB_HOST is not set in .env.local (Supabase → Connect → Session pooler host)."
}
$PgPort   = "5432"
$PgDb     = "postgres"
$PgUser   = "postgres.$projectRef"
# Match Supabase's server major version to avoid pg_dump version mismatch errors.
$PgImage  = "postgres:17-alpine"

$backupDir = Join-Path $repoRoot "backups"
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }

$stamp    = Get-Date -Format "yyyyMMdd-HHmmss"
$dumpName = "booknexa-prod-$stamp.dump"
$sqlName  = "booknexa-prod-$stamp.sql"

Write-Host "Supabase database backup" -ForegroundColor Cyan
Write-Host "  host : $PgHost"
Write-Host "  user : $PgUser"
Write-Host "  out  : backups/$dumpName"
Write-Host ""

$secure = Read-Host "Enter the Supabase database password (hidden)" -AsSecureString
$plain  = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
)
if ([string]::IsNullOrWhiteSpace($plain)) { throw "No password entered." }

try {
  Write-Host "Pulling $PgImage (first run only)..." -ForegroundColor DarkGray
  docker pull $PgImage | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "docker pull failed. Is Docker Desktop running?" }

  # 1. Custom-format dump — the file to restore from.
  Write-Host "Creating custom-format dump..." -ForegroundColor Cyan
  docker run --rm `
    -e PGPASSWORD=$plain `
    -v "${backupDir}:/backup" `
    $PgImage `
    pg_dump -h $PgHost -p $PgPort -U $PgUser -d $PgDb `
      --format=custom --no-owner --no-privileges `
      -f "/backup/$dumpName"
  if ($LASTEXITCODE -ne 0) { throw "pg_dump (custom format) failed." }

  # 2. Plain SQL dump — easy to inspect/diff.
  Write-Host "Creating plain SQL dump..." -ForegroundColor Cyan
  docker run --rm `
    -e PGPASSWORD=$plain `
    -v "${backupDir}:/backup" `
    $PgImage `
    pg_dump -h $PgHost -p $PgPort -U $PgUser -d $PgDb `
      --format=plain --no-owner --no-privileges `
      -f "/backup/$sqlName"
  if ($LASTEXITCODE -ne 0) { throw "pg_dump (plain format) failed." }
}
finally {
  # Clear the password from memory as soon as the dumps finish.
  $plain = $null
  [System.GC]::Collect()
}

Write-Host ""
Write-Host "Backup complete:" -ForegroundColor Green
Get-ChildItem $backupDir -Filter "booknexa-prod-$stamp.*" |
  Select-Object Name, @{ Name = "SizeMB"; Expression = { [math]::Round($_.Length / 1MB, 2) } } |
  Format-Table -AutoSize
