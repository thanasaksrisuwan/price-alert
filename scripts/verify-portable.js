/**
 * ทดสอบการตั้งค่าและการเชื่อมต่อกับบริการแบบพกพา
 * สคริปท์นี้ทดสอบการเชื่อมต่อไปยัง Redis และ PostgreSQL แบบพกพา
 */

// อ่านไฟล์ .env
require('dotenv').config();
const { Client } = require('pg');
const Redis = require('redis');

/**
 * ทดสอบการเชื่อมต่อกับ Redis แบบพกพา
 * @returns {Promise<boolean>} ผลการเชื่อมต่อ true หากสำเร็จ
 */
async function testPortableRedisConnection() {
  return new Promise((resolve) => {
    try {
      console.log('กำลังทดสอบการเชื่อมต่อกับ Redis แบบพกพา (พอร์ต 6380)...');
      const redisUrl = 'redis://localhost:6380';
      
      const redisClient = Redis.createClient({ url: redisUrl });
      
      redisClient.on('error', (err) => {
        console.error('เกิดข้อผิดพลาดในการเชื่อมต่อกับ Redis แบบพกพา:', err);
        resolve(false);
      });
      
      redisClient.on('connect', async () => {
        console.log('✅ เชื่อมต่อกับ Redis แบบพกพาสำเร็จ');
        
        try {
          // ทดสอบเขียนและอ่านข้อมูล
          await redisClient.set('test_portable_key', 'Test Portable Value');
          const value = await redisClient.get('test_portable_key');
          
          if (value === 'Test Portable Value') {
            console.log('✅ ทดสอบอ่านเขียนข้อมูลใน Redis แบบพกพาสำเร็จ');
          } else {
            console.error('❌ ทดสอบอ่านเขียนข้อมูลใน Redis แบบพกพาล้มเหลว');
          }
          
          // ลบข้อมูลทดสอบ
          await redisClient.del('test_portable_key');
          
          // ปิดการเชื่อมต่อ
          await redisClient.quit();
          resolve(true);
        } catch (error) {
          console.error('เกิดข้อผิดพลาดในการทดสอบ Redis แบบพกพา:', error);
          await redisClient.quit();
          resolve(false);
        }
      });

      // เริ่มการเชื่อมต่อ
      redisClient.connect().catch((err) => {
        console.error('เกิดข้อผิดพลาดในการเชื่อมต่อกับ Redis แบบพกพา:', err);
        resolve(false);
      });
    } catch (err) {
      console.error('เกิดข้อผิดพลาดในการเชื่อมต่อกับ Redis แบบพกพา:', err);
      resolve(false);
    }
  });
}

/**
 * ทดสอบการเชื่อมต่อกับ PostgreSQL แบบพกพา
 * @returns {Promise<boolean>} ผลการเชื่อมต่อ true หากสำเร็จ
 */
async function testPortablePgConnection() {
  try {
    console.log('กำลังทดสอบการเชื่อมต่อกับ PostgreSQL แบบพกพา (พอร์ต 5433)...');
    const connectionString = 'postgres://postgres:password@localhost:5433/price_alert_db';
    
    const client = new Client({ connectionString });
    await client.connect();
    
    console.log('✅ เชื่อมต่อกับ PostgreSQL แบบพกพาสำเร็จ');
    
    // ทดสอบการสืบค้นข้อมูล
    const result = await client.query('SELECT version()');
    console.log(`✅ ทดสอบคิวรี่สำเร็จ: PostgreSQL version - ${result.rows[0].version.split(' ')[1]}`);
    
    // ทดสอบโครงสร้างฐานข้อมูล
    const tables = await client.query(`
      SELECT tablename FROM pg_catalog.pg_tables 
      WHERE schemaname='public'
    `);
    
    console.log('✅ ตารางในฐานข้อมูลแบบพกพา:');
    tables.rows.forEach(table => {
      console.log(`   - ${table.tablename}`);
    });
    
    await client.end();
    return true;
  } catch (err) {
    console.error('เกิดข้อผิดพลาดในการเชื่อมต่อกับ PostgreSQL แบบพกพา:', err);
    return false;
  }
}

/**
 * ฟังก์ชั่นหลักสำหรับทดสอบการเชื่อมต่อแบบพกพาทั้งหมด
 */
async function runPortableTests() {
  console.log('=== เริ่มการทดสอบการติดตั้งแบบพกพา ===\n');
  
  let successCount = 0;
  
  // ทดสอบ Redis แบบพกพา
  if (await testPortableRedisConnection()) {
    successCount++;
  } else {
    console.log('❌ การทดสอบ Redis แบบพกพาล้มเหลว');
  }
  
  console.log('');
  
  // ทดสอบ PostgreSQL แบบพกพา
  if (await testPortablePgConnection()) {
    successCount++;
  } else {
    console.log('❌ การทดสอบ PostgreSQL แบบพกพาล้มเหลว');
  }
  
  console.log('\n=== สรุปผลการทดสอบแบบพกพา ===');
  if (successCount === 2) {
    console.log('✅✅ การติดตั้งแบบพกพาทั้งหมดทำงานได้อย่างถูกต้อง!');
    console.log('คุณพร้อมสำหรับการพัฒนาแอปพลิเคชันแบบพกพาแล้ว');
  } else if (successCount === 0) {
    console.log('❌❌ ทั้ง Redis และ PostgreSQL แบบพกพาล้มเหลว');
    console.log('โปรดตรวจสอบว่าคุณได้รันคำสั่ง "npm run portable:start" แล้ว');
  } else {
    console.log('⚠️ บางบริการแบบพกพาทำงานได้ แต่บางบริการยังมีปัญหา');
    console.log('โปรดตรวจสอบข้อผิดพลาดด้านบนและแก้ไขปัญหาที่พบ');
  }
}

// ตรวจสอบว่าต้องการรันโดยตรงหรือถูกเรียกจากไฟล์อื่น
if (require.main === module) {
  runPortableTests().catch(err => {
    console.error('เกิดข้อผิดพลาดในการทดสอบ:', err);
    process.exit(1);
  });
}

module.exports = {
  runPortableTests
};
