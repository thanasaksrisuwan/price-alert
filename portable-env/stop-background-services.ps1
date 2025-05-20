# สคริปท์สำหรับหยุดบริการ Redis และ PostgreSQL ที่ทำงานในพื้นหลัง
$ErrorActionPreference = "Stop"
$workingDirectory = Split-Path -Parent $MyInvocation.MyCommand.Definition
$redisDir = Join-Path $workingDirectory "redis"
$pgsqlDir = Join-Path $workingDirectory "pgsql"
$pgsqlBinDir = Join-Path $pgsqlDir "pgsql\bin"
$dataDir = Join-Path $pgsqlDir "data"
$redisCliExe = Join-Path $redisDir "redis-cli.exe"
$pgCtl = Join-Path $pgsqlBinDir "pg_ctl.exe"

# โฟลเดอร์สำหรับไฟล์ PID
$pidDir = Join-Path $workingDirectory "pids"
$redisPidFile = Join-Path $pidDir "redis.pid"
$pgPidFile = Join-Path $pidDir "postgres.pid"

# ตรวจสอบและหยุด Redis
Write-Host "กำลังตรวจสอบสถานะ Redis..." -ForegroundColor Yellow
try {
    $redisCheck = Start-Process -FilePath $redisCliExe -ArgumentList "-p 6380 ping" -Wait -NoNewWindow -PassThru
    if ($redisCheck.ExitCode -eq 0) {
        Write-Host "กำลังหยุด Redis..." -ForegroundColor Yellow
        & $redisCliExe -p 6380 shutdown
        Write-Host "Redis ถูกหยุดการทำงานแล้ว" -ForegroundColor Green
    } else {
        Write-Host "Redis ไม่ได้ทำงานอยู่" -ForegroundColor Cyan
    }
}
catch {
    Write-Host "Redis ไม่ได้ทำงานอยู่หรือเกิดข้อผิดพลาดในการหยุด: $_" -ForegroundColor Yellow
}

# ตรวจสอบและหยุด PostgreSQL
Write-Host "กำลังตรวจสอบสถานะ PostgreSQL..." -ForegroundColor Yellow
$env:PGPORT = "5433"
$env:PGDATA = $dataDir
try {
    $pgCheck = Start-Process -FilePath $pgCtl -ArgumentList "status -D `"$dataDir`"" -Wait -NoNewWindow -PassThru
    if ($pgCheck.ExitCode -eq 0) {
        Write-Host "กำลังหยุด PostgreSQL..." -ForegroundColor Yellow
        
        # หยุด PostgreSQL
        $pgStop = Start-Process -FilePath $pgCtl -ArgumentList "stop -D `"$dataDir`" -m fast" -Wait -NoNewWindow -PassThru
        if ($pgStop.ExitCode -eq 0) {
            Write-Host "PostgreSQL ถูกหยุดการทำงานแล้ว" -ForegroundColor Green
        } else {
            Write-Host "เกิดข้อผิดพลาดในการหยุด PostgreSQL" -ForegroundColor Red
        }
    } else {
        Write-Host "PostgreSQL ไม่ได้ทำงานอยู่" -ForegroundColor Cyan
    }
}
catch {
    Write-Host "PostgreSQL ไม่ได้ทำงานอยู่หรือเกิดข้อผิดพลาดในการหยุด: $_" -ForegroundColor Yellow
}

# ลบไฟล์ PID หากมี
if (Test-Path $redisPidFile) {
    Remove-Item $redisPidFile -Force
}

if (Test-Path $pgPidFile) {
    Remove-Item $pgPidFile -Force
}

Write-Host "การหยุดบริการทั้งหมดเสร็จสมบูรณ์" -ForegroundColor Green
