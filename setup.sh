#!/bin/bash

# ตั้งค่าและติดตั้งสำหรับโปรเจค Price Alert บน Linux/MacOS
# สคริปต์นี้ติดตั้ง PostgreSQL, Redis และตั้งค่า application

# ตั้งค่าพารามิเตอร์
PG_VERSION="15"
PG_DB_NAME="price_alert_db"
PG_USER="postgres"
PG_PASSWORD="postgres"
PORT=3000

echo -e "\e[1;36m===== เริ่มการติดตั้งโปรเจค Price Alert =====\e[0m"

# ตรวจสอบระบบปฏิบัติการ
OS="$(uname -s)"
case "${OS}" in
    Linux*)     OS_TYPE=Linux;;
    Darwin*)    OS_TYPE=MacOS;;
    *)          OS_TYPE="UNKNOWN:${OS}"
esac

echo -e "\e[1;33mกำลังตั้งค่าบน ${OS_TYPE}\e[0m"

# ตรวจสอบและติดตั้ง PostgreSQL
if ! command -v psql &> /dev/null; then
    echo -e "\e[1;33mกำลังติดตั้ง PostgreSQL...\e[0m"
    
    if [ "$OS_TYPE" = "Linux" ]; then
        # สำหรับ Debian/Ubuntu
        if command -v apt-get &> /dev/null; then
            sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
            wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
            sudo apt-get update
            sudo apt-get -y install postgresql-$PG_VERSION
            
            # เริ่มการทำงานของ PostgreSQL
            sudo systemctl start postgresql
            sudo systemctl enable postgresql
        # สำหรับ RHEL/CentOS/Fedora
        elif command -v yum &> /dev/null; then
            sudo yum install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-8-x86_64/pgdg-redhat-repo-latest.noarch.rpm
            sudo yum -y install postgresql$PG_VERSION-server
            
            # เริ่มการทำงานและตั้งค่า PostgreSQL
            sudo /usr/pgsql-$PG_VERSION/bin/postgresql-$PG_VERSION-setup initdb
            sudo systemctl start postgresql-$PG_VERSION
            sudo systemctl enable postgresql-$PG_VERSION
        fi
    elif [ "$OS_TYPE" = "MacOS" ]; then
        # สำหรับ MacOS ใช้ Homebrew
        if ! command -v brew &> /dev/null; then
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        fi
        brew install postgresql@$PG_VERSION
        brew services start postgresql@$PG_VERSION
    fi
    
    # รอเพื่อให้มั่นใจว่า PostgreSQL เริ่มทำงานแล้ว
    echo "กำลังรอให้ PostgreSQL เริ่มทำงาน..."
    sleep 5
    
    # ตั้งค่ารหัสผ่านสำหรับผู้ใช้ postgres (อาจต้องปรับเปลี่ยนตามระบบปฏิบัติการ)
    if [ "$OS_TYPE" = "Linux" ]; then
        sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '$PG_PASSWORD';"
    elif [ "$OS_TYPE" = "MacOS" ]; then
        psql postgres -c "ALTER USER postgres WITH PASSWORD '$PG_PASSWORD';"
    fi
else
    echo -e "\e[1;32mPostgreSQL ติดตั้งอยู่แล้ว\e[0m"
fi

# สร้างฐานข้อมูล
echo -e "\e[1;33mกำลังตั้งค่าฐานข้อมูล...\e[0m"
if [ "$OS_TYPE" = "Linux" ]; then
    # ตรวจสอบว่าฐานข้อมูลมีอยู่แล้วหรือไม่
    DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$PG_DB_NAME'")
    
    if [ "$DB_EXISTS" != "1" ]; then
        echo "กำลังสร้างฐานข้อมูล $PG_DB_NAME..."
        sudo -u postgres psql -c "CREATE DATABASE $PG_DB_NAME;"
        
        # นำเข้าสคีมาฐานข้อมูล
        if [ -f ./sql/init.sql ]; then
            echo "กำลังนำเข้าสคีมาฐานข้อมูล..."
            sudo -u postgres psql -d $PG_DB_NAME -f ./sql/init.sql
        else
            echo -e "\e[1;31mไม่พบไฟล์ SQL schema (./sql/init.sql)\e[0m"
        fi
    else
        echo -e "\e[1;32mฐานข้อมูล $PG_DB_NAME มีอยู่แล้ว\e[0m"
    fi
