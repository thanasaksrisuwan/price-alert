# Crypto Price Alert Telegram Bot

แอปพลิเคชันบอทแจ้งเตือนราคาคริปโตผ่าน Telegram พร้อมการติดตามพอร์ตโฟลิโอและข่าวสาร

## คุณสมบัติ

- 📊 ดูราคาปัจจุบันของเหรียญคริปโต
- 🚨 ตั้งการแจ้งเตือนเมื่อราคาถึงระดับที่กำหนด
- 📈 ติดตามพอร์ตโฟลิโอการลงทุน
- 📰 ข่าวและข้อมูลการวิเคราะห์
- 👥 รองรับผู้ใช้ฟรีและผู้ใช้พรีเมียม

## คำสั่งบอทที่รองรับ

- `/start` - เริ่มใช้งานบอท
- `/help` - แสดงความช่วยเหลือ
- `/price <symbol>` - ดูราคาปัจจุบัน
- `/alert <symbol> <condition> <value>` - ตั้งการแจ้งเตือน
- `/alerts` - ดูการแจ้งเตือนที่ตั้งไว้
- `/remove <alert_id>` - ลบการแจ้งเตือน
- `/portfolio` - ดูพอร์ตโฟลิโอ
- `/add <symbol> <quantity> <buy_price>` - เพิ่มเหรียญในพอร์ตโฟลิโอ
- `/news <symbol>` - ดูข่าวเกี่ยวกับเหรียญ
- `/settings` - ตั้งค่าผู้ใช้
- `/premium` - อัปเกรดเป็นพรีเมียม

## เครื่องมือบรรทัดคำสั่งกลาง (CLI)

โปรเจกต์นี้มี CLI สำหรับการจัดการทุกอย่างในที่เดียว:

```
npm run cli <command>
```

หรือใช้โดยตรง (หลังจากติดตั้งแบบ global หรือในเครื่องแบบ local):

```
node cli.js <command>
```

### คำสั่ง CLI ที่รองรับ

#### การติดตั้ง
- `setup` - ตัวช่วยติดตั้งแบบโต้ตอบ
- `setup:local` - ติดตั้งสภาพแวดล้อมแบบในระบบ
- `setup:portable` - ติดตั้งสภาพแวดล้อมแบบพกพา

#### การรันแอปพลิเคชัน
- `start` - เริ่มแอปพลิเคชัน (โหมดผลิต)
- `dev` - เริ่มแอปพลิเคชันในโหมดพัฒนา (พร้อม nodemon)

#### การจัดการบริการ
- `services` - แสดงสถานะบริการ
- `services:start` - เริ่มบริการทั้งหมด
- `services:stop` - หยุดบริการทั้งหมด

#### สภาพแวดล้อมแบบพกพา
- `portable:start` - เริ่มบริการแบบพกพา
- `portable:stop` - หยุดบริการแบบพกพา
- `portable:verify` - ตรวจสอบการติดตั้งแบบพกพา

#### เครื่องมืออื่นๆ
- `test` - รันการทดสอบทั้งหมด
- `logs` - แสดงไฟล์บันทึกเหตุการณ์
- `clean` - ล้างไฟล์ที่ไม่จำเป็นและไฟล์ชั่วคราว
- `db:reset` - รีเซ็ตฐานข้อมูลและนำเข้าสคีมา
- `info` - แสดงข้อมูลเกี่ยวกับโครงการ
- `help` - แสดงวิธีใช้งานโดยละเอียด

## ขั้นตอนการติดตั้ง

### ข้อกำหนด

- Node.js 18.x หรือใหม่กว่า
- PostgreSQL (ติดตั้งอัตโนมัติด้วยสคริปต์ติดตั้งเฉพาะเครื่อง)
- Redis (ติดตั้งอัตโนมัติด้วยสคริปต์ติดตั้งเฉพาะเครื่อง)

### การติดตั้งแบบเฉพาะเครื่อง (ไม่ใช้ Docker)

