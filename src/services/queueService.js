/**
 * จัดการคิวงานสำหรับการประมวลผลในเบื้องหลัง
 */

const Queue = require('bull');
const config = require('../config');
const logger = require('../utils/logger').createModuleLogger('QueueHandler');
const AlertService = require('../services/alertService');
const PriceService = require('../services/priceService');
const binancePriceStreamService = require('./binancePriceStreamService');

// สร้างคิวงาน
const alertCheckQueue = new Queue('alertCheck', config.redis.url);
const priceUpdateQueue = new Queue('priceUpdate', config.redis.url);
const websocketQueue = new Queue('websocketManage', config.redis.url);

// กำหนดการทำงานพร้อมกัน
alertCheckQueue.process(config.queue.concurrency, async (job) => {
  try {
    logger.debug(`Processing alert check job ${job.id}`);
    
    // เรียกใช้บริการตรวจสอบการแจ้งเตือน
    await AlertService.checkAllAlerts();
    
    return { success: true, timestamp: new Date().toISOString() };
  } catch (error) {
    logger.error('Error processing alert check job:', error);
    throw error;
  }
});

priceUpdateQueue.process(config.queue.concurrency, async (job) => {
  try {
    logger.debug(`Processing price update job ${job.id}`);
    const { symbols } = job.data;
    
    // ดึงราคาล่าสุดและอัพเดตใน cache
    for (const symbol of symbols) {
      await PriceService.getPrice(symbol, 'USD', true); // force update
    }
    
    return { success: true, updatedSymbols: symbols };
  } catch (error) {
    logger.error('Error processing price update job:', error);
    throw error;
  }
});

// ใช้ค่า concurrency ที่กำหนดไว้สำหรับ websocket โดยเฉพาะ
const websocketConcurrency = config.queue.websocketConcurrency || Math.max(20, config.queue.concurrency * 2);
websocketQueue.process(websocketConcurrency, async (job) => {
  try {
    logger.debug(`Processing websocket job ${job.id}`);
    const { action, symbols, options } = job.data;
    
    if (action === 'subscribe') {
      // ตรวจสอบว่าต้องการใช้การเชื่อมต่อแบบ staggered หรือไม่
      if (options && options.staggered) {
        const batchSize = options.batchSize || 10;
        const delay = options.delay || 2000;
        
        // สมัครสมาชิกข้อมูลราคาสำหรับเหรียญหลายเหรียญแบบเว้นระยะ
        const results = await binancePriceStreamService.subscribeWithStaggeredBatches(symbols, batchSize, delay);
        return { success: true, results };
      } else {
        // สมัครสมาชิกข้อมูลราคาสำหรับเหรียญหลายเหรียญพร้อมกัน
        const results = await binancePriceStreamService.subscribeToMultipleTickerStream(symbols);
        return { success: true, results };
      }
    } else if (action === 'unsubscribe') {
      // ยกเลิกการสมัครสมาชิก
      for (const symbol of symbols) {
        binancePriceStreamService.unsubscribeFromPriceUpdates(symbol);
      }
      return { success: true, action: 'unsubscribed' };
    } else if (action === 'status') {
      // ตรวจสอบสถานะการเชื่อมต่อ
      const status = binancePriceStreamService.getConnectionStatus();
      return { success: true, status };
    }
    
    throw new Error(`Unknown websocket action: ${action}`);
  } catch (error) {
    logger.error('Error processing websocket job:', error);
    throw error;
  }
});

/**
 * ตั้งเวลาคิวงานการตรวจสอบการแจ้งเตือน
 */
async function scheduleAlertChecks() {
  try {
    // ลบงานที่กำหนดเวลาไว้ทั้งหมดก่อน
    try {
      await alertCheckQueue.removeRepeatable();
    } catch (removeError) {
      logger.warn('Error removing repeatable alert checks, might be first run:', removeError.message);
      // Continue execution even if this fails
    }
    
    // กำหนดเวลาตรวจสอบการแจ้งเตือนทุก X นาที
    const interval = config.alerts.checkInterval || 60000; // ms
    
    try {
      await alertCheckQueue.add(
        {}, // empty data
        {
          repeat: {
            every: interval
          },
          jobId: 'regularAlertCheck'
        }
      );
      
      logger.info(`Alert check scheduled to run every ${interval}ms`);
    } catch (addError) {
      logger.error('Error adding repeatable alert check job:', addError.message);
      // Create a one-time job instead as fallback
      await alertCheckQueue.add({}, { jobId: 'oneTimeAlertCheck' });
      logger.info('Created one-time alert check job as fallback');
    }
  } catch (error) {
    logger.error('Error scheduling alert checks:', error);
  }
}

