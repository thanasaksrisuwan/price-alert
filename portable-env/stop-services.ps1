# สคริปท์สำหรับหยุดบริการ Redis และ PostgreSQL แบบพกพา
$ErrorActionPreference = "Stop"
$workingDirectory = Split-Path -Parent $MyInvocation.MyCommand.Definition
$pgsqlDir = Join-Path $workingDirectory "pgsql"
$pgsqlBinDir = Join-Path $pgsqlDir "pgsql\bin"
$dataDir = Join-Path $pgsqlDir "data"
$pgCtl = Join-Path $pgsqlBinDir "pg_ctl.exe"
$redisCliExe = Join-Path $workingDirectory "redis\redis-cli.exe"

# หยุด PostgreSQL
Write-Host "กำลังหยุด PostgreSQL..." -ForegroundColor Yellow
$env:PGPORT = "5433"
$env:PGDATA = $dataDir
Start-Process -FilePath $pgCtl -ArgumentList "stop -D `"$dataDir`"" -Wait -NoNewWindow

# หยุด Redis
Write-Host "กำลังหยุด Redis..." -ForegroundColor Yellow
Start-Process -FilePath $redisCliExe -ArgumentList "-p 6380 shutdown" -Wait -NoNewWindow

Write-Host "หยุดบริการทั้งหมดแล้ว" -ForegroundColor Green
