# analyze-repo-size.ps1
# สคริปต์สำหรับวิเคราะห์ขนาดไฟล์ใน Git repository และค้นหาไฟล์ขนาดใหญ่
# โดยรายงานตามลำดับขนาดพร้อมแนะนำวิธีจัดการ

# ตรวจสอบขนาด repository โดยรวม
function Show-RepoStats {
    Write-Host "====== ข้อมูล Git Repository =====" -ForegroundColor Cyan
    
    $stats = git count-objects -vH
    $statsLines = $stats -split "`n"
    
    foreach ($line in $statsLines) {
        if ($line -match "size-pack:") {
            $size = $line -replace ".*size-pack:\s+", ""
            Write-Host "ขนาด Repository รวม: " -NoNewline
            Write-Host "$size" -ForegroundColor Yellow
        }
    }
    
    Write-Host ""
}

# หาไฟล์ที่มีขนาดใหญ่ที่สุดใน Git history
function Find-LargeFiles {
    param (
        [int]$Count = 20,  # จำนวนไฟล์ที่จะแสดง
        [int]$SizeThreshold = 1  # ขนาดไฟล์ที่มากกว่า (MB)
    )
    
    Write-Host "====== ค้นหาไฟล์ขนาดใหญ่ใน Git history ======" -ForegroundColor Cyan
    Write-Host "กำลังวิเคราะห์ commit และ blob ขนาดใหญ่..." -ForegroundColor Yellow
    
    # ค้นหาไฟล์ขนาดใหญ่ใน history โดยใช้ git rev-list
    Write-Host "ไฟล์ขนาดใหญ่ที่สุด $Count ไฟล์:" -ForegroundColor Cyan
    
    # ใช้ git แทน external tool เพื่อหลีกเลี่ยงปัญหา xargs บน Windows
    $largeObjects = git rev-list --objects --all |
        ForEach-Object {
            $hash, $path = $_ -split "\s+", 2
            if ($path) {
                $size = git cat-file -s $hash
                # แปลงเป็น MB
                $sizeMB = [math]::Round($size / 1MB, 2)
                if ($sizeMB -ge $SizeThreshold) {
                    [PSCustomObject]@{
                        Path = $path
                        Size = $size
                        SizeMB = $sizeMB
                    }
                }
            }
        } | Sort-Object -Property Size -Descending | Select-Object -First $Count
    
    # แสดงผลในรูปแบบตาราง
    $largeObjects | Format-Table -AutoSize -Property Path, @{Name='Size (MB)'; Expression={$_.SizeMB}; Alignment='Right'}
    
    Write-Host ""
}

