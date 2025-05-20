/**
 * โมเดลสำหรับข้อมูลผู้ใช้
 * จัดการการเข้าถึงและจัดการข้อมูลผู้ใช้ในฐานข้อมูล
 */

const db = require('../config/database');
const logger = require('../utils/logger').createModuleLogger('UserModel');
const { sanitizeInput } = require('../utils/validators');

/**
 * สร้างผู้ใช้ใหม่ในฐานข้อมูล
 * @param {Object} user - ข้อมูลผู้ใช้
 * @param {number} user.telegramId - รหัสประจำตัวผู้ใช้จาก Telegram
 * @param {string} [user.username] - ชื่อผู้ใช้ใน Telegram (ถ้ามี)
 * @param {string} [user.firstName] - ชื่อผู้ใช้
 * @returns {Promise<Object>} - ข้อมูลผู้ใช้ที่สร้าง
 */
async function createUser(user) {
  try {
    // ทำความสะอาดข้อมูลนำเข้า
    const username = user.username ? sanitizeInput(user.username) : null;
    const firstName = user.firstName ? sanitizeInput(user.firstName) : null;

    const query = `
      INSERT INTO users (telegram_id, username, first_name)
      VALUES ($1, $2, $3)
      ON CONFLICT (telegram_id) DO UPDATE
      SET username = $2, first_name = $3, updated_at = NOW()
      RETURNING id, telegram_id, username, first_name, premium, timezone, default_currency, created_at, updated_at
    `;
    
    const values = [user.telegramId, username, firstName];
    const result = await db.query(query, values);
    
    return result.rows[0];
  } catch (error) {
    logger.error('Error creating user:', error);
    throw error;
  }
}

/**
 * ค้นหาผู้ใช้ตามรหัส Telegram
 * @param {number} telegramId - รหัสประจำตัวผู้ใช้จาก Telegram
 * @returns {Promise<Object|null>} - ข้อมูลผู้ใช้หรือ null ถ้าไม่พบ
 */
async function findUserByTelegramId(telegramId) {
  try {
    const query = 'SELECT * FROM users WHERE telegram_id = $1';
    const result = await db.query(query, [telegramId]);
    
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error(`Error finding user with Telegram ID ${telegramId}:`, error);
    throw error;
  }
}

/**
 * อัพเดตการตั้งค่าของผู้ใช้
 * @param {number} userId - รหัสประจำตัวผู้ใช้ในฐานข้อมูล
 * @param {Object} settings - การตั้งค่าที่ต้องการอัพเดต
 * @param {string} [settings.timezone] - โซนเวลาที่ต้องการตั้งค่า
 * @param {string} [settings.defaultCurrency] - สกุลเงินเริ่มต้น
 * @returns {Promise<Object>} - ข้อมูลผู้ใช้ที่อัพเดตแล้ว
 */
async function updateUserSettings(userId, settings) {
  try {
    // เตรียมฟิลด์และค่าที่จะอัพเดต
    const updateFields = [];
    const values = [userId];
    let valueCounter = 2;
    
    if (settings.timezone !== undefined) {
      updateFields.push(`timezone = $${valueCounter}`);
      values.push(sanitizeInput(settings.timezone));
      valueCounter++;
    }
    
    if (settings.defaultCurrency !== undefined) {
      updateFields.push(`default_currency = $${valueCounter}`);
      values.push(sanitizeInput(settings.defaultCurrency));
      valueCounter++;
    }
    
    // ถ้าไม่มีฟิลด์ที่ต้องการอัพเดต
    if (updateFields.length === 0) {
      const user = await getUserById(userId);
      return user;
    }
    
    // อัพเดตข้อมูลและดึงข้อมูลใหม่
    const query = `
      UPDATE users
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await db.query(query, values);
    return result.rows[0];
  } catch (error) {
    logger.error(`Error updating settings for user ID ${userId}:`, error);
    throw error;
  }
}

/**
 * อัพเดตสถานะ Premium ของผู้ใช้
 * @param {number} userId - รหัสประจำตัวผู้ใช้ในฐานข้อมูล
 * @param {boolean} isPremium - สถานะ Premium ใหม่
 * @returns {Promise<Object>} - ข้อมูลผู้ใช้ที่อัพเดตแล้ว
 */
async function updatePremiumStatus(userId, isPremium) {
  try {
    const query = `
      UPDATE users
      SET premium = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await db.query(query, [userId, isPremium]);
    return result.rows[0];
  } catch (error) {
    logger.error(`Error updating premium status for user ID ${userId}:`, error);
    throw error;
  }
}

/**
 * ดึงข้อมูลผู้ใช้ตามรหัสในฐานข้อมูล
 * @param {number} userId - รหัสประจำตัวผู้ใช้ในฐานข้อมูล
 * @returns {Promise<Object|null>} - ข้อมูลผู้ใช้หรือ null ถ้าไม่พบ
 */
async function getUserById(userId) {
  try {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await db.query(query, [userId]);
    
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error(`Error getting user with ID ${userId}:`, error);
    throw error;
  }
}

/**
 * นับจำนวนการแจ้งเตือนที่ยังใช้งานของผู้ใช้
 * @param {number} userId - รหัสประจำตัวผู้ใช้ในฐานข้อมูล
 * @returns {Promise<number>} - จำนวนการแจ้งเตือนที่ยังใช้งาน
 */
async function countActiveAlerts(userId) {
  try {
    const query = 'SELECT COUNT(*) FROM alerts WHERE user_id = $1 AND is_active = true';
    const result = await db.query(query, [userId]);
    
    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    logger.error(`Error counting active alerts for user ID ${userId}:`, error);
    throw error;
  }
}

module.exports = {
  createUser,
  findUserByTelegramId,
  updateUserSettings,
  updatePremiumStatus,
  getUserById,
  countActiveAlerts,
};