/**
 * กำหนดเวลาอัพเดตราคาเหรียญยอดนิยม
 * @param {Array} popularSymbols - สัญลักษณ์เหรียญยอดนิยม
 */
async function schedulePopularPriceUpdates(popularSymbols = ['BTC', 'ETH', 'USDT', 'BNB', 'SOL']) {
  try {
    // ลบงานที่กำหนดเวลาไว้ทั้งหมดก่อน    
    try {
      await priceUpdateQueue.removeRepeatable('popularCoins');
    } catch (removeError) {
      logger.warn('Error removing repeatable price updates, might be first run:', removeError);
      // Continue execution even if this fails
    }
    
    // กำหนดเวลาอัพเดตราคาทุก 1 นาที
    try {
      await priceUpdateQueue.add(
        { symbols: popularSymbols },
        {
          repeat: {
            every: 60000 // 1 minute
          },
          jobId: 'popularCoins'
        }
      );
      
      logger.info(`Popular coin price updates scheduled (${popularSymbols.join(', ')})`);
    } catch (addError) {
      logger.error('Error adding repeatable price update job:', addError.message);
      // Create a one-time job instead as fallback
      await priceUpdateQueue.add({ symbols: popularSymbols }, { jobId: 'oneTimePopularCoins' });
      logger.info('Created one-time popular coin price update job as fallback');
    }
  } catch (error) {
    logger.error('Error scheduling popular price updates:', error);
  }
}

/**
 * กำหนดเวลาการเชื่อมต่อ WebSocket สำหรับเหรียญยอดนิยม
 * @param {Array} popularSymbols - สัญลักษณ์เหรียญยอดนิยม
 */
async function setupWebSocketConnections(popularSymbols = ['BTC', 'ETH', 'USDT', 'BNB', 'SOL', 'XRP', 'USDC', 'ADA', 'AVAX', 'DOGE']) {
  try {
    logger.info(`Setting up WebSocket connections for popular coins: ${popularSymbols.join(', ')}`);
    
    // สร้างงานสำหรับการเชื่อมต่อ WebSocket
    await websocketQueue.add(
      {
        action: 'subscribe',
        symbols: popularSymbols,
        options: {
          staggered: true,  // ใช้การเชื่อมต่อแบบเว้นระยะ
          batchSize: 5,     // แบ่งเป็นชุดละ 5 เหรียญ
          delay: 1000       // รอ 1 วินาทีระหว่างชุด
        }
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        },
        timeout: 60000,
        jobId: 'initialWebSocketSetup'
      }
    );
  } catch (error) {
    logger.error('Error setting up WebSocket connections:', error);
  }
}

/**
 * เริ่มต้นระบบการจัดการคิวงาน
 */
async function initializeQueues() {
  try {
    logger.info('Initializing background queues');
    
    // ตรวจสอบการเชื่อมต่อ
    await alertCheckQueue.isReady();
    await priceUpdateQueue.isReady();
    await websocketQueue.isReady();
    
    // ตั้งค่า event handlers
    setupQueueEvents(alertCheckQueue, 'Alert Check');
    setupQueueEvents(priceUpdateQueue, 'Price Update');
    setupQueueEvents(websocketQueue, 'WebSocket Manage');
    
    // ตั้งเวลางาน
    await scheduleAlertChecks();
    await schedulePopularPriceUpdates();
    
    // ตั้งค่า WebSocket connections
    await setupWebSocketConnections();
    
    logger.info('Background queues initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize queues:', error);
    throw error;
  }
}

/**
 * ตั้งค่า event handlers สำหรับคิว
 * @param {Object} queue - คิวงาน Bull
 * @param {string} queueName - ชื่อคิวสำหรับแสดงใน logs
 */
function setupQueueEvents(queue, queueName) {
  queue.on('completed', (job, result) => {
    logger.debug(`${queueName} job ${job.id} completed`);
  });
  
  queue.on('failed', (job, error) => {
    logger.error(`${queueName} job ${job.id} failed:`, error);
  });
  
  queue.on('stalled', (job) => {
    logger.warn(`${queueName} job ${job.id} stalled`);
  });
}

/**
 * ปิดการเชื่อมต่อของคิวทั้งหมด
 */
async function closeQueues() {
  try {
    logger.info('Closing queues');
    await alertCheckQueue.close();
    await priceUpdateQueue.close();
    await websocketQueue.close();
  } catch (error) {
    logger.error('Error closing queues:', error);
  }
}

module.exports = {
  alertCheckQueue,
  priceUpdateQueue,
  websocketQueue,
  initializeQueues,
  closeQueues,
  scheduleAlertChecks,
  schedulePopularPriceUpdates,
  setupWebSocketConnections
};
