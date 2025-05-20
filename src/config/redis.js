/**
 * กำหนดการเชื่อมต่อกับ Redis
 * ไฟล์นี้จัดการการเชื่อมต่อไปยัง Redis สำหรับการแคชและการจัดการเซสชั่น
 */

const Redis = require('redis');
const config = require('../config');
const { logger, createModuleLogger } = require('../utils/logger');
const redisLogger = createModuleLogger('Redis');

// สร้าง Redis client และตัวแปรสถานะการเชื่อมต่อ
let redisClient;
let isRedisAvailable = false;

try {
  // สร้าง Redis client
  redisClient = Redis.createClient({
    url: config.redis.url,
  });

    // จัดการเหตุการณ์ข้อผิดพลาดของ Redis client
  redisClient.on('error', (err) => {
    redisLogger.error('Redis client error:', err);
    isRedisAvailable = false;
  });

  // จัดการเหตุการณ์เมื่อเชื่อมต่อสำเร็จ
  redisClient.on('connect', () => {
    redisLogger.info('Redis client connected');
    isRedisAvailable = true;
  });
} catch (error) {
  redisLogger.error('Failed to create Redis client:', error);
  isRedisAvailable = false;
}

/**
 * เชื่อมต่อกับ Redis server พร้อมการลองใหม่อัตโนมัติ
 * @param {number} maxRetries - จำนวนครั้งสูงสุดที่จะลองเชื่อมต่อใหม่
 * @param {number} retryDelay - ระยะเวลารอระหว่างการลองใหม่ (มิลลิวินาที)
 * @returns {Promise<void>}
 */
async function connect(maxRetries = 5, retryDelay = 2000) {
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      await redisClient.connect();
      return;
    } catch (error) {
      retries++;
      
      if (retries >= maxRetries) {
        redisLogger.error(`Failed to connect to Redis after ${maxRetries} attempts:`, error);
        throw error;
      }
      
      redisLogger.warn(`Connection attempt ${retries} failed, retrying in ${retryDelay}ms...`);
      
      // รอระยะเวลาที่กำหนดก่อนลองใหม่
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
}

/**
 * ตั้งค่าข้อมูลใน Redis
 * @param {string} key - คีย์ที่ใช้เก็บข้อมูล
 * @param {string|object} value - ค่าที่ต้องการเก็บ
 * @param {number} [expiry] - เวลาหมดอายุในวินาที (ไม่ระบุหากไม่ต้องการกำหนด)
 * @returns {Promise<string>} - ผลลัพธ์ของการดำเนินการ
 */
async function set(key, value, expiry = null) {
  try {
    // แปลงออบเจ็คเป็น JSON string ถ้าจำเป็น
    const valueToStore = typeof value === 'object' ? JSON.stringify(value) : String(value);
    
    // บันทึกข้อมูลพร้อมเวลาหมดอายุถ้ามีการระบุ
    if (expiry) {
      return await redisClient.setEx(key, expiry, valueToStore);
    }
    return await redisClient.set(key, valueToStore);  
  } catch (error) {
    redisLogger.error(`Redis SET error for key ${key}:`, error);
    throw error;
  }
}

/**
 * ดึงข้อมูลจาก Redis
 * @param {string} key - คีย์ที่ต้องการดึงข้อมูล
 * @param {boolean} [parseJson=true] - แปลง JSON string เป็นออบเจ็คหรือไม่
 * @returns {Promise<any>} - ข้อมูลที่ดึงมาได้
 */
async function get(key, parseJson = true) {
  try {
    const value = await redisClient.get(key);
    
    if (value && parseJson) {
      try {
        return JSON.parse(value);
      } catch {
        // ถ้าไม่สามารถแปลงเป็น JSON ได้ให้คืนค่าดั้งเดิม
        return value;
      }
    }
      return value;  
  } catch (error) {
    redisLogger.error(`Redis GET error for key ${key}:`, error);
    throw error;
  }
}

/**
 * ลบข้อมูลใน Redis
 * @param {string} key - คีย์ที่ต้องการลบ
 * @returns {Promise<number>} - จำนวนคีย์ที่ลบ
 */
async function del(key) {  try {
    return await redisClient.del(key);  
  } catch (error) {
    redisLogger.error(`Redis DEL error for key ${key}:`, error);
    throw error;
  }
}

/**
 * ปิดการเชื่อมต่อกับ Redis server
 * @returns {Promise<void>}
 */
async function disconnect() {  
  try {
    await redisClient.quit();
    redisLogger.info('Redis client disconnected');
  } catch (error) {
    redisLogger.error('Failed to disconnect from Redis:', error);
    throw error;
  }
}

module.exports = {
  redisClient,
  connect,
  disconnect,
  set,
  get,
  del,
};
