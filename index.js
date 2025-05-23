/**
 * จุดเริ่มต้นหลักของแอปพลิเคชัน Crypto Price Alert Bot
 */

require('dotenv').config();
const config = require('./src/config');
const logger = require('./src/utils/logger').createModuleLogger('Main');
const express = require('express');
const { Telegraf } = require('telegraf');
const database = require('./src/config/database');
const redis = require('./src/config/redis');
const queueService = require('./src/services/queueService');
const binanceInitializer = require('./src/services/binanceInitializer');

// สร้าง Express app
const app = express();

// Track application start time for health check
const appStartTime = Date.now();

// ตั้งค่า middleware พื้นฐาน
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple health check endpoint that doesn't require any service connections
app.get('/simple-health', (req, res) => {
  console.log('Simple health check called');
  res.status(200).send('OK');
});

// Add health check endpoint for Docker
app.get('/health', (req, res) => {
  // During initial startup, return OK even if services aren't connected yet
  const appStartupTime = 60000; // 60 seconds
  const isStartupPeriod = Date.now() - appStartTime < appStartupTime;
  
  // Check if essential services are connected
  const redisConnected = redis.isConnected();
  const dbConnected = database.isConnected();
  const healthy = redisConnected && dbConnected;
  
  if (healthy || isStartupPeriod) {
    logger.debug('Health check passed');
    res.status(200).json({ 
      status: 'healthy',
      startupPeriod: isStartupPeriod,
      redis: redisConnected,
      database: dbConnected
    });
  } else {
    logger.warn(`Health check failed: Redis=${redisConnected}, DB=${dbConnected}`);
    res.status(503).json({ 
      status: 'unhealthy',
      redis: redisConnected,
      database: dbConnected
    });
  }
});

// สร้าง instance ของ Telegram bot
const bot = new Telegraf(config.telegram.token);

/**
 * เริ่มต้นการทำงานของแอปพลิเคชัน
 * เชื่อมต่อฐานข้อมูล, Redis และเริ่มการทำงานของ bot และ Express server
 */
async function startApp() {
  try {
    // Start Express server before other services to ensure health check is available
    try {
      logger.info(`Attempting to start server on port ${config.app.port}...`);
      console.log(`Attempting to start server on port ${config.app.port}...`); // Direct to Docker logs
      
      const server = app.listen(config.app.port, '0.0.0.0', () => {
        logger.info(`Server is running on port ${config.app.port}`);
        console.log(`Server is running on port ${config.app.port}`); // Direct to Docker logs
      });
      
      server.on('error', (err) => {
        logger.error(`Server error: ${err.message}`, err);
        console.error(`Server error: ${err.message}`); // Direct to Docker logs
      });
    } catch (err) {
      logger.error(`Exception when starting server: ${err.message}`, err);
      console.error(`Exception when starting server: ${err.message}`); // Direct to Docker logs
      // Continue with other services even if the server fails
    }
    
    // เชื่อมต่อกับ Redis
    await redis.connect();
    
    // ทดสอบการเชื่อมต่อกับฐานข้อมูล
    const dbConnected = await database.testConnection();
    if (!dbConnected) {
      throw new Error('Failed to connect to database');
    }
    
    // เริ่มต้นคิวงาน
    await queueService.initializeQueues();
    logger.info('Queue service initialized');
    
    // เริ่มต้นติดตามข้อมูลราคาจาก Binance สำหรับเหรียญยอดนิยม
    binanceInitializer.initializePopularCryptoStreams()
      .then(result => {
        if (result.success) {
          logger.info(`Successfully connected to Binance streams for ${binanceInitializer.POPULAR_CRYPTOS.length} popular cryptocurrencies`);
        } else {
          logger.warn('Connection to Binance streams was not fully successful, will retry on-demand');
        }
      })
      .catch(err => logger.error('Error initializing Binance streams:', err));
    
    // เริ่มโหลด command handlers
    require('./src/bot')(bot);
    
    // เริ่ม Telegram bot
    await bot.launch();
    logger.info('Telegram bot started successfully');
    
    // No need to start Express server here since we already started it at the beginning
    // just wrap up the startup process
    logger.info('Application startup completed successfully');
    console.log('Application startup completed successfully'); // Direct to Docker logs
      // จัดการการปิดการทำงานอย่างสง่างาม
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      
      // หยุดการทำงานของ bot
      bot.stop('SIGINT');
      
      // ปิดเซิร์ฟเวอร์
      server.close(() => {
        logger.info('Express server closed');
      });
      
      // ปิดคิวงาน
      await queueService.closeQueues();
      logger.info('Queue services closed');
      
      // ปิดการเชื่อมต่อ Redis
      await redis.disconnect();
      
      // ปิดการเชื่อมต่อฐานข้อมูล
      await database.pool.end();
      
      process.exit(0);
    };
    
    // จัดการสัญญาณการปิดระบบ
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

// เริ่มการทำงานของแอปพลิเคชัน
startApp();
