/**
 * Binance Initializer
 * 
 * ทำการเชื่อมต่อและสมัครสมาชิกสตรีมข้อมูลราคาสำหรับเหรียญยอดนิยมตั้งแต่เริ่มต้นระบบ
 * เพื่อให้มีข้อมูลราคาล่าสุดพร้อมใช้งานทันที
 */

const logger = require('../utils/logger').createModuleLogger('BinanceInitializer');
const binancePriceStreamService = require('./binancePriceStreamService');

// รายชื่อเหรียญยอดนิยมที่ต้องการติดตามข้อมูลตั้งแต่เริ่มต้น
const POPULAR_CRYPTOS = [
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 
  'ADA', 'DOGE', 'SHIB', 'MATIC', 'DOT',
  'AVAX', 'LTC', 'LINK', 'UNI', 'ATOM'
];

/**
 * เริ่มติดตามข้อมูลราคาเหรียญยอดนิยม
 * ควรเรียกใช้งานตอนเริ่มต้นแอปพลิเคชัน
 */
async function initializePopularCryptoStreams() {
  try {
    logger.info(`Initializing Binance streams for ${POPULAR_CRYPTOS.length} popular cryptocurrencies`);
    
    // ใช้การสมัครสมาชิกแบบกลุ่มเพื่อประสิทธิภาพ
    const result = await binancePriceStreamService.subscribeToMultipleTickerStream(POPULAR_CRYPTOS);
    
    if (result.success) {
      logger.info(`Successfully subscribed to ${result.totalSymbols} popular cryptocurrency streams`);
    } else {
      logger.warn(`Failed to subscribe to some popular cryptocurrency streams: ${result.error || 'Unknown error'}`);
    }
    
    return result;
  } catch (error) {
    logger.error('Error initializing popular cryptocurrency streams:', error);
    return { success: false, error: error.message };
  }
}

/**
 * ตรวจสอบสถานะการเชื่อมต่อของสตรีมข้อมูลราคา
 * @returns {Object} สถานะการเชื่อมต่อ
 */
function getStreamStatus() {
  return binancePriceStreamService.getConnectionStatus();
}

module.exports = {
  initializePopularCryptoStreams,
  getStreamStatus,
  POPULAR_CRYPTOS
};
