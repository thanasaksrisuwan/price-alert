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

  // Handle disconnection events
  redisClient.on('end', () => {
    redisLogger.info('Redis client disconnected');
    isRedisAvailable = false;
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
      // Check if client is already connected
      if (redisClient.isOpen) {
        redisLogger.info('Redis client is already connected');
        isRedisAvailable = true;
        return;
      }
      
      // Try to connect
      await redisClient.connect();
      redisLogger.info('Redis client connected successfully');
      isRedisAvailable = true;
      
      // Set up reconnection on disconnection
      redisClient.on('disconnect', async () => {
        redisLogger.warn('Redis client disconnected, attempting to reconnect...');
        isRedisAvailable = false;
        await reconnect();
      });
      
      return;
    } catch (error) {
      retries++;
      
      if (retries >= maxRetries) {
        redisLogger.error('Failed to connect to Redis after ' + maxRetries + ' attempts:', error);
        throw error;
      }
      
      redisLogger.warn('Connection attempt ' + retries + ' failed, retrying in ' + retryDelay + 'ms...');
      
      // รอระยะเวลาที่กำหนดก่อนลองใหม่
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
}

/**
 * ลองเชื่อมต่อกับ Redis ใหม่
 * @param {number} maxRetries - จำนวนครั้งสูงสุดที่จะลองเชื่อมต่อใหม่
 * @param {number} retryDelay - ระยะเวลารอระหว่างการลองใหม่ (มิลลิวินาที)
 * @returns {Promise<void>}
 */
async function reconnect(maxRetries = 5, retryDelay = 2000) {
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      // Check if already reconnected
      if (redisClient.isOpen) {
        redisLogger.info('Redis already reconnected');
        isRedisAvailable = true;
        return;
      }
      
      // Create a new client if needed
      if (!redisClient) {
        redisClient = Redis.createClient({
          url: config.redis.url,
        });
      }
      
      await redisClient.connect();
      redisLogger.info('Redis client reconnected successfully');
      isRedisAvailable = true;
      return;
    } catch (error) {
      retries++;
      
      if (retries >= maxRetries) {
        redisLogger.error('Failed to reconnect to Redis after ' + maxRetries + ' attempts:', error);
        throw error;
      }
      
      redisLogger.warn('Reconnection attempt ' + retries + ' failed, retrying in ' + retryDelay + 'ms...');
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
    // If Redis isn't connected, try to reconnect
    if (!redisClient.isOpen) {
      try {
        await reconnect();
      } catch (reconnectError) {
        redisLogger.error('Failed to reconnect to Redis during set operation:', reconnectError);
        return null;
      }
    }
    
    // แปลงออบเจ็คเป็น JSON string ถ้าจำเป็น
    const valueToStore = typeof value === 'object' ? JSON.stringify(value) : String(value);
    
    // บันทึกข้อมูลพร้อมเวลาหมดอายุถ้ามีการระบุ
    if (expiry) {
      return await redisClient.setEx(key, expiry, valueToStore);
    }
    return await redisClient.set(key, valueToStore);  
  } catch (error) {
    redisLogger.error('Redis SET error for key ' + key + ':', error);
    return null; // Return null instead of throwing to prevent application crashes
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
    // If Redis isn't connected, try to reconnect
    if (!redisClient.isOpen) {
      try {
        await reconnect();
      } catch (reconnectError) {
        redisLogger.error('Failed to reconnect to Redis during get operation:', reconnectError);
        return null;
      }
    }
    
    const value = await redisClient.get(key);
    
    if (value && parseJson) {
      try {
        return JSON.parse(value);
      } catch (parseError) {
        redisLogger.warn('Failed to parse JSON for key ' + key + ':', parseError);
        return value; // Return the raw string if JSON parsing fails
      }
    }
    
    return value;
  } catch (error) {
    redisLogger.error('Redis GET error for key ' + key + ':', error);
    return null; // Return null instead of throwing to prevent application crashes
  }
}

/**
 * ลบข้อมูลใน Redis
 * @param {string} key - คีย์ที่ต้องการลบ
 * @returns {Promise<number>} - จำนวนคีย์ที่ลบ
 */
async function del(key) {
  try {
    // If Redis isn't connected, try to reconnect
    if (!redisClient.isOpen) {
      try {
        await reconnect();
      } catch (reconnectError) {
        redisLogger.error('Failed to reconnect to Redis during del operation:', reconnectError);
        return 0;
      }
    }
    
    return await redisClient.del(key);  
  } catch (error) {
    redisLogger.error('Redis DEL error for key ' + key + ':', error);
    return 0; // Return 0 instead of throwing to prevent application crashes
  }
}

/**
 * ปิดการเชื่อมต่อกับ Redis server
 * @returns {Promise<void>}
 */
async function disconnect() {
  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.quit();
      redisLogger.info('Redis client disconnected');
    }
  } catch (error) {
    redisLogger.error('Failed to disconnect from Redis:', error);
    // Don't throw here, just log the error
  }
}

/**
 * ตรวจสอบว่าเชื่อมต่อกับ Redis หรือไม่
 * @returns {boolean} true ถ้าเชื่อมต่ออยู่
 */
function isConnected() {
  return isRedisAvailable && redisClient && redisClient.isOpen;
}

// Helper function for testing to set a custom Redis client
function _testSetClient(client) {
  redisClient = client;
  redisLogger.info('Redis client overridden for testing');
  isRedisAvailable = true;
  return redisClient;
}

module.exports = {
  redisClient,
  connect,
  disconnect,
  set,
  get,
  del,
  reconnect, // Exported for direct calls if needed
  _testSetClient, // Added for testing purposes
  isConnected,
};
