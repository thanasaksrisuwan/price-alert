# portable-env.ps1
#
# สคริปท์สำหรับสร้างสภาพแวดล้อม Redis และ PostgreSQL แบบพกพา (portable) ใน Windows
# ไม่จำเป็นต้องมีสิทธิ์ Administrator เนื่องจากไม่ติดตั้งบริการระบบ

# ตัวแปรสำหรับการติดตั้ง
$ErrorActionPreference = "Stop"
$workingDirectory = Split-Path -Parent $MyInvocation.MyCommand.Definition
$portableDir = Join-Path $workingDirectory "portable-env"
$redisDir = Join-Path $portableDir "redis"
$pgsqlDir = Join-Path $portableDir "pgsql"
$dataDir = Join-Path $pgsqlDir "data"
$redisDownloadUrl = "https://github.com/microsoftarchive/redis/releases/download/win-3.2.100/Redis-x64-3.2.100.zip"
$pgsqlDownloadUrl = "https://get.enterprisedb.com/postgresql/postgresql-16.2-1-windows-x64-binaries.zip"
$redisZipFile = Join-Path $portableDir "redis.zip"
$pgsqlZipFile = Join-Path $portableDir "pgsql.zip"

# สร้างโครงสร้างไดเรกทอรี
Write-Host "เริ่มต้นการสร้างสภาพแวดล้อม Redis และ PostgreSQL แบบพกพา..." -ForegroundColor Cyan
if (-not (Test-Path $portableDir)) {
    New-Item -ItemType Directory -Path $portableDir | Out-Null
}

# ฟังก์ชั่นสำหรับดาวน์โหลดและแตกไฟล์
function DownloadAndExtract($url, $zipFile, $extractPath) {
    Write-Host "กำลังดาวน์โหลด $url..." -ForegroundColor Yellow
    
    try {
        # ใช้ .NET WebClient สำหรับการดาวน์โหลด
        $webClient = New-Object System.Net.WebClient
        $webClient.DownloadFile($url, $zipFile)
        
        Write-Host "กำลังแตกไฟล์..." -ForegroundColor Yellow
        Expand-Archive -Path $zipFile -DestinationPath $extractPath -Force
        
        Write-Host "ติดตั้งสำเร็จ" -ForegroundColor Green
    }
    catch {
        Write-Host "เกิดข้อผิดพลาด: $_" -ForegroundColor Red
        throw $_
    }
}

# สร้างไฟล์ .env ถ้ายังไม่มี
$envFile = Join-Path $workingDirectory ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "กำลังสร้างไฟล์ .env..." -ForegroundColor Yellow
    @"
# การกำหนดค่าแอปพลิเคชัน
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# การกำหนดค่าฐานข้อมูล (พกพา)
DATABASE_URL=postgres://postgres:password@localhost:5433/price_alert_db

# การกำหนดค่า Redis (พกพา)
REDIS_URL=redis://localhost:6380

# ใส่ค่า Telegram Bot Token ของคุณที่นี่
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
"@ | Out-File -FilePath $envFile -Encoding utf8
    Write-Host "สร้างไฟล์ .env แล้ว" -ForegroundColor Green
}

# ติดตั้ง Redis แบบพกพา
Write-Host "เริ่มการติดตั้ง Redis แบบพกพา..." -ForegroundColor Cyan
if (-not (Test-Path $redisDir)) {
    New-Item -ItemType Directory -Path $redisDir | Out-Null
    DownloadAndExtract -url $redisDownloadUrl -zipFile $redisZipFile -extractPath $redisDir
    
    # สร้างไฟล์คอนฟิก Redis
    $redisConfigFile = Join-Path $redisDir "redis.portable.conf"
    
@"
# Redis configuration file for portable use
port 6380
bind 127.0.0.1
loglevel notice
logfile "logs/redis_portable.log"
dbfilename dump_portable.rdb
dir ./
"@ | Out-File -FilePath $redisConfigFile -Encoding utf8
    
    Write-Host "สร้างไฟล์คอนฟิก Redis แล้ว" -ForegroundColor Green
    Remove-Item $redisZipFile -Force
}
else {
    Write-Host "Redis ถูกติดตั้งอยู่แล้ว" -ForegroundColor Green
}

