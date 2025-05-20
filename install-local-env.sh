#!/bin/bash
#
# สคริปท์สำหรับติดตั้ง Redis และ PostgreSQL สำหรับสภาพแวดล้อมการพัฒนาบน Linux/macOS

set -e

# ตัวแปรสำหรับการติดตั้ง
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_ENV_DIR="$SCRIPT_DIR/local-env"
REDIS_DIR="$LOCAL_ENV_DIR/redis"
PGSQL_DIR="$LOCAL_ENV_DIR/pgsql"
REDIS_VERSION="6.2.6"
PGSQL_VERSION="16.2"

# ตรวจสอบระบบปฏิบัติการ
OS="$(uname -s)"
if [ "$OS" = "Darwin" ]; then
  PLATFORM="mac"
  echo "ตรวจพบ macOS"
else
  PLATFORM="linux"
  echo "ตรวจพบ Linux"
fi

# สร้างโครงสร้างไดเรกทอรี
echo -e "\e[36mเริ่มต้นการติดตั้งสภาพแวดล้อมการพัฒนาเฉพาะเครื่อง...\e[0m"
mkdir -p "$LOCAL_ENV_DIR"

# สร้างไฟล์ .env ถ้ายังไม่มี
ENV_FILE="$SCRIPT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo -e "\e[33mกำลังสร้างไฟล์ .env...\e[0m"
  cat > "$ENV_FILE" << EOL
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
EOL

  echo -e "\e[32mสร้างไฟล์ .env แล้ว\e[0m"
fi

# ฟังก์ชั่นสำหรับติดตั้ง Redis
install_redis() {
  echo -e "\e[36mเริ่มการติดตั้ง Redis...\e[0m"
  
  if [ "$PLATFORM" = "mac" ]; then
    echo -e "\e[33mกำลังติดตั้ง Redis ด้วย Homebrew...\e[0m"
    if ! command -v brew &> /dev/null; then
      echo -e "\e[31mไม่พบ Homebrew กรุณาติดตั้ง Homebrew ก่อน: https://brew.sh\e[0m"
      exit 1
    fi
    
    brew install redis
    
    # เริ่ม Redis และตั้งค่าให้เริ่มต้นอัตโนมัติ
    brew services start redis
    echo -e "\e[32mติดตั้ง Redis สำเร็จ\e[0m"
  else
    # สำหรับ Linux
    if command -v apt-get &> /dev/null; then
      echo -e "\e[33mกำลังติดตั้ง Redis ด้วย apt...\e[0m"
      sudo apt-get update
      sudo apt-get install -y redis-server
      sudo systemctl enable redis-server
      sudo systemctl start redis-server
    elif command -v yum &> /dev/null; then
      echo -e "\e[33mกำลังติดตั้ง Redis ด้วย yum...\e[0m"
      sudo yum install -y redis
      sudo systemctl enable redis
      sudo systemctl start redis
    else
      echo -e "\e[31mไม่สามารถติดตั้ง Redis ด้วยตัวจัดการแพ็กเกจที่มีอยู่ได้\e[0m"
      echo -e "\e[33mกรุณาติดตั้ง Redis ด้วยตนเอง: https://redis.io/download\e[0m"
      return 1
    fi
    echo -e "\e[32mติดตั้ง Redis สำเร็จ\e[0m"
  fi
}

# ฟังก์ชั่นสำหรับติดตั้ง PostgreSQL
install_postgresql() {
  echo -e "\e[36mเริ่มการติดตั้ง PostgreSQL...\e[0m"
  
  if [ "$PLATFORM" = "mac" ]; then
    echo -e "\e[33mกำลังติดตั้ง PostgreSQL ด้วย Homebrew...\e[0m"
    if ! command -v brew &> /dev/null; then
      echo -e "\e[31mไม่พบ Homebrew กรุณาติดตั้ง Homebrew ก่อน: https://brew.sh\e[0m"
      exit 1
    fi
    
    brew install postgresql
    
    # เริ่ม PostgreSQL และตั้งค่าให้เริ่มต้นอัตโนมัติ
    brew services start postgresql
  else
    # สำหรับ Linux
    if command -v apt-get &> /dev/null; then
      echo -e "\e[33mกำลังติดตั้ง PostgreSQL ด้วย apt...\e[0m"
      sudo apt-get update
      sudo apt-get install -y postgresql postgresql-contrib
      sudo systemctl enable postgresql
      sudo systemctl start postgresql
    elif command -v yum &> /dev/null; then
      echo -e "\e[33mกำลังติดตั้ง PostgreSQL ด้วย yum...\e[0m"
      sudo yum install -y postgresql-server postgresql-contrib
      sudo postgresql-setup initdb
      sudo systemctl enable postgresql
      sudo systemctl start postgresql
    else
      echo -e "\e[31mไม่สามารถติดตั้ง PostgreSQL ด้วยตัวจัดการแพ็กเกจที่มีอยู่ได้\e[0m"
      echo -e "\e[33mกรุณาติดตั้ง PostgreSQL ด้วยตนเอง: https://www.postgresql.org/download/\e[0m"
      return 1
    fi
  fi
  
  # รอให้ PostgreSQL เริ่มต้น
  sleep 3
  
  # สร้างฐานข้อมูลและผู้ใช้
  if [ "$PLATFORM" = "mac" ]; then
    # สำหรับ macOS
    createdb price_alert_db
  else
    # สำหรับ Linux
    sudo -u postgres psql -c "CREATE DATABASE price_alert_db;"
    sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'password';"
  fi
  
  # นำเข้าโครงสร้างฐานข้อมูล
  if [ "$PLATFORM" = "mac" ]; then
    psql -d price_alert_db -f "$SCRIPT_DIR/sql/init.sql"
  else
    sudo -u postgres psql -d price_alert_db -f "$SCRIPT_DIR/sql/init.sql"
  fi
  
  echo -e "\e[32mติดตั้ง PostgreSQL สำเร็จ\e[0m"
}

# ติดตั้ง Redis
install_redis

# ติดตั้ง PostgreSQL
install_postgresql

echo ""
echo -e "\e[32mการติดตั้งเสร็จสิ้น!\e[0m"
echo -e "\e[36mRedis กำลังทำงานที่ localhost:6379\e[0m"
echo -e "\e[36mPostgreSQL กำลังทำงานที่ localhost:5432 (ชื่อผู้ใช้: postgres, ชื่อฐานข้อมูล: price_alert_db)\e[0m"
echo ""
echo -e "\e[33mคุณสามารถเริ่มต้นแอปพลิเคชันด้วยคำสั่ง:\e[0m"
echo "    npm install"
echo "    npm run dev"
