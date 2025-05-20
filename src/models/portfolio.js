/**
 * โมเดลสำหรับการจัดการข้อมูลพอร์ตโฟลิโอ
 * จัดการการเข้าถึงและจัดการข้อมูลพอร์ตโฟลิโอในฐานข้อมูล
 */

const db = require('../config/database');
const logger = require('../utils/logger').createModuleLogger('PortfolioModel');
const { sanitizeInput, isValidCryptoSymbol, isValidNumber } = require('../utils/validators');

/**
 * เพิ่มหรืออัพเดตรายการในพอร์ตโฟลิโอ
 * @param {Object} portfolioItem - ข้อมูลรายการพอร์ตโฟลิโอ
 * @param {number} portfolioItem.userId - รหัสผู้ใช้
 * @param {string} portfolioItem.symbol - สัญลักษณ์เหรียญคริปโต
 * @param {number} portfolioItem.quantity - จำนวนเหรียญ
 * @param {number} portfolioItem.buyPrice - ราคาที่ซื้อต่อเหรียญ
 * @returns {Promise<Object>} - ข้อมูลรายการพอร์ตโฟลิโอที่เพิ่มหรืออัพเดตแล้ว
 */
async function addOrUpdatePortfolioItem(portfolioItem) {
  try {
    // ตรวจสอบความถูกต้องของข้อมูล
    if (!isValidCryptoSymbol(portfolioItem.symbol)) {
      throw new Error('Invalid cryptocurrency symbol');
    }
    
    if (!isValidNumber(portfolioItem.quantity) || portfolioItem.quantity <= 0) {
      throw new Error('Quantity must be a positive number');
    }
    
    if (!isValidNumber(portfolioItem.buyPrice) || portfolioItem.buyPrice < 0) {
      throw new Error('Buy price must be a non-negative number');
    }
    
    // ทำความสะอาดข้อมูลนำเข้า
    const symbol = sanitizeInput(portfolioItem.symbol.toUpperCase());
    
    const query = `
      INSERT INTO portfolio (user_id, symbol, quantity, buy_price)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, symbol) DO UPDATE
      SET quantity = $3, buy_price = $4
      RETURNING id, user_id, symbol, quantity, buy_price, buy_date
    `;
    
    const values = [
      portfolioItem.userId,
      symbol,
      portfolioItem.quantity,
      portfolioItem.buyPrice
    ];
    
    const result = await db.query(query, values);
    return result.rows[0];
  } catch (error) {
    logger.error('Error adding or updating portfolio item:', error);
    throw error;
  }
}

/**
 * ดึงรายการพอร์ตโฟลิโอทั้งหมดของผู้ใช้
 * @param {number} userId - รหัสผู้ใช้
 * @returns {Promise<Array>} - รายการพอร์ตโฟลิโอของผู้ใช้
 */
async function getPortfolioByUser(userId) {
  try {
    const query = 'SELECT * FROM portfolio WHERE user_id = $1 ORDER BY symbol';
    const result = await db.query(query, [userId]);
    
    return result.rows;
  } catch (error) {
    logger.error(`Error getting portfolio for user ID ${userId}:`, error);
    throw error;
  }
}

/**
 * ดึงรายการพอร์ตโฟลิโอเฉพาะของเหรียญ
 * @param {number} userId - รหัสผู้ใช้
 * @param {string} symbol - สัญลักษณ์เหรียญคริปโต
 * @returns {Promise<Object|null>} - ข้อมูลรายการพอร์ตโฟลิโอหรือ null ถ้าไม่พบ
 */
async function getPortfolioItemBySymbol(userId, symbol) {
  try {
    const query = 'SELECT * FROM portfolio WHERE user_id = $1 AND symbol = $2';
    const result = await db.query(query, [userId, sanitizeInput(symbol.toUpperCase())]);
    
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error(`Error getting portfolio item for symbol ${symbol}:`, error);
    throw error;
  }
}

/**
 * ลบรายการพอร์ตโฟลิโอ
 * @param {number} userId - รหัสผู้ใช้
 * @param {string} symbol - สัญลักษณ์เหรียญคริปโต
 * @returns {Promise<boolean>} - true ถ้าลบสำเร็จ
 */
async function removePortfolioItem(userId, symbol) {
  try {
    const query = 'DELETE FROM portfolio WHERE user_id = $1 AND symbol = $2';
    const result = await db.query(query, [userId, sanitizeInput(symbol.toUpperCase())]);
    
    return result.rowCount > 0;
  } catch (error) {
    logger.error(`Error removing portfolio item for symbol ${symbol}:`, error);
    throw error;
  }
}

module.exports = {
  addOrUpdatePortfolioItem,
  getPortfolioByUser,
  getPortfolioItemBySymbol,
  removePortfolioItem,
};