# ติดตั้ง PostgreSQL แบบพกพา
Write-Host "เริ่มการติดตั้ง PostgreSQL แบบพกพา..." -ForegroundColor Cyan
if (-not (Test-Path $pgsqlDir)) {
    New-Item -ItemType Directory -Path $pgsqlDir | Out-Null
    DownloadAndExtract -url $pgsqlDownloadUrl -zipFile $pgsqlZipFile -extractPath $pgsqlDir
    
    # สร้างไดเรกทอรีข้อมูล
    if (-not (Test-Path $dataDir)) {
        New-Item -ItemType Directory -Path $dataDir | Out-Null
    }
    
    # กำหนดค่าและเริ่มต้น PostgreSQL
    $binDir = Join-Path $pgsqlDir "bin"
    $initdbExe = Join-Path $binDir "initdb.exe"
    
    Write-Host "กำลังสร้างคลัสเตอร์ฐานข้อมูล..." -ForegroundColor Yellow
    try {
        # เริ่มต้นฐานข้อมูล
        $env:PGHOST = "localhost"
        $env:PGPORT = "5433"
        Start-Process -FilePath $initdbExe -ArgumentList "-D `"$dataDir`" -U postgres -E UTF8 -A trust" -Wait -NoNewWindow
        
        Write-Host "สร้างคลัสเตอร์ฐานข้อมูลสำเร็จ" -ForegroundColor Green
    }
    catch {
        Write-Host "เกิดข้อผิดพลาดในการสร้างคลัสเตอร์ฐานข้อมูล: $_" -ForegroundColor Red
    }
    
    # สร้างไฟล์ postgresql.conf ที่กำหนดเอง
    $postgresqlConfFile = Join-Path $dataDir "postgresql.conf"
    
    # อ่านไฟล์คอนฟิกปัจจุบันและอัปเดตพอร์ต
    $postgresqlConf = Get-Content -Path $postgresqlConfFile
    $updatedConf = $postgresqlConf -replace '#port = 5432', 'port = 5433'
    $updatedConf | Out-File -FilePath $postgresqlConfFile -Force
    
    Write-Host "ปรับแต่งไฟล์คอนฟิก PostgreSQL แล้ว" -ForegroundColor Green
    
    Remove-Item $pgsqlZipFile -Force
}
else {
    Write-Host "PostgreSQL ถูกติดตั้งอยู่แล้ว" -ForegroundColor Green
}

# สร้างสคริปท์สำหรับเริ่มและหยุดบริการ
$startScriptPath = Join-Path $portableDir "start-services.ps1"
$stopScriptPath = Join-Path $portableDir "stop-services.ps1"

# สคริปท์สำหรับเริ่มบริการ
@"
# สคริปท์สำหรับเริ่มบริการ Redis และ PostgreSQL แบบพกพา
`$ErrorActionPreference = "Stop"
`$workingDirectory = Split-Path -Parent `$MyInvocation.MyCommand.Definition
`$redisDir = Join-Path `$workingDirectory "redis"
`$pgsqlDir = Join-Path `$workingDirectory "pgsql"
`$dataDir = Join-Path `$pgsqlDir "data"
`$redisServer = Join-Path `$redisDir "redis-server.exe"
`$redisConfig = Join-Path `$redisDir "redis.portable.conf"
`$pgCtl = Join-Path `$pgsqlDir "bin\pg_ctl.exe"

# สร้างโฟลเดอร์สำหรับไฟล์ PID
`$pidDir = Join-Path `$workingDirectory "pids"
if (-not (Test-Path `$pidDir)) {
    New-Item -ItemType Directory -Path `$pidDir | Out-Null
}

# เริ่ม Redis
Write-Host "กำลังเริ่ม Redis..." -ForegroundColor Yellow
Start-Process -FilePath `$redisServer -ArgumentList "`"`$redisConfig`"" -NoNewWindow

# รอสักครู่ให้ Redis เริ่มต้น
Start-Sleep -Seconds 2

# เริ่ม PostgreSQL
Write-Host "กำลังเริ่ม PostgreSQL..." -ForegroundColor Yellow
`$env:PGPORT = "5433"
`$env:PGDATA = `$dataDir
Start-Process -FilePath `$pgCtl -ArgumentList "start -D `"`$dataDir`" -o `"-p 5433`"" -Wait -NoNewWindow

# สร้างฐานข้อมูลหากยังไม่มี
`$psql = Join-Path `$pgsqlDir "bin\psql.exe"
`$createdbExe = Join-Path `$pgsqlDir "bin\createdb.exe"

# ตรวจสอบว่าฐานข้อมูลมีอยู่แล้วหรือไม่
Write-Host "กำลังตรวจสอบฐานข้อมูล..." -ForegroundColor Yellow
`$dbExists = & `$psql -p 5433 -U postgres -c "SELECT 1 FROM pg_database WHERE datname = 'price_alert_db'" | Select-String -Pattern "1 row"

if (-not `$dbExists) {
    Write-Host "กำลังสร้างฐานข้อมูล price_alert_db..." -ForegroundColor Yellow
    & `$createdbExe -p 5433 -U postgres price_alert_db
    
    # นำเข้าโครงสร้างฐานข้อมูล
    `$sqlFile = Join-Path (Split-Path -Parent `$workingDirectory) "sql\init.sql"
    if (Test-Path `$sqlFile) {
        Write-Host "กำลังนำเข้าโครงสร้างฐานข้อมูล..." -ForegroundColor Yellow
        & `$psql -p 5433 -U postgres -d price_alert_db -f `$sqlFile
    }
}

Write-Host "บริการทั้งหมดเริ่มต้นแล้ว" -ForegroundColor Green
Write-Host "Redis กำลังทำงานที่ localhost:6380" -ForegroundColor Cyan
Write-Host "PostgreSQL กำลังทำงานที่ localhost:5433 (ชื่อผู้ใช้: postgres, ชื่อฐานข้อมูล: price_alert_db)" -ForegroundColor Cyan
"@ | Out-File -FilePath $startScriptPath -Encoding utf8

# สคริปท์สำหรับหยุดบริการ
@"
# สคริปท์สำหรับหยุดบริการ Redis และ PostgreSQL แบบพกพา
`$ErrorActionPreference = "Stop"
`$workingDirectory = Split-Path -Parent `$MyInvocation.MyCommand.Definition
`$pgsqlDir = Join-Path `$workingDirectory "pgsql"
`$dataDir = Join-Path `$pgsqlDir "data"
`$pgCtl = Join-Path `$pgsqlDir "bin\pg_ctl.exe"
`$redisCliExe = Join-Path `$workingDirectory "redis\redis-cli.exe"

# หยุด PostgreSQL
Write-Host "กำลังหยุด PostgreSQL..." -ForegroundColor Yellow
`$env:PGPORT = "5433"
`$env:PGDATA = `$dataDir
Start-Process -FilePath `$pgCtl -ArgumentList "stop -D `"`$dataDir`"" -Wait -NoNewWindow

# หยุด Redis
Write-Host "กำลังหยุด Redis..." -ForegroundColor Yellow
Start-Process -FilePath `$redisCliExe -ArgumentList "-p 6380 shutdown" -Wait -NoNewWindow

Write-Host "หยุดบริการทั้งหมดแล้ว" -ForegroundColor Green
"@ | Out-File -FilePath $stopScriptPath -Encoding utf8

Write-Host ""
Write-Host "การติดตั้งสภาพแวดล้อมแบบพกพาเสร็จสิ้น!" -ForegroundColor Green
Write-Host "คุณสามารถเริ่มบริการด้วยสคริปท์:" -ForegroundColor Cyan
Write-Host "  .\portable-env\start-services.ps1" -ForegroundColor White
Write-Host "และหยุดบริการด้วย:" -ForegroundColor Cyan
Write-Host "  .\portable-env\stop-services.ps1" -ForegroundColor White
Write-Host ""
Write-Host "หลังจากเริ่มบริการ:" -ForegroundColor Yellow
Write-Host "- Redis จะทำงานที่ localhost:6380" -ForegroundColor White
Write-Host "- PostgreSQL จะทำงานที่ localhost:5433 (ชื่อผู้ใช้: postgres, ชื่อฐานข้อมูล: price_alert_db)" -ForegroundColor White
Write-Host ""
Write-Host "คุณสามารถเริ่มต้นแอปพลิเคชันด้วยคำสั่ง:" -ForegroundColor Yellow
Write-Host "    npm install" -ForegroundColor White
Write-Host "    npm run dev" -ForegroundColor White
