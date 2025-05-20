# ตั้งค่าและติดตั้งสำหรับโปรเจค Price Alert บนวินโดวส์
# สคริปต์นี้ติดตั้ง PostgreSQL, Redis และตั้งค่า application

# ตั้งค่าพารามิเตอร์
$PG_VERSION = "15"
$REDIS_VERSION = "7.0.11"
$PG_DB_NAME = "price_alert_db"
$PG_USER = "postgres"
$PG_PASSWORD = "postgres"
$PORT = 3000

Write-Host "===== เริ่มการติดตั้งโปรเจค Price Alert =====" -ForegroundColor Cyan

# ตรวจสอบว่ามี Chocolatey ติดตั้งอยู่แล้วหรือไม่
if (-not(Get-Command choco -ErrorAction SilentlyContinue)) {
    Write-Host "กำลังติดตั้ง Chocolatey..." -ForegroundColor Yellow
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))
} else {
    Write-Host "Chocolatey ติดตั้งอยู่แล้ว" -ForegroundColor Green
}

# ติดตั้ง PostgreSQL ถ้ายังไม่ได้ติดตั้ง
if (-not(Get-Command psql -ErrorAction SilentlyContinue)) {
    Write-Host "กำลังติดตั้ง PostgreSQL $PG_VERSION..." -ForegroundColor Yellow
    choco install postgresql$PG_VERSION --params "/Password:$PG_PASSWORD" -y
    
    # เพิ่ม PostgreSQL ลงไปในตัวแปร PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    
    # รอเพื่อให้มั่นใจว่า PostgreSQL ทำงานแล้ว
    Start-Sleep -Seconds 5
    
    # สร้างฐานข้อมูล
    Write-Host "กำลังสร้างฐานข้อมูล $PG_DB_NAME..." -ForegroundColor Yellow
    $env:PGPASSWORD = $PG_PASSWORD
    psql -U $PG_USER -c "CREATE DATABASE $PG_DB_NAME;"
    
    # นำเข้าสคีมาฐานข้อมูล
    if (Test-Path -Path ".\sql\init.sql") {
        Write-Host "กำลังนำเข้าสคีมาฐานข้อมูล..." -ForegroundColor Yellow
        psql -U $PG_USER -d $PG_DB_NAME -f ".\sql\init.sql"
    } else {
        Write-Host "ไม่พบไฟล์ SQL schema (.\sql\init.sql)" -ForegroundColor Red
    }
} else {
    Write-Host "PostgreSQL ติดตั้งอยู่แล้ว" -ForegroundColor Green
    
    # ตรวจสอบว่าฐานข้อมูลมีอยู่แล้วหรือไม่
    $env:PGPASSWORD = $PG_PASSWORD
    $dbExists = psql -U $PG_USER -lqt | Select-String -Pattern "\s$PG_DB_NAME\s"
    
    if (-not $dbExists) {
        Write-Host "กำลังสร้างฐานข้อมูล $PG_DB_NAME..." -ForegroundColor Yellow
        psql -U $PG_USER -c "CREATE DATABASE $PG_DB_NAME;"
        
        # นำเข้าสคีมาฐานข้อมูล
        if (Test-Path -Path ".\sql\init.sql") {
            Write-Host "กำลังนำเข้าสคีมาฐานข้อมูล..." -ForegroundColor Yellow
            psql -U $PG_USER -d $PG_DB_NAME -f ".\sql\init.sql"
        }
    } else {
        Write-Host "ฐานข้อมูล $PG_DB_NAME มีอยู่แล้ว" -ForegroundColor Green
    }
}

# ติดตั้ง Redis ถ้ายังไม่ได้ติดตั้ง
$redisService = Get-Service -Name "Redis" -ErrorAction SilentlyContinue

if (-not $redisService) {
    Write-Host "กำลังติดตั้ง Redis..." -ForegroundColor Yellow
    choco install redis-64 -y
    
    # ตั้งค่า Redis ให้ทำงานเป็น service
    Write-Host "กำลังตั้งค่า Redis ให้ทำงานเป็น service..." -ForegroundColor Yellow
    redis-server --service-install
    redis-server --service-start
} else {
    Write-Host "Redis ติดตั้งอยู่แล้ว" -ForegroundColor Green
    
    # ตรวจสอบว่า Redis ทำงานอยู่หรือไม่
    $redisStatus = Get-Service -Name "Redis" | Select-Object -ExpandProperty Status
    
    if ($redisStatus -ne "Running") {
        Write-Host "กำลังเริ่มการทำงานของ Redis..." -ForegroundColor Yellow
        Start-Service -Name "Redis"
    }
}

# สร้างไฟล์ .env จาก .env.example ถ้ายังไม่มี
if (-not(Test-Path -Path ".\.env")) {
    if (Test-Path -Path ".\.env.example") {
        Write-Host "กำลังสร้างไฟล์ .env..." -ForegroundColor Yellow
        Copy-Item ".\.env.example" ".\.env"
        
        # แก้ไขการตั้งค่าฐานข้อมูลและ Redis
        (Get-Content -Path ".\.env") -Replace "DATABASE_URL=postgres://username:password@localhost:5432/crypto_price_alert", "DATABASE_URL=postgres://$PG_USER:$PG_PASSWORD@localhost:5432/$PG_DB_NAME" | Set-Content -Path ".\.env"
        (Get-Content -Path ".\.env") -Replace "REDIS_URL=redis://localhost:6379", "REDIS_URL=redis://localhost:6379/0" | Set-Content -Path ".\.env"
        
        Write-Host "ไฟล์ .env ถูกสร้างขึ้นแล้ว โปรดตรวจสอบและแก้ไขค่าตัวแปรอื่นๆ ตามความจำเป็น" -ForegroundColor Green
    } else {
        Write-Host "ไม่พบไฟล์ .env.example กรุณาสร้างไฟล์ .env ด้วยตัวเอง" -ForegroundColor Red
    }
} else {
    Write-Host "ไฟล์ .env มีอยู่แล้ว" -ForegroundColor Green
}

# ติดตั้ง dependencies ของ Node.js
Write-Host "กำลังติดตั้ง dependencies ของ Node.js..." -ForegroundColor Yellow
npm install

Write-Host "===== การติดตั้งเสร็จสิ้น =====" -ForegroundColor Cyan
Write-Host "`nวิธีการเริ่มใช้งานแอปพลิเคชัน:" -ForegroundColor White
Write-Host "1. ตรวจสอบการตั้งค่าในไฟล์ .env" -ForegroundColor White
Write-Host "2. รันคำสั่ง 'npm start' เพื่อเริ่มการทำงานของแอปพลิเคชัน" -ForegroundColor White
Write-Host "3. แอปพลิเคชันจะทำงานที่ http://localhost:$PORT" -ForegroundColor White