#!/bin/bash
# download-portable-binaries.sh
# สคริปต์สำหรับดาวน์โหลด PostgreSQL และ Redis แบบพกพา
# แทนการเก็บไฟล์ขนาดใหญ่ใน Git repository

# กำหนดเวอร์ชัน
POSTGRESQL_VERSION="15.4"
REDIS_VERSION="7.0.12"

# ตั้งค่าสีสำหรับการแสดงผล
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
RESET='\033[0m'

# สร้างโฟลเดอร์สำหรับเก็บไฟล์ชั่วคราว
TEMP_DIR="./portable-env/temp"
mkdir -p "$TEMP_DIR"

# สร้างโฟลเดอร์สำหรับ PostgreSQL
PGSQL_DIR="./portable-env/pgsql"
mkdir -p "$PGSQL_DIR"

# สร้างโฟลเดอร์สำหรับ Redis
REDIS_DIR="./portable-env/redis"
mkdir -p "$REDIS_DIR"

# แสดง header
write_header() {
    echo -e "\n${CYAN}===== $1 =====${RESET}"
}

# ดาวน์โหลดไฟล์
download_file() {
    local url="$1"
    local destination="$2"
    
    echo -e "${YELLOW}กำลังดาวน์โหลดจาก $url${RESET}"
    if command -v curl &>/dev/null; then
        if curl -L -o "$destination" "$url"; then
            echo -e "${GREEN}ดาวน์โหลดสำเร็จ: $destination${RESET}"
            return 0
        else
            echo -e "${RED}เกิดข้อผิดพลาดในการดาวน์โหลด${RESET}"
            return 1
        fi
    elif command -v wget &>/dev/null; then
        if wget -O "$destination" "$url"; then
            echo -e "${GREEN}ดาวน์โหลดสำเร็จ: $destination${RESET}"
            return 0
        else
            echo -e "${RED}เกิดข้อผิดพลาดในการดาวน์โหลด${RESET}"
            return 1
        fi
    else
        echo -e "${RED}ต้องติดตั้ง curl หรือ wget ก่อน${RESET}"
        return 1
    fi
}

# แตกไฟล์
extract_archive() {
    local archive="$1"
    local destination="$2"
    
    echo -e "${YELLOW}กำลังแตกไฟล์ $archive...${RESET}"
    
    # ตรวจสอบประเภทไฟล์และแตกไฟล์ตามนั้น
    if [[ "$archive" == *.tar.gz ]] || [[ "$archive" == *.tgz ]]; then
        if tar -xzf "$archive" -C "$destination"; then
            echo -e "${GREEN}แตกไฟล์สำเร็จไปยัง $destination${RESET}"
            return 0
        else
            echo -e "${RED}เกิดข้อผิดพลาดในการแตกไฟล์${RESET}"
            return 1
        fi
    elif [[ "$archive" == *.zip ]]; then
        if unzip -q -o "$archive" -d "$destination"; then
            echo -e "${GREEN}แตกไฟล์สำเร็จไปยัง $destination${RESET}"
            return 0
        else
            echo -e "${RED}เกิดข้อผิดพลาดในการแตกไฟล์${RESET}"
            return 1
        fi
    else
        echo -e "${RED}ไม่รองรับประเภทไฟล์ $archive${RESET}"
        return 1
    fi
}

