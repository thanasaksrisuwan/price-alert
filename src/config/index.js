/**
 * กำหนดค่าที่ใช้ทั่วไปในระบบ
 * ไฟล์นี้นำเข้าตัวแปรสภาพแวดล้อมและกำหนดค่าคงที่สำหรับใช้ในแอปพลิเคชัน
 */

require('dotenv').config();

const config = {
  // แอพพลิเคชันทั่วไป
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT, 10) || 3000,
    logLevel: process.env.LOG_LEVEL || 'info',
  },
  
  // การตั้งค่า Telegram Bot
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
  },
  
  // การตั้งค่าฐานข้อมูล
  database: {
    url: process.env.DATABASE_URL,
  },
  
  // การตั้งค่า Redis
  redis: {
    url: process.env.REDIS_URL,
  },
  
  // การตั้งค่า API ข้อมูลเหรียญคริปโต
  cryptoApis: {
    coingecko: {
      apiKey: process.env.COINGECKO_API_KEY,
      baseUrl: 'https://api.coingecko.com/api/v3',
    },
    binance: {
      apiKey: process.env.BINANCE_API_KEY,
      apiSecret: process.env.BINANCE_API_SECRET,
      baseUrl: 'https://api.binance.com',
      wsUrl: 'wss://stream.binance.com:9443/ws',
    },
    coinmarketcap: {
      apiKey: process.env.COINMARKETCAP_API_KEY,
      baseUrl: 'https://pro-api.coinmarketcap.com/v1',
    },
  },
  
  // การตั้งค่า News API
  newsApi: {
    apiKey: process.env.NEWS_API_KEY,
    baseUrl: 'https://newsapi.org/v2',
  },
  
  // การตั้งค่าการแจ้งเตือนและข้อจำกัด
  alerts: {
    checkInterval: parseInt(process.env.ALERT_CHECK_INTERVAL, 10) || 60000, // ตรวจสอบทุก 60 วินาที
    maxFreeAlerts: parseInt(process.env.MAX_FREE_ALERTS, 10) || 10,
  },
  
  // การตั้งค่าคิว
  queue: {
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY, 10) || 5,
  },
};

module.exports = config;