สำหรับการพัฒนาเฉพาะเครื่อง คุณสามารถติดตั้ง PostgreSQL และ Redis โดยตรงบนเครื่องของคุณโดยใช้สคริปต์ติดตั้งที่เราเตรียมไว้ให้:

#### สำหรับ Windows

1. เปิด PowerShell แบบ Administrator (คลิกขวาและเลือก "Run as Administrator")
2. รันสคริปต์ติดตั้ง:
   ```powershell
   .\install-local-env.ps1
   ```
3. สคริปต์จะดาวน์โหลดและติดตั้ง Redis และ PostgreSQL เฉพาะเครื่อง
4. เมื่อเสร็จสิ้น ให้ติดตั้งแพ็กเกจ NPM และเริ่มต้นแอป:
   ```
   npm install
   npm run dev
   ```

#### สำหรับ Linux/macOS

1. เปิดเทอร์มินัล
2. ให้สิทธิ์การรันสคริปต์:
   ```bash
   chmod +x install-local-env.sh
   ```
3. รันสคริปต์ติดตั้ง:
   ```bash
   ./install-local-env.sh
   ```
4. สคริปต์จะติดตั้ง Redis และ PostgreSQL ผ่านตัวจัดการแพ็กเกจของระบบของคุณ
5. เมื่อเสร็จสิ้น ให้ติดตั้งแพ็กเกจ NPM และเริ่มต้นแอป:
   ```
   npm install
   npm run dev
   ```

### การตรวจสอบการติดตั้งเฉพาะเครื่อง

หลังจากติดตั้งแล้ว:
- Redis จะทำงานที่ `localhost:6379`
- PostgreSQL จะทำงานที่ `localhost:5432` กับฐานข้อมูล `price_alert_db` (ชื่อผู้ใช้: `postgres`, รหัสผ่าน: `password`)

คุณสามารถตรวจสอบการติดตั้งด้วยคำสั่ง:
```
npm run verify
```

### การติดตั้งแบบพกพา (Portable)

หากคุณต้องการใช้งาน Redis และ PostgreSQL ในรูปแบบพกพาที่ไม่ต้องติดตั้งในระบบ คุณสามารถใช้สคริปต์ติดตั้งแบบพกพาของเรา:

#### สิ่งที่แตกต่างจากการติดตั้งปกติ:
- ติดตั้งและทำงานในไดเรกทอรีภายในโปรเจกต์ (`portable-env/`)
- ไม่ติดตั้งบริการระบบ (ไม่ต้องการสิทธิ์ Administrator)
- ฐานข้อมูลและข้อมูลทั้งหมดอยู่ภายในโปรเจกต์
- สามารถคัดลอกไปใช้ในเครื่องอื่นได้ง่าย
- ใช้พอร์ตที่ไม่ซ้ำกับการติดตั้งในระบบ (Redis: 6380, PostgreSQL: 5433)

#### คำสั่งสำหรับใช้งานแบบพกพา:

1. **ติดตั้งสภาพแวดล้อมพกพา**:
   ```
   npm run portable:install
   ```

2. **เริ่มบริการ Redis และ PostgreSQL**:
   ```
   npm run portable:start
   ```

3. **ตรวจสอบสถานะบริการ**:
   ```
   npm run portable:status
   ```

4. **หยุดบริการทั้งหมด**:
   ```
   npm run portable:stop
   ```

5. **ดูความช่วยเหลือ**:
   ```
   npm run portable
   ```

หลังจากเริ่มบริการแบบพกพา:
- Redis จะทำงานที่ `localhost:6380`
- PostgreSQL จะทำงานที่ `localhost:5433` กับฐานข้อมูล `price_alert_db` (ชื่อผู้ใช้: `postgres`, รหัสผ่าน: `password`)

