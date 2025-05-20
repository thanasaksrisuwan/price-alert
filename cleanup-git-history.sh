#!/bin/bash
# cleanup-git-history.sh
# สคริปต์สำหรับทำความสะอาดไฟล์ขนาดใหญ่ที่ไม่จำเป็นออกจาก Git history

# คำเตือน: สคริปต์นี้จะแก้ไข Git history ควรทำการ backup ก่อนใช้งาน
echo "คำเตือน: สคริปต์นี้จะทำการแก้ไขประวัติ Git ของคุณ"
echo "กรุณาสำรองข้อมูลหรือ push โค้ดไปยัง branch ใหม่ก่อนดำเนินการต่อ"
echo "คุณต้องการดำเนินการต่อหรือไม่? (y/n)"
read confirmation

if [ "$confirmation" != "y" ]; then
    echo "ยกเลิกการดำเนินการ"
    exit 0
fi

# ติดตั้ง BFG Repo Cleaner ถ้าไม่มี
BFG_VERSION="1.14.0"
BFG_JAR_NAME="bfg-$BFG_VERSION.jar"

if [ ! -f "$BFG_JAR_NAME" ]; then
    echo "กำลังดาวน์โหลด BFG Repo Cleaner..."
    curl -L "https://repo1.maven.org/maven2/com/madgag/bfg/$BFG_VERSION/bfg-$BFG_VERSION.jar" -o "$BFG_JAR_NAME"
fi

# ตรวจสอบว่ามี Java หรือไม่
if ! command -v java &> /dev/null; then
    echo "ไม่พบ Java กรุณาติดตั้ง Java Runtime Environment (JRE) ก่อนดำเนินการต่อ"
    exit 1
fi

# สร้าง mirror ของ repository
echo "กำลังสร้าง mirror ของ repository..."
REPO_PATH=$(pwd)
MIRROR_PATH="${REPO_PATH}-mirror"
git clone --mirror "$REPO_PATH" "$MIRROR_PATH"

# เข้าไปยัง mirror repository
pushd "$MIRROR_PATH"

# ใช้ BFG ลบไฟล์ขนาดใหญ่
echo "กำลังลบไฟล์ขนาดใหญ่ออกจาก history..."
java -jar "../$BFG_JAR_NAME" --strip-blobs-bigger-than 10M .
java -jar "../$BFG_JAR_NAME" --delete-folders "portable-env/pgsql" --delete-folders "portable-env/redis/logs" .

# ทำความสะอาด repository
echo "กำลังทำความสะอาด repository..."
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# กลับไปยัง repository หลัก
popd

echo "กรุณาดำเนินการต่อไปนี้เพื่อนำการเปลี่ยนแปลงไปใช้:"
echo "1. สำรองข้อมูลโครงการที่สำคัญ"
echo "2. ลบ repository ปัจจุบันและ clone จาก mirror:"
echo "   cd .."
echo "   mv price-alert price-alert-old"
echo "   git clone $MIRROR_PATH price-alert"
echo "   cd price-alert"
echo "3. ทำการ force push ไปยัง remote (ถ้ามี):"
echo "   git push --force"
echo ""
echo "หมายเหตุ: การทำ force push จะแก้ไข history ทั้งหมดของ repository"
echo "ผู้ที่ทำงานร่วมกันจะต้องทำการ clone ใหม่หรือ reset repository ของตนเอง"
