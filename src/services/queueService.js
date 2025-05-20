/**
 * จัดการคิวงานสำหรับการประมวลผลในเบื้องหลัง
 */

const Queue = require('bull');
const config = require('../config');
const logger = require('../utils/logger').createModuleLogger('QueueHandler');
const AlertService = require('../services/alertService');
const PriceService = require('../services/priceService');

// สร้างคิวงาน
const alertCheckQueue = new Queue('alertCheck', config.redis.url);
const priceUpdateQueue = new Queue('priceUpdate', config.redis.url);

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
 * เริ่มต้นระบบการจัดการคิวงาน
 */
async function initializeQueues() {
  try {
    logger.info('Initializing background queues');
    
    // ตรวจสอบการเชื่อมต่อ
    await alertCheckQueue.isReady();
    await priceUpdateQueue.isReady();
    
    // ตั้งค่า event handlers
    setupQueueEvents(alertCheckQueue, 'Alert Check');
    setupQueueEvents(priceUpdateQueue, 'Price Update');
    
    // ตั้งเวลางาน
    await scheduleAlertChecks();
    await schedulePopularPriceUpdates();
    
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
  } catch (error) {
    logger.error('Error closing queues:', error);
  }
}

module.exports = {
  alertCheckQueue,
  priceUpdateQueue,
  initializeQueues,
  closeQueues,
  scheduleAlertChecks,
  schedulePopularPriceUpdates
};
