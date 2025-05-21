/**
 * ทดสอบการเรียกใช้ Enhanced Price Service
 * โปรแกรมนี้จะเรียกใช้งาน EnhancedPriceService เพื่อดึงข้อมูลราคาและ market cap
 */

// โหลดโมดูลที่จำเป็น
const PriceService = require('./src/services/priceService');
const EnhancedPriceService = require('./src/services/enhancedPriceService');
const config = require('./src/config');
const redis = require('./src/config/redis');
const logger = require('./src/utils/logger').createModuleLogger('TestScript');

// ให้รหัสเหรียญ BTC และสกุลเงิน THB เป็นค่าเริ่มต้น
const symbol = process.argv[2] || 'BTC';
const currency = process.argv[3] || 'THB';

/**
 * ฟังก์ชันหลักในการทดสอบ
 */
async function testEnhancedPriceService() {
  try {
    logger.info(`Fetching price data for ${symbol} in ${currency}...`);
    
    // ดึงราคาจากบริการหลัก (Binance First approach)
    const basicPriceData = await PriceService.getPrice(symbol, currency);
    logger.info('Basic price data (before enhancement):');
    logger.info(JSON.stringify(basicPriceData, null, 2));
    
    if (!basicPriceData) {
      logger.error('Failed to get basic price data');
      process.exit(1);
    }
    
    // ตรวจสอบว่ามี market cap หรือไม่
    logger.info(`Market cap from basic service: ${basicPriceData.marketCap || 0}`);
    
    // เสริมข้อมูล market cap
    logger.info('Enhancing price data with market cap...');
    const enhancedData = await EnhancedPriceService.enhancePriceData(basicPriceData, symbol, currency);
    
    logger.info('Enhanced price data:');
    logger.info(JSON.stringify(enhancedData, null, 2));
    logger.info(`Enhanced market cap: ${enhancedData.marketCap || 0}`);
    
    // แสดงผลลัพธ์
    logger.info('Test completed successfully');
    
    // ปิดการเชื่อมต่อ Redis
    await redis.quit();
    
    process.exit(0);
  } catch (error) {
    logger.error('Error during test:', error);
    process.exit(1);
  }
}

// เริ่มการทดสอบ
testEnhancedPriceService();
