/**
 * ระบบบันทึกล็อกสำหรับแอปพลิเคชัน
 * ไฟล์นี้ให้บริการบันทึกล็อกที่มีระดับความสำคัญต่างๆ
 */

const winston = require('winston');
const config = require('../config');

// กำหนดรูปแบบของล็อก
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// สร้าง logger instance
const logger = winston.createLogger({
  level: config.app.logLevel,
  format: logFormat,
  defaultMeta: { service: 'crypto-price-alert' },
  transports: [
    // บันทึกล็อกข้อผิดพลาดลงในไฟล์
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    // บันทึกล็อกทั้งหมดลงในไฟล์
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// เพิ่มการแสดงล็อกในคอนโซลในโหมดไม่ใช่โปรดักชัน
if (config.app.nodeEnv !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }));
}

/**
 * สร้างล็อกเกอร์เฉพาะสำหรับโมดูล
 * @param {string} moduleName - ชื่อของโมดูลที่ใช้ล็อกเกอร์
 * @returns {object} winston logger สำหรับโมดูลนั้น
 */
function createModuleLogger(moduleName) {
  return logger.child({ module: moduleName });
}

module.exports = {
  logger,
  createModuleLogger,
};
