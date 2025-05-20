#!/bin/bash
# analyze-repo-size.sh
# สคริปต์สำหรับวิเคราะห์ขนาดไฟล์ใน Git repository และค้นหาไฟล์ขนาดใหญ่
# โดยรายงานตามลำดับขนาดพร้อมแนะนำวิธีจัดการ

# ตั้งค่าสีสำหรับการแสดงผล
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'
BLUE='\033[0;34m'
RESET='\033[0m'

# ตรวจสอบขนาด repository โดยรวม
show_repo_stats() {
    echo -e "${CYAN}====== ข้อมูล Git Repository =====${RESET}"
    
    git_stats=$(git count-objects -vH)
    
    # แสดงขนาดรวม
    repo_size=$(echo "$git_stats" | grep "size-pack:" | sed 's/.*size-pack: *//')
    echo -e "ขนาด Repository รวม: ${YELLOW}$repo_size${RESET}"
    
    echo ""
}

# หาไฟล์ที่มีขนาดใหญ่ที่สุดใน Git history
find_large_files() {
    local count=${1:-20}
    local size_threshold_mb=${2:-1}  # MB
    
    echo -e "${CYAN}====== ค้นหาไฟล์ขนาดใหญ่ใน Git history ======${RESET}"
    echo -e "${YELLOW}กำลังวิเคราะห์ commit และ blob ขนาดใหญ่...${RESET}"
    
    # แปลง MB เป็น bytes
    local threshold_bytes=$((size_threshold_mb * 1048576))
    
    echo -e "${CYAN}ไฟล์ขนาดใหญ่ที่สุด $count ไฟล์:${RESET}"
    
    # คำสั่งค้นหาไฟล์ขนาดใหญ่
    git rev-list --objects --all |
        grep -v "^[[:space:]]\+$" |
        awk '{print $1}' |
        while read -r hash; do
            git cat-file -p "$hash" 2>/dev/null >/dev/null || continue
            size=$(git cat-file -s "$hash")
            if [ "$size" -ge "$threshold_bytes" ]; then
                path=$(git rev-list --objects --all | grep "^$hash" | cut -d' ' -f2-)
                size_mb=$(echo "scale=2; $size / 1048576" | bc)
                echo "$size_mb $hash $path"
            fi
        done |
        sort -nr |
        head -n "$count" |
        awk '{printf "%-60s %8.2f MB\n", $3, $1}'
    
    echo ""
}

# ตรวจสอบไฟล์ที่ไม่ได้อยู่ใน .gitignore และมีขนาดใหญ่
find_large_unignored_files() {
    local count=${1:-20}
    local size_threshold_kb=${2:-500}  # KB
    
    echo -e "${CYAN}====== ไฟล์ขนาดใหญ่ที่ไม่ได้ถูกละเว้น (.gitignore) ======${RESET}"
    echo -e "${YELLOW}กำลังค้นหาไฟล์ใน workspace ปัจจุบัน...${RESET}"
    
    # แปลง KB เป็น bytes
    local threshold_bytes=$((size_threshold_kb * 1024))
    
    # หาไฟล์ขนาดใหญ่ที่ไม่ได้อยู่ใน .gitignore
    find . -type f -not -path "./.git/*" -print0 |
        while IFS= read -r -d $'\0' file; do
            if ! git check-ignore -q "$file"; then
                size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null)
                if [ "$size" -ge "$threshold_bytes" ]; then
                    size_kb=$(echo "scale=2; $size / 1024" | bc)
                    echo "$size_kb $file"
                fi
            fi
        done |
        sort -nr |
        head -n "$count" |
        awk '{printf "%-60s %8.2f KB\n", $2, $1}'
    
    echo ""
}

# แสดงคำแนะนำในการแก้ปัญหา
show_recommendations() {
    echo -e "${GREEN}====== คำแนะนำในการลดขนาด Repository ======${RESET}"
    
    echo -e "${YELLOW}1. สำหรับไฟล์ขนาดใหญ่ที่มีอยู่แล้วใน Git history:${RESET}"
    echo "   - รันสคริปต์ 'cleanup-git-history.sh' เพื่อทำความสะอาด history"
    echo "   - สำหรับไฟล์ขนาดใหญ่ที่จำเป็นต้องใช้ ให้ใช้ Git LFS"
    
    echo -e "${YELLOW}2. สำหรับไฟล์ที่มีการเปลี่ยนแปลงบ่อย:${RESET}"
    echo "   - เพิ่มเข้าไปใน .gitignore"
    echo "   - หากเป็นไฟล์การตั้งค่า ให้สร้างเป็น .example และเพิ่มไฟล์จริงใน .gitignore"
    
    echo -e "${YELLOW}3. สำหรับ portable-env:${RESET}"
    echo "   - ตรวจสอบว่าไดเรกทอรี 'portable-env/pgsql/bin', 'portable-env/pgsql/lib',"
    echo "     และไฟล์ไบนารีอื่นๆ ได้รับการเพิ่มใน .gitignore อย่างถูกต้อง"

    echo -e "${YELLOW}4. การปรับใช้งานแอป:${RESET}"
    echo "   - กำหนดสคริปต์ติดตั้งให้ดาวน์โหลดไฟล์ขนาดใหญ่จากแหล่งจัดเก็บอื่น (เช่น CDN)"
    echo "   - ใช้ Docker สำหรับเตรียมสภาพแวดล้อมแทนการเก็บไฟล์ไบนารีใน repository"

    echo ""
    echo -e "${MAGENTA}หมายเหตุ: หลังจากลบไฟล์ขนาดใหญ่ออกจาก Git history คุณจำเป็นต้องรันคำสั่ง:${RESET}"
    echo -e "${RED}git push --force${RESET}"
    echo -e "${MAGENTA}ซึ่งมีผลกระทบกับผู้อื่นที่ร่วมพัฒนา ควรแจ้งให้ทุกคนทราบก่อนดำเนินการ${RESET}"
}

# ฟังก์ชันหลักที่จะรัน
start_analysis() {
    # แสดงส่วนหัว
    echo -e "${BLUE}==================================================${RESET}"
    echo -e "${BLUE}    เครื่องมือวิเคราะห์ขนาด Git Repository${RESET}"
    echo -e "${BLUE}==================================================${RESET}"
    echo ""
    
    # แสดงสถิติโดยรวม
    show_repo_stats
    
    # ค้นหาไฟล์ขนาดใหญ่ใน Git history
    find_large_files 15 1
    
    # ค้นหาไฟล์ขนาดใหญ่ที่ไม่ได้อยู่ใน .gitignore
    find_large_unignored_files 15 250
    
    # แสดงคำแนะนำ
    show_recommendations
}

# ตรวจสอบว่ามี git หรือไม่
if ! command -v git &>/dev/null; then
    echo "ไม่พบคำสั่ง git กรุณาติดตั้ง Git ก่อนใช้งานสคริปต์นี้"
    exit 1
fi

# ตรวจสอบว่าเป็น git repository หรือไม่
if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    echo "ไม่ได้อยู่ใน Git repository กรุณารันสคริปต์นี้ในไดเรกทอรีที่เป็น Git repository"
    exit 1
fi

# เริ่มการวิเคราะห์
start_analysis
