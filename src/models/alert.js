/**
 * โมเดลสำหรับการแจ้งเตือนราคา
 * จัดการการเข้าถึงและจัดการข้อมูลการแจ้งเตือนในฐานข้อมูล
 */

const db = require('../config/database');
const logger = require('../utils/logger').createModuleLogger('AlertModel');
const { sanitizeInput, isValidCryptoSymbol } = require('../utils/validators');
const UserModel = require('./user');
const config = require('../config');

/**
 * สร้างการแจ้งเตือนใหม่
 * @param {Object} alert - ข้อมูลการแจ้งเตือน
 * @param {number} alert.userId - รหัสผู้ใช้ที่สร้างการแจ้งเตือน
 * @param {string} alert.symbol - สัญลักษณ์เหรียญคริปโต
 * @param {string} alert.alertType - ประเภทการแจ้งเตือน ('price_above', 'price_below', 'percent_change', etc.)
 * @param {number} alert.targetValue - ค่าเป้าหมายที่จะแจ้งเตือน
 * @param {number} [alert.currentValue] - ค่าปัจจุบันขณะที่ตั้งการแจ้งเตือน
 * @returns {Promise<Object>} - ข้อมูลการแจ้งเตือนที่สร้าง
 */
async function createAlert(alert) {
  try {
    // ตรวจสอบข้อจำกัดการสร้างแจ้งเตือนสำหรับผู้ใช้ฟรี
    const user = await UserModel.getUserById(alert.userId);
    const activeAlertsCount = await UserModel.countActiveAlerts(alert.userId);
    
    if (!user.premium && activeAlertsCount >= config.alerts.maxFreeAlerts) {
      throw new Error(`Free users can only have ${config.alerts.maxFreeAlerts} active alerts. Upgrade to premium for unlimited alerts.`);
    }
    
    // ตรวจสอบความถูกต้องของข้อมูล
    if (!isValidCryptoSymbol(alert.symbol)) {
      throw new Error('Invalid cryptocurrency symbol');
    }
    
    const query = `
      INSERT INTO alerts (user_id, symbol, alert_type, target_value, current_value, is_active)
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING id, user_id, symbol, alert_type, target_value, current_value, is_active, triggered_at, created_at
    `;
    
    const values = [
      alert.userId,
      sanitizeInput(alert.symbol.toUpperCase()), // แปลงเป็นตัวพิมพ์ใหญ่และทำความสะอาด
      sanitizeInput(alert.alertType),
      alert.targetValue,
      alert.currentValue || null
    ];
    
    const result = await db.query(query, values);
    return result.rows[0];
  } catch (error) {
    logger.error('Error creating alert:', error);
    throw error;
  }
}

/**
 * ค้นหาการแจ้งเตือนที่ใช้งานอยู่ทั้งหมด
 * @returns {Promise<Array>} - รายการการแจ้งเตือนที่ใช้งานอยู่
 */
async function findAllActiveAlerts() {
  try {
    const query = 'SELECT * FROM alerts WHERE is_active = true';
    const result = await db.query(query);
    
    return result.rows;
  } catch (error) {
    logger.error('Error finding active alerts:', error);
    throw error;
  }
}

/**
 * ค้นหาการแจ้งเตือนที่ใช้งานอยู่ของผู้ใช้
 * @param {number} userId - รหัสผู้ใช้
 * @returns {Promise<Array>} - รายการการแจ้งเตือนที่ใช้งานอยู่ของผู้ใช้
 */
async function findActiveAlertsByUser(userId) {
  try {
    const query = 'SELECT * FROM alerts WHERE user_id = $1 AND is_active = true';
    const result = await db.query(query, [userId]);
    
    return result.rows;
  } catch (error) {
    logger.error(`Error finding active alerts for user ID ${userId}:`, error);
    throw error;
  }
}

/**
 * ค้นหาการแจ้งเตือนตามรหัส
 * @param {number} alertId - รหัสการแจ้งเตือน
 * @returns {Promise<Object|null>} - ข้อมูลการแจ้งเตือนหรือ null ถ้าไม่พบ
 */
async function findAlertById(alertId) {
  try {
    const query = 'SELECT * FROM alerts WHERE id = $1';
    const result = await db.query(query, [alertId]);
    
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error(`Error finding alert with ID ${alertId}:`, error);
    throw error;
  }
}

/**
 * อัพเดตสถานะการแจ้งเตือนเป็นทริกเกอร์แล้ว
 * @param {number} alertId - รหัสการแจ้งเตือน
 * @param {number} currentValue - ค่าปัจจุบันที่เป็นเหตุให้เกิดการแจ้งเตือน
 * @returns {Promise<Object>} - ข้อมูลการแจ้งเตือนที่อัพเดตแล้ว
 */
async function markAlertAsTriggered(alertId, currentValue) {
  try {
    const query = `
      UPDATE alerts
      SET is_active = false, triggered_at = NOW(), current_value = $2
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await db.query(query, [alertId, currentValue]);
    return result.rows[0];
  } catch (error) {
    logger.error(`Error marking alert ID ${alertId} as triggered:`, error);
    throw error;
  }
}

/**
 * ลบการแจ้งเตือน
 * @param {number} alertId - รหัสการแจ้งเตือน
 * @param {number} userId - รหัสผู้ใช้ (สำหรับตรวจสอบสิทธิ์)
 * @returns {Promise<boolean>} - true ถ้าลบสำเร็จ
 */
async function deleteAlert(alertId, userId) {
  try {
    // ตรวจสอบว่าการแจ้งเตือนเป็นของผู้ใช้นี้หรือไม่
    const alert = await findAlertById(alertId);
    
    if (!alert) {
      throw new Error('Alert not found');
    }
    
    if (alert.user_id !== userId) {
      throw new Error('You do not have permission to delete this alert');
    }
    
    const query = 'DELETE FROM alerts WHERE id = $1';
    await db.query(query, [alertId]);
    
    return true;
  } catch (error) {
    logger.error(`Error deleting alert ID ${alertId}:`, error);
    throw error;
  }
}

/**
 * ค้นหาการแจ้งเตือนสำหรับแต่ละสัญลักษณ์เหรียญ
 * @param {string} symbol - สัญลักษณ์เหรียญคริปโต
 * @returns {Promise<Array>} - รายการการแจ้งเตือนที่ใช้งานอยู่สำหรับสัญลักษณ์นี้
 */
async function findActiveAlertsBySymbol(symbol) {
  try {
    const query = 'SELECT * FROM alerts WHERE symbol = $1 AND is_active = true';
    const result = await db.query(query, [sanitizeInput(symbol.toUpperCase())]);
    
    return result.rows;
  } catch (error) {
    logger.error(`Error finding active alerts for symbol ${symbol}:`, error);
    throw error;
  }
}

module.exports = {
  createAlert,
  findAllActiveAlerts,
  findActiveAlertsByUser,
  findAlertById,
  markAlertAsTriggered,
  deleteAlert,
  findActiveAlertsBySymbol,
};
