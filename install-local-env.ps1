# install-local-env.ps1
#
# สคริปท์สำหรับติดตั้ง Redis และ PostgreSQL สำหรับสภาพแวดล้อมการพัฒนาบน Windows
# ต้องรันด้วยสิทธิ์ Administrator เพื่อติดตั้งบริการ

# ตัวแปรสำหรับการติดตั้ง
$ErrorActionPreference = "Stop"
$workingDirectory = Split-Path -Parent $MyInvocation.MyCommand.Definition
$localEnvDir = Join-Path $workingDirectory "local-env"
$redisDir = Join-Path $localEnvDir "redis"
$pgsqlDir = Join-Path $localEnvDir "pgsql"
$redisDownloadUrl = "https://github.com/microsoftarchive/redis/releases/download/win-3.2.100/Redis-x64-3.2.100.zip"
$pgsqlDownloadUrl = "https://get.enterprisedb.com/postgresql/postgresql-16.2-1-windows-x64-binaries.zip"
$redisZipFile = Join-Path $localEnvDir "redis.zip"
$pgsqlZipFile = Join-Path $localEnvDir "pgsql.zip"

# สร้างโครงสร้างไดเรกทอรี
Write-Host "เริ่มต้นการติดตั้งสภาพแวดล้อมการพัฒนาเฉพาะเครื่อง..." -ForegroundColor Cyan
if (-not (Test-Path $localEnvDir)) {
    New-Item -ItemType Directory -Path $localEnvDir | Out-Null
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

# การกำหนดค่าฐานข้อมูล
DATABASE_URL=postgres://postgres:password@localhost:5432/price_alert_db

# การกำหนดค่า Redis
REDIS_URL=redis://localhost:6379

# ใส่ค่า Telegram Bot Token ของคุณที่นี่
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
"@ | Out-File -FilePath $envFile -Encoding utf8
    Write-Host "สร้างไฟล์ .env แล้ว" -ForegroundColor Green
}

# ติดตั้ง Redis
Write-Host "เริ่มการติดตั้ง Redis..." -ForegroundColor Cyan
if (-not (Test-Path $redisDir)) {
    New-Item -ItemType Directory -Path $redisDir | Out-Null
    DownloadAndExtract -url $redisDownloadUrl -zipFile $redisZipFile -extractPath $redisDir
    
    # สร้างไฟล์คอนฟิก Redis
    $redisConfigFile = Join-Path $redisDir "redis.windows.conf"
    
    # สร้าง Redis Windows Service
    $redisServerExe = Join-Path $redisDir "redis-server.exe"
    
    Write-Host "กำลังสร้างบริการ Redis..." -ForegroundColor Yellow
    try {
        Start-Process -FilePath $redisServerExe -ArgumentList "--service-install $redisConfigFile --loglevel verbose --service-name Redis" -Wait -NoNewWindow
        Start-Process -FilePath sc.exe -ArgumentList "start Redis" -Wait -NoNewWindow
        Write-Host "บริการ Redis ติดตั้งและเริ่มต้นแล้ว" -ForegroundColor Green
    }
    catch {
        Write-Host "ไม่สามารถติดตั้งบริการ Redis: $_" -ForegroundColor Red
    }
    
    Remove-Item $redisZipFile -Force
}
else {
    Write-Host "Redis ถูกติดตั้งอยู่แล้ว" -ForegroundColor Green
}

# ติดตั้ง PostgreSQL
Write-Host "เริ่มการติดตั้ง PostgreSQL..." -ForegroundColor Cyan
if (-not (Test-Path $pgsqlDir)) {
    New-Item -ItemType Directory -Path $pgsqlDir | Out-Null
    DownloadAndExtract -url $pgsqlDownloadUrl -zipFile $pgsqlZipFile -extractPath $pgsqlDir
    
    # สร้างไดเรกทอรีข้อมูล
    $dataDir = Join-Path $pgsqlDir "data"
    if (-not (Test-Path $dataDir)) {
        New-Item -ItemType Directory -Path $dataDir | Out-Null
    }
    
    # กำหนดค่าและเริ่มต้น PostgreSQL
    $binDir = Join-Path $pgsqlDir "bin"
    $initdbExe = Join-Path $binDir "initdb.exe"
    $pgctlExe = Join-Path $binDir "pg_ctl.exe"
    
    Write-Host "กำลังสร้างคลัสเตอร์ฐานข้อมูล..." -ForegroundColor Yellow
    try {
        # เริ่มต้นฐานข้อมูล
        Start-Process -FilePath $initdbExe -ArgumentList "-D `"$dataDir`" -U postgres -E UTF8 -A trust" -Wait -NoNewWindow
        
        # สร้างบริการ PostgreSQL
        Start-Process -FilePath $pgctlExe -ArgumentList "register -N PostgreSQL -D `"$dataDir`"" -Wait -NoNewWindow
        Start-Process -FilePath sc.exe -ArgumentList "start PostgreSQL" -Wait -NoNewWindow
        
        # รอให้เซิร์ฟเวอร์เริ่มต้น
        Start-Sleep -Seconds 5
        
        # สร้างฐานข้อมูล
        $psqlExe = Join-Path $binDir "psql.exe"
        @"
CREATE DATABASE price_alert_db;
"@ | Out-File -FilePath "$localEnvDir\create_db.sql" -Encoding utf8

        Start-Process -FilePath $psqlExe -ArgumentList "-U postgres -f `"$localEnvDir\create_db.sql`"" -Wait -NoNewWindow
        
        # นำเข้าโครงสร้างฐานข้อมูล
        $initSqlFile = Join-Path $workingDirectory "sql\init.sql"
        Start-Process -FilePath $psqlExe -ArgumentList "-U postgres -d price_alert_db -f `"$initSqlFile`"" -Wait -NoNewWindow
        
        Write-Host "บริการ PostgreSQL ติดตั้งและเริ่มต้นแล้ว" -ForegroundColor Green
    }
    catch {
        Write-Host "ไม่สามารถติดตั้งบริการ PostgreSQL: $_" -ForegroundColor Red
    }
    
    Remove-Item $pgsqlZipFile -Force
    if (Test-Path "$localEnvDir\create_db.sql") {
        Remove-Item "$localEnvDir\create_db.sql" -Force
    }
}
else {
    Write-Host "PostgreSQL ถูกติดตั้งอยู่แล้ว" -ForegroundColor Green
}

Write-Host ""
Write-Host "การติดตั้งเสร็จสิ้น!" -ForegroundColor Green
Write-Host "Redis กำลังทำงานที่ localhost:6379" -ForegroundColor Cyan
Write-Host "PostgreSQL กำลังทำงานที่ localhost:5432 (ชื่อผู้ใช้: postgres, ชื่อฐานข้อมูล: price_alert_db)" -ForegroundColor Cyan
Write-Host ""
Write-Host "คุณสามารถเริ่มต้นแอปพลิเคชันด้วยคำสั่ง:" -ForegroundColor Yellow
Write-Host "    npm install" -ForegroundColor White
Write-Host "    npm run dev" -ForegroundColor White
