/**
 * การตั้งค่าสภาพแวดล้อม
 * 
 * ไฟล์นี้ใช้สำหรับตั้งค่าและตรวจสอบตัวแปรสภาพแวดล้อมทั้งหมดของแอปพลิเคชัน
 * โดยใช้ envManager เพื่อดึงค่าตัวแปรอย่างปลอดภัย
 */
const { getEnvVar, validateRequiredEnv, ensureEnvFile } = require('../utils/envManager');
const logger = require('../utils/logger');

// ตรวจสอบและสร้างไฟล์ .env ถ้าจำเป็น
ensureEnvFile();

// ตรวจสอบว่าตัวแปรสภาพแวดล้อมที่จำเป็นถูกตั้งค่าแล้ว
const isEnvValid = validateRequiredEnv();
if (!isEnvValid && process.env.NODE_ENV === 'production') {
    throw new Error('ตัวแปรสภาพแวดล้อมไม่ครบถ้วน ไม่สามารถเริ่มแอปพลิเคชันในโหมด Production ได้');
} else if (!isEnvValid) {
    logger.warn('ตัวแปรสภาพแวดล้อมบางตัวไม่ครบถ้วน บางฟีเจอร์อาจไม่ทำงาน');
}

// ตั้งค่าสภาพแวดล้อมที่ใช้ในแอปพลิเคชัน
const environment = {
    // ตั้งค่าทั่วไปของแอปพลิเคชัน
    app: {
        nodeEnv: getEnvVar('NODE_ENV', 'development'),
        port: parseInt(getEnvVar('PORT', '3000')),
        logLevel: getEnvVar('LOG_LEVEL', 'debug')
    },
    
    // ตั้งค่า Telegram Bot
    telegram: {
        botToken: getEnvVar('TELEGRAM_BOT_TOKEN', '', true)
    },
    
    // ตั้งค่าฐานข้อมูล
    database: {
        url: getEnvVar('DATABASE_URL', 'postgresql://postgres:password@localhost:5433/price_alert_db', true)
    },
    
    // ตั้งค่า Redis
    redis: {
        url: getEnvVar('REDIS_URL', 'redis://localhost:6380', true)
    },
    
    // ตั้งค่า API Keys
    apiKeys: {
        coingecko: getEnvVar('COINGECKO_API_KEY', ''),
        binanceKey: getEnvVar('BINANCE_API_KEY', ''),
        binanceSecret: getEnvVar('BINANCE_API_SECRET', ''),
        coinmarketcap: getEnvVar('COINMARKETCAP_API_KEY', ''),
        newsApi: getEnvVar('NEWS_API_KEY', '')
    },
    
    // ตั้งค่าการแจ้งเตือน
    alerts: {
        checkInterval: parseInt(getEnvVar('ALERT_CHECK_INTERVAL', '60000')),
        maxFreeAlerts: parseInt(getEnvVar('MAX_FREE_ALERTS', '10'))
    },
    
    // ตั้งค่าคิว
    queue: {
        concurrency: parseInt(getEnvVar('QUEUE_CONCURRENCY', '5'))
    },
    
    // ตรวจสอบว่าเป็นสภาพแวดล้อมการพัฒนาหรือไม่
    isDev: () => environment.app.nodeEnv === 'development',
    
    // ตรวจสอบว่าเป็นสภาพแวดล้อมการทดสอบหรือไม่
    isTest: () => environment.app.nodeEnv === 'test',
    
    // ตรวจสอบว่าเป็นสภาพแวดล้อมการผลิตหรือไม่
    isProd: () => environment.app.nodeEnv === 'production'
};

// ส่งออกการตั้งค่าสภาพแวดล้อม
module.exports = environment;
