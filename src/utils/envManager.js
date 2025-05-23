/**
 * การจัดการตัวแปรสภาพแวดล้อม (Environment Variables)
 * 
 * ไฟล์นี้ช่วยในการจัดการตัวแปรสภาพแวดล้อมให้ปลอดภัยและมีประสิทธิภาพ
 * โดยใช้ dotenv-vault เมื่อจำเป็น
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * ดึงค่าตัวแปรสภาพแวดล้อมพร้อมตรวจสอบและแจ้งเตือนหากไม่มีค่า
 * @param {string} key - ชื่อตัวแปรสภาพแวดล้อม
 * @param {string|null} defaultValue - ค่าเริ่มต้นหากไม่มีตัวแปร
 * @param {boolean} isRequired - ระบุว่าจำเป็นต้องมีตัวแปรนี้หรือไม่
 * @returns {string|null} ค่าของตัวแปรสภาพแวดล้อม
 */
function getEnvVar(key, defaultValue = null, isRequired = false) {
    const value = process.env[key];
    
    if (value === undefined) {
        if (isRequired) {
            const errorMessage = `ตัวแปรสภาพแวดล้อมที่จำเป็น "${key}" ไม่ถูกกำหนด`;
            logger.error(errorMessage);
            throw new Error(errorMessage);
        } else if (defaultValue !== null) {
            logger.warn(`ตัวแปรสภาพแวดล้อม "${key}" ไม่ถูกกำหนด ใช้ค่าเริ่มต้น: ${defaultValue}`);
            return defaultValue;
        } else {
            logger.warn(`ตัวแปรสภาพแวดล้อม "${key}" ไม่ถูกกำหนด และไม่มีค่าเริ่มต้น`);
            return null;
        }
    }
    
    return value;
}

/**
 * ตรวจสอบว่ามีการตั้งค่าตัวแปรสภาพแวดล้อมที่จำเป็นทั้งหมดหรือไม่
 * @returns {boolean} ค่า true หากมีตัวแปรสภาพแวดล้อมที่จำเป็นทั้งหมด
 */
function validateRequiredEnv() {
    try {
        // ตัวแปรสภาพแวดล้อมหลักที่จำเป็น
        const requiredVars = [
            'NODE_ENV',
            'TELEGRAM_BOT_TOKEN',
            'DATABASE_URL',
            'REDIS_URL',
            'ALERT_CHECK_INTERVAL',
            'MAX_FREE_ALERTS',
            'QUEUE_CONCURRENCY'
        ];
        
        // ตัวแปร WebSocket ที่จำเป็น
        const requiredWebSocketVars = [
            'MAX_WEBSOCKET_CONNECTIONS',
            'WEBSOCKET_CONNECTION_POOL_SIZE',
            'WEBSOCKET_RECONNECT_INTERVAL',
            'WEBSOCKET_RECONNECT_ATTEMPTS'
        ];
        
        // ตรวจสอบตัวแปรหลัก (เข้มงวด)
        for (const varName of requiredVars) {
            getEnvVar(varName, null, true);
        }
        
        // ตรวจสอบตัวแปร WebSocket (ไม่เข้มงวด)
        let allWebSocketVarsPresent = true;
        for (const varName of requiredWebSocketVars) {
            try {
                getEnvVar(varName, null, false);
            } catch (error) {
                logger.warn(`ตัวแปร WebSocket "${varName}" ไม่ถูกกำหนด จะใช้ค่าเริ่มต้น`);
                allWebSocketVarsPresent = false;
            }
        }
        
        if (!allWebSocketVarsPresent) {
            logger.info('บางตัวแปร WebSocket ไม่ถูกกำหนด แต่จะใช้ค่าเริ่มต้นแทน');
        }
        
        return true;
    } catch (error) {
        logger.error(`การตรวจสอบตัวแปรสภาพแวดล้อมล้มเหลว: ${error.message}`);
        return false;
    }
}

/**
 * สร้างไฟล์ .env จาก .env.example หากยังไม่มี
 * @returns {boolean} ค่า true หากสร้างหรือตรวจสอบสำเร็จ
 */
