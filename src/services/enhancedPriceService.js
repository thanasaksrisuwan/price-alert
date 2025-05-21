/**
 * บริการเสริมข้อมูลราคา
 * ใช้สำหรับเพิ่มข้อมูลที่ขาดหายไปจาก API หลัก (เช่น market cap จาก Binance)
 */

const logger = require('../utils/logger').createModuleLogger('EnhancedPriceService');
const PriceService = require('./priceService');
const redis = require('../config/redis');

// ระยะเวลาที่ข้อมูลใน cache จะหมดอายุ (วินาที)
const MARKET_CAP_CACHE_EXPIRY = 3600; // 1 ชั่วโมง เพราะไม่เปลี่ยนแปลงบ่อย

/**
 * เสริมข้อมูล market cap สำหรับผลลัพธ์จาก Binance
 * @param {object} priceData - ข้อมูลราคาจาก Binance หรือ API อื่นๆ
 * @param {string} symbol - สัญลักษณ์เหรียญ
 * @param {string} currency - สกุลเงิน
 * @returns {Promise<object>} - ข้อมูลราคาที่เพิ่มเติมแล้ว
 */
async function enhancePriceData(priceData, symbol, currency) {
  try {
    // ถ้ามี market cap อยู่แล้วและไม่ใช่ 0 ไม่ต้องทำอะไร
    if (priceData.marketCap && priceData.marketCap > 0) {
      return priceData;
    }

    // ตรวจสอบ cache ก่อน
    const cacheKey = `marketcap:${symbol}:${currency}`;
    const cachedMarketCap = await redis.get(cacheKey);

    if (cachedMarketCap) {
      logger.debug(`Retrieved market cap for ${symbol} from cache: ${cachedMarketCap}`);
      priceData.marketCap = parseFloat(cachedMarketCap);
      return priceData;
    }

    // ลองดึงจาก CoinGecko
    try {
      logger.debug(`Fetching market cap for ${symbol} from CoinGecko`);
      const geckoData = await PriceService.getPriceFromCoinGecko(symbol, currency);
      
      if (geckoData && geckoData.marketCap && geckoData.marketCap > 0) {
        // บันทึก market cap ใน cache
        await redis.set(cacheKey, geckoData.marketCap.toString(), MARKET_CAP_CACHE_EXPIRY);
        
        // เพิ่มใน priceData
        priceData.marketCap = geckoData.marketCap;
        return priceData;
      }
    } catch (geckoError) {
      logger.warn(`Failed to get market cap from CoinGecko for ${symbol}: ${geckoError.message}`);
    }

    // ถ้า CoinGecko ล้มเหลว ลองดึงจาก CoinMarketCap
    try {
      logger.debug(`Fetching market cap for ${symbol} from CoinMarketCap`);
      const cmcData = await PriceService.getPriceFromCoinMarketCap(symbol, currency);
      
      if (cmcData && cmcData.marketCap && cmcData.marketCap > 0) {
        // บันทึก market cap ใน cache
        await redis.set(cacheKey, cmcData.marketCap.toString(), MARKET_CAP_CACHE_EXPIRY);
        
        // เพิ่มใน priceData
        priceData.marketCap = cmcData.marketCap;
        return priceData;
      }
    } catch (cmcError) {
      logger.warn(`Failed to get market cap from CoinMarketCap for ${symbol}: ${cmcError.message}`);
    }

    // ถ้าทั้งหมดล้มเหลว ส่งคืนข้อมูลเดิม
    return priceData;
  } catch (error) {
    logger.error(`Error enhancing price data for ${symbol}:`, error);
    return priceData; // ส่งคืนข้อมูลเดิมหากมีข้อผิดพลาด
  }
}

module.exports = {
  enhancePriceData
};
