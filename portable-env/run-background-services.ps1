# สคริปท์สำหรับเริ่มบริการ Redis และ PostgreSQL แบบพกพาให้ทำงานเป็น Background Process
$ErrorActionPreference = "Stop"
$workingDirectory = Split-Path -Parent $MyInvocation.MyCommand.Definition
$redisDir = Join-Path $workingDirectory "redis"
$pgsqlDir = Join-Path $workingDirectory "pgsql"
$pgsqlBinDir = Join-Path $pgsqlDir "pgsql\bin"
$dataDir = Join-Path $pgsqlDir "data"
$redisServer = Join-Path $redisDir "redis-server.exe"
$redisConfig = Join-Path $redisDir "redis.portable.conf"
$pgCtl = Join-Path $pgsqlBinDir "pg_ctl.exe"

# สร้างโฟลเดอร์สำหรับไฟล์ PID และ Logs
$pidDir = Join-Path $workingDirectory "pids"
if (-not (Test-Path $pidDir)) {
    New-Item -ItemType Directory -Path $pidDir | Out-Null
}

# กำหนดตำแหน่งไฟล์ PID
$redisPidFile = Join-Path $pidDir "redis.pid"
$pgPidFile = Join-Path $pidDir "postgres.pid"

# สร้างโฟลเดอร์สำหรับ Redis logs
$redisLogDir = Join-Path $redisDir "logs"
if (-not (Test-Path $redisLogDir)) {
    New-Item -ItemType Directory -Path $redisLogDir | Out-Null
}

# กำหนดตำแหน่ง log files
$redisLogFile = Join-Path $redisLogDir "redis_portable.log"
$pgLogFile = Join-Path $workingDirectory "postgres.log"

# ตรวจสอบว่ามีบริการทำงานอยู่หรือไม่
$isRedisRunning = $false
$isPgRunning = $false

# ตรวจสอบ Redis ก่อนที่จะเริ่ม
try {
    $redisCliExe = Join-Path $redisDir "redis-cli.exe"
    $redisCheck = Start-Process -FilePath $redisCliExe -ArgumentList "-p 6380 ping" -Wait -NoNewWindow -PassThru
    if ($redisCheck.ExitCode -eq 0) {
        $isRedisRunning = $true
        Write-Host "Redis กำลังทำงานอยู่แล้ว" -ForegroundColor Cyan
    }
}
catch {
    # Redis ไม่ได้ทำงาน - ไม่ต้องทำอะไร
}

# ตรวจสอบ PostgreSQL ก่อนที่จะเริ่ม
try {
    $env:PGPORT = "5433"
    $env:PGDATA = $dataDir
    $pgCheck = Start-Process -FilePath $pgCtl -ArgumentList "status -D `"$dataDir`"" -Wait -NoNewWindow -PassThru
    if ($pgCheck.ExitCode -eq 0) {
        $isPgRunning = $true
        Write-Host "PostgreSQL กำลังทำงานอยู่แล้ว" -ForegroundColor Cyan
    }
}
catch {
    # PostgreSQL ไม่ได้ทำงาน - ไม่ต้องทำอะไร
}

# เริ่ม Redis ถ้ายังไม่ได้ทำงาน
if (-not $isRedisRunning) {
    Write-Host "กำลังเริ่ม Redis ให้ทำงานในพื้นหลัง..." -ForegroundColor Yellow
    
    # สร้าง VBScript ที่จะช่วยเรียก Redis แบบไม่แสดง Window
    $vbsFile = Join-Path $pidDir "start_redis.vbs"
    $redisCmd = "`"$redisServer`" `"$redisConfig`""
    
    # บันทึก VBScript
    @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "$redisCmd", 0, False
"@ | Out-File -FilePath $vbsFile -Encoding ASCII
    
    # รัน VBScript เพื่อเริ่ม Redis ในพื้นหลัง
    Start-Process -FilePath "cscript.exe" -ArgumentList "`"$vbsFile`"" -WindowStyle Hidden
    
    # รอสักครู่ให้ Redis เริ่มต้น
    Start-Sleep -Seconds 2
    
    # ตรวจสอบว่า Redis เริ่มต้นได้หรือไม่
    try {
        $redisCheck = Start-Process -FilePath $redisCliExe -ArgumentList "-p 6380 ping" -Wait -NoNewWindow -PassThru
        if ($redisCheck.ExitCode -eq 0) {
            Write-Host "Redis เริ่มต้นในพื้นหลังเรียบร้อยแล้ว" -ForegroundColor Green
            
            # บันทึก PID ไว้ใช้สำหรับการหยุดบริการ (จะได้จาก client info)
            try {
                $clientInfoOutput = & $redisCliExe -p 6380 client info | Out-String
                if ($clientInfoOutput -match "id=(\d+)") {
                    $clientId = $matches[1]
                    $clientId | Out-File -FilePath $redisPidFile -Encoding ASCII
                }
            } catch {
                Write-Host "ไม่สามารถเก็บ Redis PID ได้: $_" -ForegroundColor Yellow
            }
        } else {
            Write-Host "ไม่สามารถเริ่ม Redis ในพื้นหลังได้" -ForegroundColor Red
        }
    } catch {
        Write-Host "เกิดข้อผิดพลาดในการตรวจสอบ Redis: $_" -ForegroundColor Red
    }
}

# เริ่ม PostgreSQL ถ้ายังไม่ได้ทำงาน
if (-not $isPgRunning) {
    Write-Host "กำลังเริ่ม PostgreSQL ให้ทำงานในพื้นหลัง..." -ForegroundColor Yellow
    $env:PGPORT = "5433"
    $env:PGDATA = $dataDir
    
    # สร้าง VBScript ที่จะช่วยเรียก PostgreSQL แบบไม่แสดง Window
    $vbsFile = Join-Path $pidDir "start_postgres.vbs"
    $pgCmd = "`"$pgCtl`" start -D `"$dataDir`" -o `"-p 5433`" -l `"$pgLogFile`""
    
    # บันทึก VBScript
    @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "$pgCmd", 0, True
"@ | Out-File -FilePath $vbsFile -Encoding ASCII

    # รัน VBScript เพื่อเริ่ม PostgreSQL ในพื้นหลัง
    Start-Process -FilePath "cscript.exe" -ArgumentList "`"$vbsFile`"" -WindowStyle Hidden
    
    # รอสักครู่ให้ PostgreSQL เริ่มต้น
    Start-Sleep -Seconds 5
    
    # ตรวจสอบว่า PostgreSQL เริ่มต้นได้หรือไม่
    try {
        $pgCheck = Start-Process -FilePath $pgCtl -ArgumentList "status -D `"$dataDir`"" -Wait -NoNewWindow -PassThru
        if ($pgCheck.ExitCode -eq 0) {
            Write-Host "PostgreSQL เริ่มต้นในพื้นหลังเรียบร้อยแล้ว" -ForegroundColor Green
            
            # บันทึก PID จากไฟล์ postmaster.pid
            $postmasterPidFile = Join-Path $dataDir "postmaster.pid"
            if (Test-Path $postmasterPidFile) {
                $pgPid = Get-Content -Path $postmasterPidFile -TotalCount 1
                $pgPid | Out-File -FilePath $pgPidFile -Encoding ASCII
            }
        } else {
            Write-Host "ไม่สามารถเริ่ม PostgreSQL ในพื้นหลังได้" -ForegroundColor Red
        }
    } catch {
        Write-Host "เกิดข้อผิดพลาดในการตรวจสอบ PostgreSQL: $_" -ForegroundColor Red
    }
}

