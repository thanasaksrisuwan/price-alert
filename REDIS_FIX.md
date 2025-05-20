# แก้ไขปัญหา Redis Connection ใน Crypto Price Alert

## ปัญหาที่พบ

เมื่อเริ่มต้นแอปพลิเคชัน Crypto Price Alert ด้วยคำสั่ง `npm start` พบข้อผิดพลาดในการเชื่อมต่อกับ Redis:

```
error: Redis client error: {"code":"ECONNREFUSED","module":"Redis","service":"crypto-price-alert",...}
```

## สาเหตุ

1. Redis server ไม่ได้ถูกเริ่มทำงาน
2. แอปพลิเคชันพยายามเชื่อมต่อกับ Redis โดยใช้ URL `redis://localhost:6380` (ไม่ใช่พอร์ตมาตรฐาน 6379)

## วิธีแก้ไข

เราได้สร้างสคริปท์ `start-all-services.js` ที่จะช่วยเริ่มการทำงานของ Redis และ PostgreSQL ก่อนเริ่มแอปพลิเคชัน โดยทำงานดังนี้:

1. ตรวจสอบว่า Redis server กำลังทำงานอยู่หรือไม่
2. หากยังไม่ทำงาน จะเริ่ม Redis server ให้อัตโนมัติ
3. ตรวจสอบว่า PostgreSQL กำลังทำงานอยู่หรือไม่
4. หากยังไม่ทำงาน จะเริ่ม PostgreSQL server ให้อัตโนมัติ
5. เริ่มแอปพลิเคชัน Crypto Price Alert

## วิธีใช้งาน

คุณสามารถใช้คำสั่ง npm ที่เราเพิ่มไว้ในไฟล์ package.json:

```bash
npm run start:services
```

คำสั่งนี้จะ:
1. ตรวจสอบและเริ่ม Redis และ PostgreSQL หากจำเป็น
2. เริ่มแอปพลิเคชัน Crypto Price Alert

## ข้อควรระวัง

1. ตรวจสอบว่าไฟล์ `.env` มีการกำหนดค่า `REDIS_URL=redis://localhost:6380` อย่างถูกต้อง
2. สำหรับการพัฒนา ควรใช้คำสั่ง `npm run start:services` แทน `npm start`
3. หากต้องการหยุดการทำงานของ Redis และ PostgreSQL ให้ใช้คำสั่ง `npm run portable:stop`

## การแก้ไขอื่น ๆ

1. เพิ่มกลไกการลองเชื่อมต่อใหม่อัตโนมัติใน `src/config/redis.js` หากการเชื่อมต่อล้มเหลว
2. เพิ่มการจัดการข้อผิดพลาดใน `src/services/queueService.js` สำหรับ Redis Bull Queue
