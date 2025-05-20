#!/bin/bash
#
# สคริปท์สำหรับสร้างสภาพแวดล้อม Redis และ PostgreSQL แบบพกพา (portable) บน Linux/macOS
# สามารถใช้ได้โดยไม่ต้องติดตั้งบริการระบบ

set -e

# ตัวแปรสำหรับการติดตั้ง
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORTABLE_DIR="$SCRIPT_DIR/portable-env"
REDIS_DIR="$PORTABLE_DIR/redis"
PGSQL_DIR="$PORTABLE_DIR/pgsql"
REDIS_VERSION="6.2.6"
PGSQL_VERSION="16.2"
REDIS_PORT=6380
PGSQL_PORT=5433

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
echo -e "\e[36mเริ่มต้นการสร้างสภาพแวดล้อม Redis และ PostgreSQL แบบพกพา...\e[0m"
mkdir -p "$PORTABLE_DIR"
mkdir -p "$REDIS_DIR"
mkdir -p "$PGSQL_DIR"
mkdir -p "$PORTABLE_DIR/pids"
mkdir -p "$PORTABLE_DIR/logs"

# สร้างไฟล์ .env ถ้ายังไม่มี
ENV_FILE="$SCRIPT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo -e "\e[33mกำลังสร้างไฟล์ .env...\e[0m"
  cat > "$ENV_FILE" << EOL
# การกำหนดค่าแอปพลิเคชัน
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# การกำหนดค่าฐานข้อมูล (พกพา)
DATABASE_URL=postgres://postgres:password@localhost:5433/price_alert_db

# การกำหนดค่า Redis (พกพา)
REDIS_URL=redis://localhost:6380

# ใส่ค่า Telegram Bot Token ของคุณที่นี่
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
EOL

  echo -e "\e[32mสร้างไฟล์ .env แล้ว\e[0m"
fi

# ฟังก์ชั่นสำหรับดาวน์โหลดและติดตั้ง Redis ในรูปแบบแหล่งที่มา
download_and_build_redis() {
  echo -e "\e[33mกำลังดาวน์โหลดและคอมไพล์ Redis...\e[0m"
  
  # ดาวน์โหลดซอร์สโค้ด Redis
  cd "$PORTABLE_DIR"
  
  if [ ! -f "redis-$REDIS_VERSION.tar.gz" ]; then
    curl -O "http://download.redis.io/releases/redis-$REDIS_VERSION.tar.gz"
  fi
  
  # แตกไฟล์และคอมไพล์
  tar xzf "redis-$REDIS_VERSION.tar.gz"
  cd "redis-$REDIS_VERSION"
  
  make PREFIX="$REDIS_DIR" install
  
  # คัดลอกไฟล์คอนฟิกปกติ
  cp redis.conf "$REDIS_DIR/redis.portable.conf"
  
  # ปรับเปลี่ยนไฟล์คอนฟิก
  sed -i.bak "s/port 6379/port $REDIS_PORT/g" "$REDIS_DIR/redis.portable.conf"
  sed -i.bak "s/# bind 127.0.0.1/bind 127.0.0.1/g" "$REDIS_DIR/redis.portable.conf"
  sed -i.bak "s/daemonize no/daemonize yes/g" "$REDIS_DIR/redis.portable.conf"
  sed -i.bak "s/pidfile \/var\/run\/redis_6379.pid/pidfile $PORTABLE_DIR\/pids\/redis_$REDIS_PORT.pid/g" "$REDIS_DIR/redis.portable.conf"
  sed -i.bak "s/logfile \"\"/logfile \"$PORTABLE_DIR\/logs\/redis_portable.log\"/g" "$REDIS_DIR/redis.portable.conf"
  
  # ลบไฟล์ที่ไม่จำเป็น
  rm -f "$REDIS_DIR/redis.portable.conf.bak"
  
  echo -e "\e[32mติดตั้ง Redis เสร็จสมบูรณ์\e[0m"
}

# ฟังก์ชั่นสำหรับดาวน์โหลดและติดตั้ง PostgreSQL ในรูปแบบแหล่งที่มา
download_and_build_postgresql() {
  echo -e "\e[33mกำลังดาวน์โหลดและคอมไพล์ PostgreSQL...\e[0m"
  
  # ติดตั้งแพ็กเกจที่จำเป็น
  if [ "$PLATFORM" = "mac" ]; then
    # สำหรับ macOS ใช้ Homebrew เพื่อติดตั้งแพ็กเกจที่จำเป็น
    if ! command -v brew &> /dev/null; then
      echo -e "\e[31mไม่พบ Homebrew กรุณาติดตั้ง Homebrew ก่อน: https://brew.sh\e[0m"
      exit 1
    fi
    
    brew install readline zlib
  else
    # สำหรับ Linux
    if command -v apt-get &> /dev/null; then
      sudo apt-get update
      sudo apt-get install -y build-essential libreadline-dev zlib1g-dev flex bison libxml2-dev libxslt-dev libssl-dev
    elif command -v yum &> /dev/null; then
      sudo yum install -y readline-devel zlib-devel flex bison libxml2-devel libxslt-devel openssl-devel
    else
      echo -e "\e[31mไม่สามารถติดตั้งแพ็กเกจที่จำเป็นได้ กรุณาติดตั้งด้วยตนเอง\e[0m"
      exit 1
    fi
  fi
  
  # ดาวน์โหลดซอร์สโค้ด PostgreSQL
  cd "$PORTABLE_DIR"
  
  if [ ! -f "postgresql-$PGSQL_VERSION.tar.gz" ]; then
    curl -O "https://ftp.postgresql.org/pub/source/v$PGSQL_VERSION/postgresql-$PGSQL_VERSION.tar.gz"
  fi
  
  # แตกไฟล์และคอมไพล์
  tar xzf "postgresql-$PGSQL_VERSION.tar.gz"
  cd "postgresql-$PGSQL_VERSION"
  
  ./configure --prefix="$PGSQL_DIR" --with-openssl
  make
  make install
  
  # สร้างไดเรกทอรีข้อมูล
  mkdir -p "$PGSQL_DIR/data"
  
  # กำหนดค่าสภาพแวดล้อมและเริ่มต้นฐานข้อมูล
  export PATH="$PGSQL_DIR/bin:$PATH"
  export PGDATA="$PGSQL_DIR/data"
  export PGPORT="$PGSQL_PORT"
  
  "$PGSQL_DIR/bin/initdb" -D "$PGSQL_DIR/data" -U postgres -E UTF8 -A trust
  
  # ปรับเปลี่ยนไฟล์คอนฟิก
  sed -i.bak "s/#port = 5432/port = $PGSQL_PORT/g" "$PGSQL_DIR/data/postgresql.conf"
  sed -i.bak "s/#listen_addresses = 'localhost'/listen_addresses = 'localhost'/g" "$PGSQL_DIR/data/postgresql.conf"
  
  # ลบไฟล์ที่ไม่จำเป็น
  rm -f "$PGSQL_DIR/data/postgresql.conf.bak"
  
  echo -e "\e[32mติดตั้ง PostgreSQL เสร็จสมบูรณ์\e[0m"
}

# ติดตั้ง Redis แบบพกพา
if [ ! -f "$REDIS_DIR/redis.portable.conf" ]; then
  download_and_build_redis
else
  echo -e "\e[32mRedis ถูกติดตั้งอยู่แล้ว\e[0m"
fi

# ติดตั้ง PostgreSQL แบบพกพา
if [ ! -d "$PGSQL_DIR/data" ]; then
  download_and_build_postgresql
else
  echo -e "\e[32mPostgreSQL ถูกติดตั้งอยู่แล้ว\e[0m"
fi

# สร้างสคริปท์สำหรับเริ่มและหยุดบริการ
START_SCRIPT="$PORTABLE_DIR/start-services.sh"
STOP_SCRIPT="$PORTABLE_DIR/stop-services.sh"

# สคริปท์สำหรับเริ่มบริการ
cat > "$START_SCRIPT" << EOL
#!/bin/bash
# สคริปท์สำหรับเริ่มบริการ Redis และ PostgreSQL แบบพกพา

SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
REDIS_DIR="\$SCRIPT_DIR/redis"
PGSQL_DIR="\$SCRIPT_DIR/pgsql"
PID_DIR="\$SCRIPT_DIR/pids"
LOGS_DIR="\$SCRIPT_DIR/logs"

# สร้างไดเรกทอรีหากยังไม่มี
mkdir -p "\$PID_DIR"
mkdir -p "\$LOGS_DIR"

# เริ่ม Redis
echo "กำลังเริ่ม Redis..."
"\$REDIS_DIR/bin/redis-server" "\$REDIS_DIR/redis.portable.conf"

# รอให้ Redis เริ่มต้น
sleep 2

# เริ่ม PostgreSQL
echo "กำลังเริ่ม PostgreSQL..."
export PATH="\$PGSQL_DIR/bin:\$PATH"
export PGDATA="\$PGSQL_DIR/data"
export PGPORT="$PGSQL_PORT"

"\$PGSQL_DIR/bin/pg_ctl" start -D "\$PGSQL_DIR/data" -l "\$LOGS_DIR/postgres_portable.log"

# สร้างฐานข้อมูลหากยังไม่มี
if ! "\$PGSQL_DIR/bin/psql" -p "$PGSQL_PORT" -U postgres -lqt | cut -d \| -f 1 | grep -qw price_alert_db; then
  echo "กำลังสร้างฐานข้อมูล price_alert_db..."
  "\$PGSQL_DIR/bin/createdb" -p "$PGSQL_PORT" -U postgres price_alert_db
  
  # นำเข้าโครงสร้างฐานข้อมูล
  SQL_FILE="\$(dirname "\$SCRIPT_DIR")/sql/init.sql"
  if [ -f "\$SQL_FILE" ]; then
    echo "กำลังนำเข้าโครงสร้างฐานข้อมูล..."
    "\$PGSQL_DIR/bin/psql" -p "$PGSQL_PORT" -U postgres -d price_alert_db -f "\$SQL_FILE"
  fi
fi

echo "บริการทั้งหมดเริ่มต้นแล้ว"
echo "Redis กำลังทำงานที่ localhost:$REDIS_PORT"
echo "PostgreSQL กำลังทำงานที่ localhost:$PGSQL_PORT (ชื่อผู้ใช้: postgres, ชื่อฐานข้อมูล: price_alert_db)"
EOL

# สคริปท์สำหรับหยุดบริการ
cat > "$STOP_SCRIPT" << EOL
#!/bin/bash
# สคริปท์สำหรับหยุดบริการ Redis และ PostgreSQL แบบพกพา

SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
REDIS_DIR="\$SCRIPT_DIR/redis"
PGSQL_DIR="\$SCRIPT_DIR/pgsql"

# หยุด PostgreSQL
echo "กำลังหยุด PostgreSQL..."
export PATH="\$PGSQL_DIR/bin:\$PATH"
export PGDATA="\$PGSQL_DIR/data"
export PGPORT="$PGSQL_PORT"

"\$PGSQL_DIR/bin/pg_ctl" stop -D "\$PGSQL_DIR/data" -m fast

# หยุด Redis
echo "กำลังหยุด Redis..."
"\$REDIS_DIR/bin/redis-cli" -p "$REDIS_PORT" shutdown

echo "หยุดบริการทั้งหมดแล้ว"
EOL

# ทำให้สคริปท์สามารถรันได้
chmod +x "$START_SCRIPT"
chmod +x "$STOP_SCRIPT"

echo ""
echo -e "\e[32mการติดตั้งสภาพแวดล้อมแบบพกพาเสร็จสิ้น!\e[0m"
echo -e "\e[36mคุณสามารถเริ่มบริการด้วยสคริปท์:\e[0m"
echo "  ./portable-env/start-services.sh"
echo -e "\e[36mและหยุดบริการด้วย:\e[0m"
echo "  ./portable-env/stop-services.sh"
echo ""
echo -e "\e[33mหลังจากเริ่มบริการ:\e[0m"
echo "- Redis จะทำงานที่ localhost:$REDIS_PORT"
echo "- PostgreSQL จะทำงานที่ localhost:$PGSQL_PORT (ชื่อผู้ใช้: postgres, ชื่อฐานข้อมูล: price_alert_db)"
echo ""
echo -e "\e[33mคุณสามารถเริ่มต้นแอปพลิเคชันด้วยคำสั่ง:\e[0m"
echo "    npm install"
echo "    npm run dev"