สคริปท์นี้จะทดสอบการเชื่อมต่อกับทั้ง Redis และ PostgreSQL และแสดงผลการทดสอบ
- PostgreSQL 15.x หรือใหม่กว่า
- Redis 7.x หรือใหม่กว่า
- Telegram Bot Token (สร้างโดย [@BotFather](https://t.me/BotFather))

### ติดตั้งสำหรับการพัฒนาแบบไม่ใช้ Docker

ใช้สคริปต์อัตโนมัติเพื่อติดตั้งและตั้งค่าโปรเจคให้พร้อมใช้งาน:

#### สำหรับ Windows

```powershell
# ติดตั้ง PostgreSQL, Redis และตั้งค่าโปรเจค
.\setup.ps1
```

#### สำหรับ Linux/MacOS

```bash
# ให้สิทธิ์การทำงานกับไฟล์
chmod +x setup.sh

# รันสคริปต์ติดตั้ง
./setup.sh
```

สคริปต์จะดำเนินการดังนี้:
1. ติดตั้ง PostgreSQL และ Redis หากยังไม่ได้ติดตั้ง
2. สร้างฐานข้อมูล price_alert_db
3. นำเข้าสคีมาฐานข้อมูลจาก sql/init.sql
4. สร้างไฟล์ .env จาก .env.example
5. ติดตั้ง Node.js dependencies

### ติดตั้งด้วยตนเอง

#### 1. Clone โปรเจกต์

```bash
git clone https://github.com/yourusername/price-alert.git
cd price-alert
```

#### 2. ติดตั้ง dependencies

```bash
npm install
```

#### 3. ติดตั้ง PostgreSQL และ Redis

##### Windows
ใช้ Chocolatey สำหรับติดตั้ง:
```powershell
choco install postgresql15 redis-64 -y
```

##### MacOS
ใช้ Homebrew สำหรับติดตั้ง:
```bash
brew install postgresql@15 redis
brew services start postgresql@15
brew services start redis
```

##### Linux (Ubuntu/Debian)
```bash
# PostgreSQL
sudo apt-get update
sudo apt-get install -y postgresql-15

# Redis
sudo apt-get install -y redis-server
```

#### 4. สร้างฐานข้อมูล

```bash
# Windows
psql -U postgres -c "CREATE DATABASE price_alert_db;"

# Linux/MacOS
sudo -u postgres psql -c "CREATE DATABASE price_alert_db;"
```

#### 5. นำเข้าสคีมาฐานข้อมูล

```bash
# Windows
psql -U postgres -d price_alert_db -f ./sql/init.sql

# Linux/MacOS
sudo -u postgres psql -d price_alert_db -f ./sql/init.sql
```

#### 6. ตั้งค่า environment variables

คัดลอกไฟล์ `.env.example` เป็น `.env` และแก้ไขค่าต่างๆ:

```bash
cp .env.example .env
```

แก้ไขค่าต่างๆ ในไฟล์ `.env`:

```
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
DATABASE_URL=postgresql://username:password@localhost:5432/price_alert_db
REDIS_URL=redis://localhost:6379
```

### 4. สร้างฐานข้อมูล

```bash
# เข้าสู่ PostgreSQL
psql -U postgres

# สร้างฐานข้อมูล
CREATE DATABASE price_alert_db;

# ออกจาก psql
\q

# รัน SQL script เพื่อสร้างตาราง
psql -U postgres -d price_alert_db -f ./sql/init.sql
```

### 5. รันแอปพลิเคชัน

#### สำหรับการพัฒนา

```bash
# รันด้วย nodemon (hot-reload)
npm run dev
```

#### สำหรับการใช้งานจริง

```bash
# รันด้วย PM2
npm run start
```

## โครงสร้างโปรเจกต์

```
├── index.js                # จุดเริ่มต้นแอปพลิเคชัน
├── .env                    # ตัวแปรสภาพแวดล้อม
├── package.json
├── sql/
│   └── init.sql            # SQL script สำหรับสร้างฐานข้อมูล
└── src/
    ├── bot.js              # ตั้งค่า Telegram bot
    ├── config/             # ไฟล์การตั้งค่าต่างๆ
    ├── controllers/        # ตัวควบคุมการทำงานของบอท
    ├── services/           # บริการต่างๆ (ราคา, การแจ้งเตือน)
    ├── models/             # โมเดลฐานข้อมูล
    └── utils/              # ยูทิลิตี้ทั่วไป
```

## การปรับใช้งาน

แอปพลิเคชันนี้สามารถปรับใช้งานบน:

- DigitalOcean Droplet
- AWS EC2
- Railway
- Heroku

โดยให้แน่ใจว่าได้ตั้งค่า environment variables ที่จำเป็นทั้งหมด

## การพัฒนาเพิ่มเติม

โปรเจกต์นี้เป็นเพียงเวอร์ชันเริ่มต้น (MVP) ซึ่งรองรับฟีเจอร์พื้นฐาน ฟีเจอร์ที่วางแผนจะพัฒนาในอนาคต:

- การแจ้งเตือนปริมาณการซื้อขาย
- การวิเคราะห์แนวรับ/แนวต้าน
- การแจ้งเตือนความแตกต่างของราคาระหว่างเว็บเทรด
- แอปพลิเคชันเว็บสำหรับจัดการการแจ้งเตือน

## การร่วมพัฒนา

หากคุณสนใจร่วมพัฒนา โปรดสร้าง fork และส่ง pull request สำหรับฟีเจอร์ใหม่หรือแก้ไขข้อบกพร่อง เรายินดีรับคำแนะนำและการมีส่วนร่วม!

## ลิขสิทธิ์

[MIT License](LICENSE)

## การจัดการขนาด GitHub Repository

โครงการนี้มีการติดตั้งแบบพกพาที่อาจประกอบด้วยไฟล์ขนาดใหญ่ ซึ่งอาจส่งผลให้ repository มีขนาดเกิน 100MB ซึ่งเป็นขีดจำกัดที่แนะนำโดย GitHub สำหรับโรงเก็บ Git

### แนวทางปฏิบัติและคำแนะนำ

1. **ไฟล์ขนาดใหญ่**
   - ไฟล์ไบนารีและไฟล์ขนาดใหญ่ควรอยู่ใน `.gitignore`
   - ไฟล์การตั้งค่า portable-env ที่จำเป็นจะถูกติดตามไว้ แต่ไฟล์ไบนารีและข้อมูลจะถูกละเว้น

2. **การทำความสะอาด Git History**
   - ใช้สคริปต์ `cleanup-git-history.ps1` (Windows) หรือ `cleanup-git-history.sh` (Linux/macOS) เพื่อลบไฟล์ขนาดใหญ่ที่ถูกเพิ่มโดยไม่ตั้งใจจาก Git history
   - สคริปต์จะใช้เครื่องมือ BFG Repo Cleaner เพื่อลบไฟล์ขนาดใหญ่ออกจาก history

3. **การติดตามขนาดของ Repository**
   - ตรวจสอบขนาด Repository ได้ด้วยคำสั่ง: `git count-objects -vH`

4. **การเพิ่มไฟล์ขนาดใหญ่**
   - หากจำเป็นต้องแชร์ไฟล์ขนาดใหญ่ ให้ใช้ทางเลือกอื่นเช่น Google Drive หรือเซิร์ฟเวอร์ส่วนตัว
   - หากคุณต้องการจัดเก็บไฟล์ไบนารีใน Git ให้พิจารณาใช้ Git LFS

### สำหรับนักพัฒนาใหม่

ก่อนเริ่มต้นพัฒนา ให้ปฏิบัติตามขั้นตอนต่อไปนี้:

1. ตรวจสอบว่า `.gitignore` และ `.gitattributes` อัปเดตเป็นเวอร์ชันล่าสุด
2. หลีกเลี่ยงการ commit ไฟล์ที่ติดตั้ง PostgreSQL และ Redis ที่อยู่ในโฟลเดอร์ `portable-env`