# ตรวจสอบไฟล์ที่ไม่ได้อยู่ใน .gitignore และมีขนาดใหญ่
function Find-LargeUnignoredFiles {
    param (
        [int]$Count = 20,
        [int]$SizeThresholdKB = 500  # ไฟล์ที่มีขนาด > 500KB
    )
    
    Write-Host "====== ไฟล์ขนาดใหญ่ที่ไม่ได้ถูกละเว้น (.gitignore) ======" -ForegroundColor Cyan
    Write-Host "กำลังค้นหาไฟล์ใน workspace ปัจจุบัน..." -ForegroundColor Yellow
    
    # หาไฟล์ทั้งหมดยกเว้นที่อยู่ใน .git
    $allFiles = Get-ChildItem -Recurse -File | Where-Object { $_.FullName -notmatch "\.git" }
    
    # กรองไฟล์ที่ไม่ได้อยู่ใน .gitignore และมีขนาดใหญ่
    $largeFiles = $allFiles | ForEach-Object {
        # ตรวจสอบว่าไฟล์นี้อยู่ใน .gitignore หรือไม่
        $isIgnored = git check-ignore -q $_.FullName
        
        if ($isIgnored -eq $false) {
            $sizeKB = [math]::Round($_.Length / 1KB, 2)
            if ($sizeKB -ge $SizeThresholdKB) {
                [PSCustomObject]@{
                    Path = $_.FullName.Replace((Get-Location).Path + "\", "")
                    Size = $_.Length
                    SizeKB = $sizeKB
                }
            }
        }
    } | Sort-Object -Property Size -Descending | Select-Object -First $Count
    
    # แสดงผล
    $largeFiles | Format-Table -AutoSize -Property Path, @{Name='Size (KB)'; Expression={$_.SizeKB}; Alignment='Right'}
    
    Write-Host ""
}

# แสดงคำแนะนำในการแก้ปัญหา
function Show-Recommendations {
    Write-Host "====== คำแนะนำในการลดขนาด Repository ======" -ForegroundColor Green
    
    Write-Host "1. สำหรับไฟล์ขนาดใหญ่ที่มีอยู่แล้วใน Git history:" -ForegroundColor Yellow
    Write-Host "   - รันสคริปต์ 'cleanup-git-history.ps1' เพื่อทำความสะอาด history"
    Write-Host "   - สำหรับไฟล์ขนาดใหญ่ที่จำเป็นต้องใช้ ให้ใช้ Git LFS"
    
    Write-Host "2. สำหรับไฟล์ที่มีการเปลี่ยนแปลงบ่อย:" -ForegroundColor Yellow
    Write-Host "   - เพิ่มเข้าไปใน .gitignore"
    Write-Host "   - หากเป็นไฟล์การตั้งค่า ให้สร้างเป็น .example และเพิ่มไฟล์จริงใน .gitignore"
    
    Write-Host "3. สำหรับ portable-env:" -ForegroundColor Yellow
    Write-Host "   - ตรวจสอบว่าไดเรกทอรี 'portable-env/pgsql/bin', 'portable-env/pgsql/lib',"
    Write-Host "     และไฟล์ไบนารีอื่นๆ ได้รับการเพิ่มใน .gitignore อย่างถูกต้อง"

    Write-Host "4. การปรับใช้งานแอป:" -ForegroundColor Yellow
    Write-Host "   - กำหนดสคริปต์ติดตั้งให้ดาวน์โหลดไฟล์ขนาดใหญ่จากแหล่งจัดเก็บอื่น (เช่น CDN)"
    Write-Host "   - ใช้ Docker สำหรับเตรียมสภาพแวดล้อมแทนการเก็บไฟล์ไบนารีใน repository"

    Write-Host ""
    Write-Host "หมายเหตุ: หลังจากลบไฟล์ขนาดใหญ่ออกจาก Git history คุณจำเป็นต้องรันคำสั่ง:" -ForegroundColor Magenta
    Write-Host "git push --force" -ForegroundColor Red
    Write-Host "ซึ่งมีผลกระทบกับผู้อื่นที่ร่วมพัฒนา ควรแจ้งให้ทุกคนทราบก่อนดำเนินการ" -ForegroundColor Magenta
}

# ฟังก์ชันหลักที่จะรัน
function Start-Analysis {
    # แสดงส่วนหัว
    Write-Host "==================================================" -ForegroundColor Blue
    Write-Host "    เครื่องมือวิเคราะห์ขนาด Git Repository" -ForegroundColor Blue
    Write-Host "==================================================" -ForegroundColor Blue
    Write-Host ""
    
    # แสดงสถิติโดยรวม
    Show-RepoStats
    
    # ค้นหาไฟล์ขนาดใหญ่ใน Git history
    Find-LargeFiles -Count 15 -SizeThreshold 1
    
    # ค้นหาไฟล์ขนาดใหญ่ที่ไม่ได้อยู่ใน .gitignore
    Find-LargeUnignoredFiles -Count 15 -SizeThresholdKB 250
    
    # แสดงคำแนะนำ
    Show-Recommendations
}

# เริ่มการวิเคราะห์
Start-Analysis