# ดาวน์โหลดและติดตั้ง PostgreSQL
download_postgresql() {
    write_header "ดาวน์โหลดและติดตั้ง PostgreSQL แบบพกพา"
    
    local os_type="$(uname -s)"
    local archive_file=""
    local download_url=""
    
    if [[ "$os_type" == "Darwin" ]]; then
        # macOS
        archive_file="$TEMP_DIR/postgresql-$POSTGRESQL_VERSION-osx.tar.gz"
        download_url="https://get.enterprisedb.com/postgresql/postgresql-$POSTGRESQL_VERSION-1-osx.tar.gz"
    else
        # Linux
        archive_file="$TEMP_DIR/postgresql-$POSTGRESQL_VERSION-linux.tar.gz"
        download_url="https://get.enterprisedb.com/postgresql/postgresql-$POSTGRESQL_VERSION-1-linux-x64-binaries.tar.gz"
    fi
    
    # ดาวน์โหลด PostgreSQL
    if ! download_file "$download_url" "$archive_file"; then
        return 1
    fi
    
    # แตกไฟล์ PostgreSQL
    if ! extract_archive "$archive_file" "$TEMP_DIR"; then
        return 1
    fi
    
    # ย้ายไฟล์จาก subfolder
    local extracted_folder=$(find "$TEMP_DIR" -maxdepth 1 -type d -name "pgsql*" -o -name "postgresql*" | head -n 1)
    if [[ -n "$extracted_folder" ]]; then
        echo "กำลังย้ายไฟล์จาก $extracted_folder ไปที่ $PGSQL_DIR"
        cp -rf "$extracted_folder"/* "$PGSQL_DIR/"
    fi
    
    # สร้างโฟลเดอร์ data
    mkdir -p "$PGSQL_DIR/data"
    
    return 0
}

# ดาวน์โหลดและติดตั้ง Redis
download_redis() {
    write_header "ดาวน์โหลดและติดตั้ง Redis แบบพกพา"
    
    local archive_file="$TEMP_DIR/redis-$REDIS_VERSION.tar.gz"
    local download_url="https://download.redis.io/releases/redis-$REDIS_VERSION.tar.gz"
    
    # ดาวน์โหลด Redis
    if ! download_file "$download_url" "$archive_file"; then
        return 1
    fi
    
    # แตกไฟล์ Redis
    if ! extract_archive "$archive_file" "$TEMP_DIR"; then
        return 1
    fi
    
    # คอมไพล์ Redis
    local redis_src="$TEMP_DIR/redis-$REDIS_VERSION"
    if [ -d "$redis_src" ]; then
        echo -e "${YELLOW}กำลังคอมไพล์ Redis...${RESET}"
        (cd "$redis_src" && make)
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}คอมไพล์ Redis สำเร็จ${RESET}"
            # คัดลอกไฟล์ไบนารีและการตั้งค่า
            cp "$redis_src/src/redis-server" "$REDIS_DIR/"
            cp "$redis_src/src/redis-cli" "$REDIS_DIR/"
            cp "$redis_src/redis.conf" "$REDIS_DIR/redis.portable.conf"
            
            # แก้ไขไฟล์ config ให้ใช้พอร์ต 6380
            sed -i'.bak' 's/port 6379/port 6380/g' "$REDIS_DIR/redis.portable.conf"
            sed -i'.bak' 's/# logfile ""/logfile "logs\/redis_portable.log"/g' "$REDIS_DIR/redis.portable.conf"
        else
            echo -e "${RED}การคอมไพล์ Redis ไม่สำเร็จ${RESET}"
            return 1
        fi
    else
        echo -e "${RED}ไม่พบโฟลเดอร์ซอร์สโค้ด Redis${RESET}"
        return 1
    fi
    
    # สร้างโฟลเดอร์ logs
    mkdir -p "$REDIS_DIR/logs"
    
    return 0
}

# ลบไฟล์ชั่วคราว
clean_temp_files() {
    write_header "ทำความสะอาดไฟล์ชั่วคราว"
    
    if [ -d "$TEMP_DIR" ]; then
        rm -rf "$TEMP_DIR"
        echo -e "${GREEN}ลบโฟลเดอร์ชั่วคราวแล้ว${RESET}"
    fi
}

# ฟังก์ชันหลัก
main() {
    echo -e "${BLUE}==================================================${RESET}"
    echo -e "${BLUE}    ดาวน์โหลด PostgreSQL และ Redis แบบพกพา${RESET}"
    echo -e "${BLUE}==================================================${RESET}"
    
    # ตรวจสอบว่า tar และ unzip ถูกติดตั้งหรือไม่
    if ! command -v tar &>/dev/null; then
        echo -e "${RED}ไม่พบคำสั่ง 'tar' กรุณาติดตั้งก่อนดำเนินการต่อ${RESET}"
        exit 1
    fi
    
    if ! command -v unzip &>/dev/null; then
        echo -e "${YELLOW}คำเตือน: ไม่พบคำสั่ง 'unzip' อาจมีปัญหาในการแตกไฟล์ .zip${RESET}"
    fi
    
    local success=true
    
    # ดาวน์โหลด PostgreSQL
    if ! download_postgresql; then
        echo -e "${RED}ไม่สามารถดาวน์โหลดหรือติดตั้ง PostgreSQL ได้${RESET}"
        success=false
    fi
    
    # ดาวน์โหลด Redis
    if ! download_redis; then
        echo -e "${RED}ไม่สามารถดาวน์โหลดหรือติดตั้ง Redis ได้${RESET}"
        success=false
    fi
    
    # ทำความสะอาด
    clean_temp_files
    
    if $success; then
        echo -e "\n${GREEN}การดาวน์โหลดและติดตั้งเสร็จสมบูรณ์!${RESET}"
        echo -e "${CYAN}คุณสามารถเริ่มต้นบริการแบบพกพาได้ด้วยคำสั่ง: ./portable-env.sh start${RESET}"
    else
        echo -e "\n${RED}เกิดข้อผิดพลาดระหว่างการดาวน์โหลดหรือติดตั้ง โปรดตรวจสอบข้อความข้างต้น${RESET}"
    fi
}

# เริ่มต้นทำงาน
main