# สร้างฐานข้อมูลหากยังไม่มี
$psql = Join-Path $pgsqlBinDir "psql.exe"
$createdbExe = Join-Path $pgsqlBinDir "createdb.exe"

# ตรวจสอบว่าฐานข้อมูลมีอยู่แล้วหรือไม่
Write-Host "กำลังตรวจสอบฐานข้อมูล..." -ForegroundColor Yellow
$dbExists = & $psql -p 5433 -U postgres -c "SELECT 1 FROM pg_database WHERE datname = 'price_alert_db'" | Select-String -Pattern "1 row"

if (-not $dbExists) {
    Write-Host "กำลังสร้างฐานข้อมูล price_alert_db..." -ForegroundColor Yellow
    & $createdbExe -p 5433 -U postgres price_alert_db
    
    # นำเข้าโครงสร้างฐานข้อมูล
    $sqlFile = Join-Path (Split-Path -Parent $workingDirectory) "sql\init.sql"
    if (Test-Path $sqlFile) {
        Write-Host "กำลังนำเข้าโครงสร้างฐานข้อมูล..." -ForegroundColor Yellow
        & $psql -p 5433 -U postgres -d price_alert_db -f $sqlFile
    }
}

# ตรวจสอบการทำงานอีกครั้ง
$allServicesRunning = $true
try {
    $redisCheck = Start-Process -FilePath $redisCliExe -ArgumentList "-p 6380 ping" -Wait -NoNewWindow -PassThru
    if ($redisCheck.ExitCode -ne 0) {
        $allServicesRunning = $false
        Write-Host "Redis ไม่สามารถเริ่มต้นได้" -ForegroundColor Red
    }
}
catch {
    $allServicesRunning = $false
    Write-Host "เกิดข้อผิดพลาดในการตรวจสอบ Redis: $_" -ForegroundColor Red
}

try {
    $pgCheck = Start-Process -FilePath $pgCtl -ArgumentList "status -D `"$dataDir`"" -Wait -NoNewWindow -PassThru
    if ($pgCheck.ExitCode -ne 0) {
        $allServicesRunning = $false
        Write-Host "PostgreSQL ไม่สามารถเริ่มต้นได้" -ForegroundColor Red
    }
}
catch {
    $allServicesRunning = $false
    Write-Host "เกิดข้อผิดพลาดในการตรวจสอบ PostgreSQL: $_" -ForegroundColor Red
}

if ($allServicesRunning) {
    Write-Host "บริการทั้งหมดเริ่มต้นในพื้นหลังเรียบร้อยแล้ว" -ForegroundColor Green
    Write-Host "Redis กำลังทำงานที่ localhost:6380" -ForegroundColor Cyan
    Write-Host "PostgreSQL กำลังทำงานที่ localhost:5433 (ชื่อผู้ใช้: postgres, ชื่อฐานข้อมูล: price_alert_db)" -ForegroundColor Cyan
} else {
    Write-Host "เกิดปัญหาในการเริ่มต้นบริการบางส่วน โปรดตรวจสอบข้อความด้านบน" -ForegroundColor Yellow
}
