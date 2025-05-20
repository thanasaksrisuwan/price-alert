/**
 * ทดสอบการตั้งค่าและการเชื่อมต่อกับบริการ
 * สคริปท์นี้ทดสอบการเชื่อมต่อไปยัง Redis และ PostgreSQL เพื่อตรวจสอบว่าการติดตั้งเฉพาะเครื่องทำงานได้อย่างถูกต้อง
 */

// อ่านไฟล์ .env
require('dotenv').config();
const { Client } = require('pg');
const Redis = require('redis');

/**
 * ทดสอบการเชื่อมต่อกับ Redis
 * @returns {Promise<boolean>} ผลการเชื่อมต่อ true หากสำเร็จ
 */
async function testRedisConnection() {
  return new Promise((resolve) => {
    try {
      console.log('กำลังทดสอบการเชื่อมต่อกับ Redis...');
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      
      const redisClient = Redis.createClient({ url: redisUrl });
      
      redisClient.on('error', (err) => {
        console.error('เกิดข้อผิดพลาดในการเชื่อมต่อกับ Redis:', err);
        resolve(false);
      });
      
      redisClient.on('connect', async () => {
        console.log('✅ เชื่อมต่อกับ Redis สำเร็จ');
        
        try {
          // ทดสอบเขียนและอ่านข้อมูล
          await redisClient.set('test_key', 'Test Value');
          const value = await redisClient.get('test_key');
          
          if (value === 'Test Value') {
            console.log('✅ ทดสอบอ่านเขียนข้อมูลใน Redis สำเร็จ');
          } else {
            console.error('❌ ทดสอบอ่านเขียนข้อมูลใน Redis ล้มเหลว');
          }
          
          // ลบข้อมูลทดสอบ
          await redisClient.del('test_key');
          
          // ปิดการเชื่อมต่อ
          await redisClient.quit();
          resolve(true);
        } catch (error) {
          console.error('เกิดข้อผิดพลาดในการทดสอบ Redis:', error);
          await redisClient.quit();
          resolve(false);
        }
      });

      // เริ่มการเชื่อมต่อ
      redisClient.connect().catch((err) => {
        console.error('เกิดข้อผิดพลาดในการเชื่อมต่อกับ Redis:', err);
        resolve(false);
      });
    } catch (err) {
      console.error('เกิดข้อผิดพลาดในการเชื่อมต่อกับ Redis:', err);
      resolve(false);
    }
  });
}

/**
 * ทดสอบการเชื่อมต่อกับ PostgreSQL
 * @returns {Promise<boolean>} ผลการเชื่อมต่อ true หากสำเร็จ
 */
async function testPgConnection() {
  try {
    console.log('กำลังทดสอบการเชื่อมต่อกับ PostgreSQL...');
    const connectionString = process.env.DATABASE_URL || 'postgres://postgres:password@localhost:5432/price_alert_db';
    
    const client = new Client({ connectionString });
    await client.connect();
    
    console.log('✅ เชื่อมต่อกับ PostgreSQL สำเร็จ');
    
    // ทดสอบการสืบค้นข้อมูล
    const result = await client.query('SELECT version()');
    console.log(`✅ ทดสอบคิวรี่สำเร็จ: PostgreSQL version - ${result.rows[0].version.split(' ')[1]}`);
    
    // ทดสอบโครงสร้างฐานข้อมูล
    const tables = await client.query(`
      SELECT tablename FROM pg_catalog.pg_tables 
      WHERE schemaname='public'
    `);
    
    console.log('✅ ตารางในฐานข้อมูล:');
    tables.rows.forEach(table => {
      console.log(`   - ${table.tablename}`);
    });
    
    await client.end();
    return true;
  } catch (err) {
    console.error('เกิดข้อผิดพลาดในการเชื่อมต่อกับ PostgreSQL:', err);
    return false;
  }
}

/**
 * ฟังก์ชั่นหลักสำหรับทดสอบการเชื่อมต่อทั้งหมด
 */
async function runTests() {
  console.log('=== เริ่มการทดสอบการติดตั้งเฉพาะเครื่อง ===\n');
  
  // ทดสอบค่าสภาพแวดล้อม
  console.log('ข้อมูลสภาพแวดล้อม:');
  console.log('- Node.js:', process.version);
  console.log('- DATABASE_URL:', process.env.DATABASE_URL || 'ไม่ได้กำหนด (ใช้ค่าเริ่มต้น)');
  console.log('- REDIS_URL:', process.env.REDIS_URL || 'ไม่ได้กำหนด (ใช้ค่าเริ่มต้น)');
  console.log('');
  
  let successCount = 0;
  
  // ทดสอบ Redis
  if (await testRedisConnection()) {
    successCount++;
  } else {
    console.log('❌ การทดสอบ Redis ล้มเหลว');
  }
  
  console.log('');
  
  // ทดสอบ PostgreSQL
  if (await testPgConnection()) {
    successCount++;
  } else {
    console.log('❌ การทดสอบ PostgreSQL ล้มเหลว');
  }
  
  console.log('\n=== สรุปผลการทดสอบ ===');
  if (successCount === 2) {
    console.log('✅✅ การติดตั้งทั้งหมดทำงานได้อย่างถูกต้อง!');
    console.log('คุณพร้อมสำหรับการพัฒนาแอปพลิเคชันแล้ว');
  } else if (successCount === 0) {
    console.log('❌❌ ทั้ง Redis และ PostgreSQL ล้มเหลว');
    console.log('โปรดตรวจสอบการติดตั้งอีกครั้ง');
  } else {
    console.log('⚠️ บางบริการทำงานได้ แต่บางบริการยังมีปัญหา');
    console.log('โปรดตรวจสอบข้อผิดพลาดด้านบนและแก้ไขปัญหาที่พบ');
  }
}

runTests().catch(err => {
  console.error('เกิดข้อผิดพลาดในการทดสอบ:', err);
  process.exit(1);
});
