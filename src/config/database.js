/**
 * กำหนดการเชื่อมต่อฐานข้อมูล PostgreSQL
 * ไฟล์นี้จัดการการเชื่อมต่อไปยังฐานข้อมูล PostgreSQL และให้พูลการเชื่อมต่อ
 */

const { Pool } = require('pg');
const config = require('../config');
const { logger, createModuleLogger } = require('../utils/logger');
const dbLogger = createModuleLogger('Database');

// สร้างพูลการเชื่อมต่อฐานข้อมูล
const pool = new Pool({
  connectionString: config.database.url,
});

// Track connection status
let isDbConnected = false;

// จัดการเหตุการณ์ข้อผิดพลาดของพูล
pool.on('error', (err) => {
  dbLogger.error('PostgreSQL pool error:', err);
  isDbConnected = false;
});

/**
 * ทดสอบการเชื่อมต่อกับฐานข้อมูล
 * @returns {Promise<boolean>} ผลลัพธ์ความสำเร็จของการเชื่อมต่อ
 */
async function testConnection() {
  let client;
  try {
    client = await pool.connect();
    dbLogger.info('PostgreSQL connection established successfully');
    isDbConnected = true;
    return true;
  } catch (error) {
    dbLogger.error('PostgreSQL connection error:', error);
    isDbConnected = false;
    return false;
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * ดำเนินการ query ฐานข้อมูล
 * @param {string} text - คำสั่ง SQL ที่ต้องการ query
 * @param {Array} params - พารามิเตอร์สำหรับ query
 * @returns {Promise<Object>} ผลลัพธ์ของ query
 */
async function query(text, params) {
  try {
    const start = Date.now();
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    dbLogger.debug('Executed query', { text, duration, rows: result.rowCount });
    return result;
  } catch (error) {
    dbLogger.error('Database query error:', error);
    throw error;
  }
}

/**
 * ตรวจสอบสถานะการเชื่อมต่อกับฐานข้อมูล
 * @returns {boolean} สถานะการเชื่อมต่อ
 */
function isConnected() {
  return isDbConnected;
}

module.exports = {
  query,
  pool,
  testConnection,
  isConnected,
};
