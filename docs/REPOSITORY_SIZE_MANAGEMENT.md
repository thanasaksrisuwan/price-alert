# คู่มือการจัดการขนาด GitHub Repository

GitHub มีคำแนะนำให้จำกัดขนาด repository ไม่เกิน 100MB เพื่อเพิ่มประสิทธิภาพในการโคลนและใช้งาน หากขนาดเกิน GitHub อาจจะปฏิเสธการ push หรือจำกัดการใช้งาน

## การตรวจสอบขนาด Repository

ใช้คำสั่งต่อไปนี้ในเทอร์มินัลเพื่อตรวจสอบขนาดปัจจุบันของ repository:

```powershell
# PowerShell / Windows
git count-objects -vH
```

```bash
# Bash / Linux / macOS
git count-objects -vH
```

ค่า `size-pack` แสดงขนาดของ repository ทั้งหมด

## การค้นหาไฟล์ขนาดใหญ่

โปรเจกต์นี้มีสคริปต์สำหรับค้นหาและวิเคราะห์ไฟล์ขนาดใหญ่:

```powershell
# PowerShell / Windows
./analyze-repo-size.ps1
```

```bash
# Bash / Linux / macOS
chmod +x ./analyze-repo-size.sh
./analyze-repo-size.sh
```

## สาเหตุหลักของ Repository ขนาดใหญ่

1. **ไฟล์ไบนารีใน portable-env**
   - ไฟล์ PostgreSQL และ Redis ใน `portable-env/` 
   - โดยเฉพาะโฟลเดอร์ `portable-env/pgsql/bin/`, `portable-env/pgsql/lib/` และอื่นๆ

2. **ไฟล์ที่มีการเปลี่ยนแปลงบ่อยหรือขนาดใหญ่**
   - ไฟล์บันทึก (log files)
   - ไฟล์ข้อมูลฐานข้อมูล
   - ไฟล์ชั่วคราว (temporary files)

3. **ไฟล์เก่าที่ถูก commit ไว้ใน Git history**
   - แม้ไฟล์จะถูกลบไปแล้ว แต่ยังคงอยู่ใน history

## วิธีแก้ไขปัญหา

### 1. ตรวจสอบและปรับปรุง .gitignore

ตรวจสอบว่าไฟล์ `.gitignore` ได้ระบุไฟล์และโฟลเดอร์ต่อไปนี้:

```
# ไฟล์พกพา PostgreSQL
portable-env/pgsql/**
!portable-env/pgsql/data/pg_hba.conf
!portable-env/pgsql/data/pg_ident.conf
!portable-env/pgsql/data/postgresql.conf
!portable-env/pgsql/data/postgresql.auto.conf

# ไฟล์พกพา Redis
portable-env/redis/**
!portable-env/redis/redis.portable.conf
!portable-env/redis/redis.windows.conf
!portable-env/redis/redis.windows-service.conf
```

### 2. ทำความสะอาด Git History

หากคุณมีไฟล์ขนาดใหญ่ที่ถูก commit ไปแล้วในอดีต ให้ใช้สคริปต์ทำความสะอาดที่เตรียมไว้:

```powershell
# PowerShell / Windows
./cleanup-git-history.ps1
```

```bash
# Bash / Linux / macOS
chmod +x ./cleanup-git-history.sh
./cleanup-git-history.sh
```

### 3. แนวทางปฏิบัติที่ดี

- **หลีกเลี่ยงการ commit ไฟล์ไบนารี**: ใช้สคริปต์ติดตั้งที่จะดาวน์โหลดไฟล์เหล่านี้ระหว่างการติดตั้งแทน
- **แยกไฟล์ขนาดใหญ่**: เก็บแยกใน cloud storage หรือ artifact repository
- **ใช้ Git LFS**: สำหรับไฟล์ขนาดใหญ่ที่จำเป็นต้องติดตาม
- **ทำการ cleanup เป็นประจำ**: ใช้ `git gc` และสคริปต์ทำความสะอาดตามกำหนดเวลา

### 4. การใช้ Git LFS (Large File Storage)

หากคุณจำเป็นต้องติดตามไฟล์ขนาดใหญ่ใน repository ให้พิจารณาใช้ Git LFS:

1. ติดตั้ง Git LFS:
   ```
   git lfs install
   ```

2. ระบุประเภทไฟล์ที่ต้องการติดตามด้วย LFS:
   ```
   git lfs track "*.psd"
   git lfs track "*.zip"
   ```

3. Commit ไฟล์ .gitattributes ที่มีการเปลี่ยนแปลง:
   ```
   git add .gitattributes
   git commit -m "Configure Git LFS tracking"
   ```

4. เพิ่มและ commit ไฟล์ขนาดใหญ่ตามปกติ:
   ```
   git add large_file.psd
   git commit -m "Add large design file"
   ```

## หมายเหตุสำคัญ:

การล้าง Git history ด้วย `git push --force` จะทำให้ประวัติการ commit เปลี่ยนแปลง ซึ่งจะส่งผลกระทบต่อเพื่อนร่วมทีมที่ใช้ repository เดียวกัน ควรแจ้งทีมทั้งหมดก่อนดำเนินการ และให้ทุกคนทำการ clone repository ใหม่หลังจากที่มีการล้าง history
