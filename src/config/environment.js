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
        concurrency: parseInt(getEnvVar('QUEUE_CONCURRENCY', '10')),
        websocketConcurrency: parseInt(getEnvVar('WEBSOCKET_CONCURRENCY', '20'))
    },
    
    // ตั้งค่า WebSocket
    websocket: {
        maxConnections: parseInt(getEnvVar('MAX_WEBSOCKET_CONNECTIONS', '50')),
        connectionPoolSize: parseInt(getEnvVar('WEBSOCKET_CONNECTION_POOL_SIZE', '25')),
        reconnectInterval: parseInt(getEnvVar('WEBSOCKET_RECONNECT_INTERVAL', '5000')),
        reconnectAttempts: parseInt(getEnvVar('WEBSOCKET_RECONNECT_ATTEMPTS', '5')),
        connectionTimeout: parseInt(getEnvVar('WEBSOCKET_CONNECTION_TIMEOUT', '15000')),
        maxStreamsPerConnection: parseInt(getEnvVar('WEBSOCKET_MAX_STREAMS_PER_CONNECTION', '25')),
        keepAliveInterval: parseInt(getEnvVar('WEBSOCKET_KEEP_ALIVE_INTERVAL', '30000')),
        queueSizeThreshold: parseInt(getEnvVar('WEBSOCKET_QUEUE_SIZE_THRESHOLD', '10')),
        poolScaleDownThreshold: parseFloat(getEnvVar('WEBSOCKET_POOL_SCALE_DOWN_THRESHOLD', '0.3')),
        poolScaleUpThreshold: parseFloat(getEnvVar('WEBSOCKET_POOL_SCALE_UP_THRESHOLD', '0.7')),
        monitorInterval: parseInt(getEnvVar('WEBSOCKET_MONITOR_INTERVAL', '60000')),
        batchSize: parseInt(getEnvVar('WEBSOCKET_BATCH_SIZE', '5')),
        batchDelay: parseInt(getEnvVar('WEBSOCKET_BATCH_DELAY', '1000'))
    },
    
    // ตั้งค่าเครือข่าย
    network: {
        apiRequestTimeout: parseInt(getEnvVar('API_REQUEST_TIMEOUT', '30000')),
        apiMaxRetries: parseInt(getEnvVar('API_MAX_RETRIES', '3')),
        apiRetryDelay: parseInt(getEnvVar('API_RETRY_DELAY', '1000'))
    },
    
    // ตั้งค่าสกุลเงิน
    currency: {
        defaultCurrency: getEnvVar('DEFAULT_CURRENCY', 'USD')
    },
    
    // ตั้งค่าการเก็บแคช
    cache: {
        priceCacheTtl: parseInt(getEnvVar('PRICE_CACHE_TTL', '60')),
        coinMetadataCacheTtl: parseInt(getEnvVar('COIN_METADATA_CACHE_TTL', '3600')),
        newsCacheTtl: parseInt(getEnvVar('NEWS_CACHE_TTL', '900'))
    },
    
    // ตั้งค่า Rate Limiting
    rateLimit: {
        maxRequests: parseInt(getEnvVar('RATE_LIMIT_MAX_REQUESTS', '60')),
        blockDuration: parseInt(getEnvVar('RATE_LIMIT_BLOCK_DURATION', '300')),
        storeSize: parseInt(getEnvVar('RATE_LIMIT_STORE_SIZE', '10000'))
    },
    
    // ตั้งค่าความปลอดภัย
    security: {
        enableCors: getEnvVar('ENABLE_CORS', 'true') === 'true',
        corsAllowedOrigins: getEnvVar('CORS_ALLOWED_ORIGINS', 'http://localhost:3000').split(','),
        jwtExpiration: parseInt(getEnvVar('JWT_EXPIRATION', '86400')),
        accountLockoutDuration: parseInt(getEnvVar('ACCOUNT_LOCKOUT_DURATION', '300')),
        maxFailedLoginAttempts: parseInt(getEnvVar('MAX_FAILED_LOGIN_ATTEMPTS', '5'))
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