function ensureEnvFile() {
    try {
        const envPath = path.join(process.cwd(), '.env');
        const exampleEnvPath = path.join(process.cwd(), '.env.example');
        
        // ตรวจสอบว่ามีไฟล์ .env หรือไม่
        if (!fs.existsSync(envPath)) {
            if (fs.existsSync(exampleEnvPath)) {
                // คัดลอกจาก .env.example
                fs.copyFileSync(exampleEnvPath, envPath);
                logger.info('สร้างไฟล์ .env จาก .env.example สำเร็จ');
                
                // แสดงข้อความเตือน
                logger.warn('กรุณาแก้ไขไฟล์ .env เพื่อกำหนดค่าที่ถูกต้องสำหรับสภาพแวดล้อมของคุณ');
            } else {
                logger.error('ไม่พบไฟล์ .env และ .env.example');
                return false;
            }
        }
        
        return true;
    } catch (error) {
        logger.error(`เกิดข้อผิดพลาดในการตรวจสอบไฟล์ .env: ${error.message}`);
        return false;
    }
}

/**
 * แสดงข้อมูลเกี่ยวกับสภาพแวดล้อมปัจจุบัน
 * @returns {Object} ข้อมูลสภาพแวดล้อมที่ปลอดภัย (ไม่มีข้อมูลที่ละเอียดอ่อน)
 */
function getEnvInfo() {
    const safeInfo = {
        environment: getEnvVar('NODE_ENV', 'development'),
        port: getEnvVar('PORT', '3000'),
        logLevel: getEnvVar('LOG_LEVEL', 'info'),
        databaseConnected: !!getEnvVar('DATABASE_URL'),
        redisConnected: !!getEnvVar('REDIS_URL'),
        apiKeysConfigured: {
            coingecko: !!getEnvVar('COINGECKO_API_KEY'),
            binance: !!getEnvVar('BINANCE_API_KEY') && !!getEnvVar('BINANCE_API_SECRET'),
            coinmarketcap: !!getEnvVar('COINMARKETCAP_API_KEY'),
            newsapi: !!getEnvVar('NEWS_API_KEY')
        },
        telegramBotConfigured: !!getEnvVar('TELEGRAM_BOT_TOKEN'),
        alertSettings: {
            checkInterval: getEnvVar('ALERT_CHECK_INTERVAL', '60000'),
            maxFreeAlerts: getEnvVar('MAX_FREE_ALERTS', '10')
        },
        queueConcurrency: getEnvVar('QUEUE_CONCURRENCY', '5')
    };
    
    return safeInfo;
}

/**
 * ตรวจสอบและเตือนหากมีข้อมูลละเอียดอ่อนใน Git
 * เช่น API keys หรือ secrets ที่อาจรั่วไหลได้
 * @returns {boolean} ค่า true หากไม่พบความเสี่ยง
 */
function checkSensitiveDataInGit() {
    try {
        // ตรวจสอบว่า .env ถูกเพิ่มใน .gitignore หรือไม่
        const gitignorePath = path.join(process.cwd(), '.gitignore');
        if (fs.existsSync(gitignorePath)) {
            const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
            if (!gitignoreContent.includes('.env')) {
                logger.error('คำเตือน: ไฟล์ .env ไม่ได้ถูกกำหนดใน .gitignore อาจเกิดการรั่วไหลของข้อมูลละเอียดอ่อน');
                return false;
            }
        } else {
            logger.warn('ไม่พบไฟล์ .gitignore ควรสร้างและเพิ่ม .env ในนั้นเพื่อป้องกันการรั่วไหลของข้อมูล');
            return false;
        }
        
        return true;
    } catch (error) {
        logger.error(`เกิดข้อผิดพลาดในการตรวจสอบข้อมูลละเอียดอ่อน: ${error.message}`);
        return false;
    }
}

module.exports = {
    getEnvVar,
    validateRequiredEnv,
    ensureEnvFile,
    getEnvInfo,
    checkSensitiveDataInGit
};