elif [ "$OS_TYPE" = "MacOS" ]; then
    # ตรวจสอบว่าฐานข้อมูลมีอยู่แล้วหรือไม่
    DB_EXISTS=$(psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$PG_DB_NAME'" 2>/dev/null)
    
    if [ "$DB_EXISTS" != "1" ]; then
        echo "กำลังสร้างฐานข้อมูล $PG_DB_NAME..."
        psql -U postgres -c "CREATE DATABASE $PG_DB_NAME;"
        
        # นำเข้าสคีมาฐานข้อมูล
        if [ -f ./sql/init.sql ]; then
            echo "กำลังนำเข้าสคีมาฐานข้อมูล..."
            psql -U postgres -d $PG_DB_NAME -f ./sql/init.sql
        else
            echo -e "\e[1;31mไม่พบไฟล์ SQL schema (./sql/init.sql)\e[0m"
        fi
    else
        echo -e "\e[1;32mฐานข้อมูล $PG_DB_NAME มีอยู่แล้ว\e[0m"
    fi
fi

# ติดตั้ง Redis
if ! command -v redis-server &> /dev/null; then
    echo -e "\e[1;33mกำลังติดตั้ง Redis...\e[0m"
    
    if [ "$OS_TYPE" = "Linux" ]; then
        # สำหรับ Debian/Ubuntu
        if command -v apt-get &> /dev/null; then
            sudo apt-get -y install redis-server
            sudo systemctl enable redis-server
            sudo systemctl start redis-server
        # สำหรับ RHEL/CentOS/Fedora
        elif command -v yum &> /dev/null; then
            sudo yum install -y redis
            sudo systemctl enable redis
            sudo systemctl start redis
        fi
    elif [ "$OS_TYPE" = "MacOS" ]; then
        brew install redis
        brew services start redis
    fi
else
    echo -e "\e[1;32mRedis ติดตั้งอยู่แล้ว\e[0m"
    
    # ตรวจสอบสถานะ Redis
    if [ "$OS_TYPE" = "Linux" ]; then
        if ! systemctl is-active --quiet redis-server; then
            echo "กำลังเริ่มการทำงานของ Redis..."
            sudo systemctl start redis-server
        fi
    elif [ "$OS_TYPE" = "MacOS" ]; then
        if ! brew services list | grep redis | grep started &> /dev/null; then
            echo "กำลังเริ่มการทำงานของ Redis..."
            brew services start redis
        fi
    fi
fi

# สร้างไฟล์ .env จาก .env.example ถ้ายังไม่มี
if [ ! -f ./.env ]; then
    if [ -f ./.env.example ]; then
        echo -e "\e[1;33mกำลังสร้างไฟล์ .env...\e[0m"
        cp ./.env.example ./.env
        
        # แก้ไขการตั้งค่าฐานข้อมูลและ Redis
        sed -i.bak "s|DATABASE_URL=postgres://username:password@localhost:5432/crypto_price_alert|DATABASE_URL=postgres://$PG_USER:$PG_PASSWORD@localhost:5432/$PG_DB_NAME|g" ./.env
        sed -i.bak "s|REDIS_URL=redis://localhost:6379|REDIS_URL=redis://localhost:6379/0|g" ./.env
        rm -f ./.env.bak
        
        echo -e "\e[1;32mไฟล์ .env ถูกสร้างขึ้นแล้ว โปรดตรวจสอบและแก้ไขค่าตัวแปรอื่นๆ ตามความจำเป็น\e[0m"
    else
        echo -e "\e[1;31mไม่พบไฟล์ .env.example กรุณาสร้างไฟล์ .env ด้วยตัวเอง\e[0m"
    fi
else
    echo -e "\e[1;32mไฟล์ .env มีอยู่แล้ว\e[0m"
fi

# ติดตั้ง dependencies ของ Node.js
echo -e "\e[1;33mกำลังติดตั้ง dependencies ของ Node.js...\e[0m"
npm install

echo -e "\e[1;36m===== การติดตั้งเสร็จสิ้น =====\e[0m"
echo -e "\nวิธีการเริ่มใช้งานแอปพลิเคชัน:"
echo "1. ตรวจสอบการตั้งค่าในไฟล์ .env"
echo "2. รันคำสั่ง 'npm start' เพื่อเริ่มการทำงานของแอปพลิเคชัน"
echo "3. แอปพลิเคชันจะทำงานที่ http://localhost:$PORT"