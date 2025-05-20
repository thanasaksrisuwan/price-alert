# cleanup-git-history.ps1
# สคริปต์สำหรับทำความสะอาดไฟล์ขนาดใหญ่ที่ไม่จำเป็นออกจาก Git history

# คำเตือน: สคริปต์นี้จะแก้ไข Git history ควรทำการ backup ก่อนใช้งาน
Write-Host "คำเตือน: สคริปต์นี้จะทำการแก้ไขประวัติ Git ของคุณ"
Write-Host "กรุณาสำรองข้อมูลหรือ push โค้ดไปยัง branch ใหม่ก่อนดำเนินการต่อ"
Write-Host "คุณต้องการดำเนินการต่อหรือไม่? (y/n)"
$confirmation = Read-Host

if ($confirmation -ne "y") {
    Write-Host "ยกเลิกการดำเนินการ"
    exit
}

# ติดตั้ง BFG Repo Cleaner ถ้าไม่มี
$bfgVersion = "1.14.0"
$bfgJarName = "bfg-$bfgVersion.jar"

if (-not (Test-Path $bfgJarName)) {
    Write-Host "กำลังดาวน์โหลด BFG Repo Cleaner..."
    Invoke-WebRequest -Uri "https://repo1.maven.org/maven2/com/madgag/bfg/$bfgVersion/bfg-$bfgVersion.jar" -OutFile $bfgJarName
}

# ตรวจสอบว่ามี Java หรือไม่
try {
    java -version
    Write-Host "พบ Java แล้ว"
} catch {
    Write-Host "ไม่พบ Java กรุณาติดตั้ง Java Runtime Environment (JRE) ก่อนดำเนินการต่อ"
    exit
}

# สร้าง mirror ของ repository
Write-Host "กำลังสร้าง mirror ของ repository..."
$repoPath = Get-Location
$mirrorPath = "$repoPath-mirror"
git clone --mirror $repoPath $mirrorPath

# เข้าไปยัง mirror repository
Push-Location $mirrorPath

# ใช้ BFG ลบไฟล์ขนาดใหญ่
Write-Host "กำลังลบไฟล์ขนาดใหญ่ออกจาก history..."
java -jar ../$bfgJarName --strip-blobs-bigger-than 10M .
java -jar ../$bfgJarName --delete-folders "portable-env/pgsql" --delete-folders "portable-env/redis/logs" .

# ทำความสะอาด repository
Write-Host "กำลังทำความสะอาด repository..."
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# กลับไปยัง repository หลัก
Pop-Location

Write-Host "กรุณาดำเนินการต่อไปนี้เพื่อนำการเปลี่ยนแปลงไปใช้:"
Write-Host "1. สำรองข้อมูลโครงการที่สำคัญ"
Write-Host "2. ลบ repository ปัจจุบันและ clone จาก mirror:"
Write-Host "   cd .."
Write-Host "   mv price-alert price-alert-old"
Write-Host "   git clone $mirrorPath price-alert"
Write-Host "   cd price-alert"
Write-Host "3. ทำการ force push ไปยัง remote (ถ้ามี):"
Write-Host "   git push --force"
Write-Host ""
Write-Host "หมายเหตุ: การทำ force push จะแก้ไข history ทั้งหมดของ repository"
Write-Host "ผู้ที่ทำงานร่วมกันจะต้องทำการ clone ใหม่หรือ reset repository ของตนเอง"
