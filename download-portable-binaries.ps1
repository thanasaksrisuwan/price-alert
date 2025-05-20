# download-portable-binaries.ps1
# สคริปต์สำหรับดาวน์โหลด PostgreSQL และ Redis แบบพกพา
# แทนการเก็บไฟล์ขนาดใหญ่ใน Git repository

# กำหนดเวอร์ชัน
$POSTGRESQL_VERSION = "15.4-1"
$REDIS_VERSION = "5.0.14.1"

# สร้างโฟลเดอร์สำหรับเก็บไฟล์ชั่วคราว
$TEMP_DIR = ".\portable-env\temp"
if (-not (Test-Path $TEMP_DIR)) {
    New-Item -ItemType Directory -Path $TEMP_DIR -Force | Out-Null
}

# สร้างโฟลเดอร์สำหรับ PostgreSQL
$PGSQL_DIR = ".\portable-env\pgsql"
if (-not (Test-Path $PGSQL_DIR)) {
    New-Item -ItemType Directory -Path $PGSQL_DIR -Force | Out-Null
}

# สร้างโฟลเดอร์สำหรับ Redis
$REDIS_DIR = ".\portable-env\redis"
if (-not (Test-Path $REDIS_DIR)) {
    New-Item -ItemType Directory -Path $REDIS_DIR -Force | Out-Null
}

# แสดง header
function Write-Header {
    param (
        [string]$text
    )
    
    Write-Host "`n===== $text =====" -ForegroundColor Cyan
}

# ดาวน์โหลดไฟล์
function Download-File {
    param (
        [string]$url,
        [string]$destination
    )
    
    Write-Host "กำลังดาวน์โหลดจาก $url" -ForegroundColor Yellow
    try {
        Invoke-WebRequest -Uri $url -OutFile $destination -UseBasicParsing
        Write-Host "ดาวน์โหลดสำเร็จ: $destination" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "เกิดข้อผิดพลาดในการดาวน์โหลด: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# แตกไฟล์ ZIP
function Extract-ZipFile {
    param (
        [string]$zipFile,
        [string]$destination
    )
    
    Write-Host "กำลังแตกไฟล์ $zipFile..." -ForegroundColor Yellow
    try {
        Expand-Archive -Path $zipFile -DestinationPath $destination -Force
        Write-Host "แตกไฟล์สำเร็จไปยัง $destination" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "เกิดข้อผิดพลาดในการแตกไฟล์: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# ดาวน์โหลดและติดตั้ง PostgreSQL
function Download-PostgreSQL {
    Write-Header "ดาวน์โหลดและติดตั้ง PostgreSQL แบบพกพา"
    
    $zipFile = "$TEMP_DIR\postgresql-$POSTGRESQL_VERSION-windows-x64-binaries.zip"
    $downloadUrl = "https://get.enterprisedb.com/postgresql/postgresql-$POSTGRESQL_VERSION-windows-x64-binaries.zip"
    
    # ดาวน์โหลด PostgreSQL
    if (-not (Download-File -url $downloadUrl -destination $zipFile)) {
        return $false
    }
    
    # แตกไฟล์ PostgreSQL
    if (-not (Extract-ZipFile -zipFile $zipFile -destination $PGSQL_DIR)) {
        return $false
    }
    
    # ย้ายไฟล์จาก subfolder มาที่ $PGSQL_DIR
    $extractedFolder = Get-ChildItem -Path $PGSQL_DIR -Directory | Select-Object -First 1
    if ($extractedFolder) {
        Write-Host "กำลังย้ายไฟล์จาก $($extractedFolder.FullName) ไปที่ $PGSQL_DIR"
        Get-ChildItem -Path $extractedFolder.FullName | Move-Item -Destination $PGSQL_DIR -Force
        Remove-Item -Path $extractedFolder.FullName -Recurse -Force
    }
    
    # สร้างโฟลเดอร์ data
    $dataDir = "$PGSQL_DIR\data"
    if (-not (Test-Path $dataDir)) {
        New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    }
    
    return $true
}

# ดาวน์โหลดและติดตั้ง Redis
function Download-Redis {
    Write-Header "ดาวน์โหลดและติดตั้ง Redis แบบพกพา"
    
    $zipFile = "$TEMP_DIR\Redis-x64-$REDIS_VERSION.zip"
    $downloadUrl = "https://github.com/microsoftarchive/redis/releases/download/win-$REDIS_VERSION/Redis-x64-$REDIS_VERSION.zip"
    
    # ดาวน์โหลด Redis
    if (-not (Download-File -url $downloadUrl -destination $zipFile)) {
        return $false
    }
    
    # แตกไฟล์ Redis
    if (-not (Extract-ZipFile -zipFile $zipFile -destination $REDIS_DIR)) {
        return $false
    }
    
    # สร้างไฟล์ config หากยังไม่มี
    $configFile = "$REDIS_DIR\redis.portable.conf"
    if (-not (Test-Path $configFile)) {
        @"
# Redis แบบพกพาสำหรับการพัฒนา
port 6380
loglevel notice
logfile "logs/redis_portable.log"
dir ./
dbfilename dump.rdb
appendonly no
"@ | Out-File -FilePath $configFile -Encoding utf8
    }
    
    # สร้างโฟลเดอร์ logs
    $logsDir = "$REDIS_DIR\logs"
    if (-not (Test-Path $logsDir)) {
        New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
    }
    
    return $true
}

# ลบไฟล์ชั่วคราว
function Clean-TempFiles {
    Write-Header "ทำความสะอาดไฟล์ชั่วคราว"
    
    if (Test-Path $TEMP_DIR) {
        Remove-Item -Path $TEMP_DIR -Recurse -Force
        Write-Host "ลบโฟลเดอร์ชั่วคราวแล้ว" -ForegroundColor Green
    }
}

# ฟังก์ชันหลัก
function Main {
    Write-Host "==================================================" -ForegroundColor Blue
    Write-Host "    ดาวน์โหลด PostgreSQL และ Redis แบบพกพา" -ForegroundColor Blue
    Write-Host "==================================================" -ForegroundColor Blue
    
    $success = $true
    
    # ดาวน์โหลด PostgreSQL
    if (-not (Download-PostgreSQL)) {
        Write-Host "ไม่สามารถดาวน์โหลดหรือติดตั้ง PostgreSQL ได้" -ForegroundColor Red
        $success = $false
    }
    
    # ดาวน์โหลด Redis
    if (-not (Download-Redis)) {
        Write-Host "ไม่สามารถดาวน์โหลดหรือติดตั้ง Redis ได้" -ForegroundColor Red
        $success = $false
    }
    
    # ทำความสะอาด
    Clean-TempFiles
    
    if ($success) {
        Write-Host "`nการดาวน์โหลดและติดตั้งเสร็จสมบูรณ์!" -ForegroundColor Green
        Write-Host "คุณสามารถเริ่มต้นบริการแบบพกพาได้ด้วยคำสั่ง: .\portable-env.ps1 start" -ForegroundColor Cyan
    } else {
        Write-Host "`nเกิดข้อผิดพลาดระหว่างการดาวน์โหลดหรือติดตั้ง โปรดตรวจสอบข้อความข้างต้น" -ForegroundColor Red
    }
}

# เริ่มต้นทำงาน
Main
