/**
 * ระบบจัดการข้อจำกัดในการเรียก API (Rate Limiting)
 * ป้องกันการส่งคำขอมากเกินไปในเวลาที่กำหนด
 */

const logger = require('./logger').createModuleLogger('RateLimiter');
const rateLimitConfig = require('../config/rateLimiting');

/**
 * ตัวจัดการข้อจำกัดอัตราการเรียกใช้ API
 * ใช้สำหรับป้องกันไม่ให้ส่งคำขอมากเกินไปยัง API ภายนอกในช่วงเวลาที่กำหนด
 */
class RateLimiter {
  /**
   * สร้างตัวจัดการข้อจำกัดอัตราการเรียกใช้ API ใหม่
   * @param {string} name - ชื่อของ rate limiter (เช่น "coingecko", "binance")
   * @param {number} maxRequests - จำนวนคำขอสูงสุดที่อนุญาตในช่วงเวลา
   * @param {number} timeWindowMs - ช่วงเวลาในหน่วยมิลลิวินาที (เช่น 60000 สำหรับ 1 นาที)
   * @param {number} retryAfterMs - ระยะเวลารอก่อนลอง retry เมื่อเกินข้อจำกัด (มิลลิวินาที)
   */
  constructor(name, maxRequests, timeWindowMs, retryAfterMs = 1000) {
    this.name = name;
    this.maxRequests = maxRequests;
    this.timeWindowMs = timeWindowMs;
    this.retryAfterMs = retryAfterMs;
    this.requestTimestamps = [];
    this.retryQueue = [];
    this.isProcessingQueue = false;
    
    logger.info(`Created rate limiter for ${name}: ${maxRequests} requests per ${timeWindowMs}ms`);
  }
  
  /**
   * ตรวจสอบว่าสามารถทำคำขอได้หรือไม่ภายใต้ข้อจำกัด
   * @returns {boolean} - true ถ้าสามารถทำคำขอได้
   */
  canMakeRequest() {
    const now = Date.now();
    this._removeExpiredTimestamps(now);
    return this.requestTimestamps.length < this.maxRequests;
  }
  
  /**
   * ลบเวลาคำขอที่หมดอายุแล้ว (เก่ากว่าหน้าต่างเวลาที่กำหนด)
   * @param {number} now - เวลาปัจจุบันในหน่วยมิลลิวินาที
   * @private
   */
  _removeExpiredTimestamps(now) {
    const windowStart = now - this.timeWindowMs;
    // คงไว้เฉพาะ timestamps ที่อยู่ในช่วงเวลา
    this.requestTimestamps = this.requestTimestamps.filter(timestamp => timestamp > windowStart);
  }
  
  /**
   * เพิ่มคำขอใหม่และแจ้งว่าได้รับอนุญาตหรือไม่
   * @returns {boolean} - true ถ้าคำขอได้รับอนุญาต
   */
  addRequest() {
    const now = Date.now();
    this._removeExpiredTimestamps(now);
    
    if (this.requestTimestamps.length < this.maxRequests) {
      this.requestTimestamps.push(now);
      return true;
    }
    
    return false;
  }
    /**
   * ดำเนินการฟังก์ชันภายใต้การจำกัดอัตราการเรียกใช้
   * ถ้าเกินขีดจำกัด จะลองใหม่โดยอัตโนมัติหลังจากระยะเวลาที่กำหนด
   * @param {Function} fn - ฟังก์ชันที่ต้องการดำเนินการ (Promise)
   * @param {number} maxRetries - จำนวนครั้งสูงสุดที่จะลองใหม่
   * @returns {Promise<any>} - ผลลัพธ์ของฟังก์ชัน
   */
  async executeWithRateLimiting(fn, maxRetries = rateLimitConfig.general.maxRetries) {
    // ตรวจสอบว่าสามารถทำคำขอได้หรือไม่
    if (this.addRequest()) {
      try {
        return await fn();
      } catch (error) {        // ตรวจสอบว่าเป็นข้อผิดพลาดจาก rate limit หรือไม่ (HTTP 429)
        if (error.response && error.response.status === 429) {
          if (rateLimitConfig.general.logRateLimitEvents) {
            logger.warn(`Rate limit hit for ${this.name} API (429 response): ${error.message}`);
          }
          
          // ถ้ายังลองได้ ให้เพิ่มเข้าคิวและลองใหม่
          if (maxRetries > 0) {
            return this._retryAfterDelay(fn, maxRetries);
          }
        }
        throw error;
      }    } else {
      if (rateLimitConfig.general.logRateLimitEvents) {
        logger.warn(`Rate limit preventive trigger for ${this.name} API`);
      }
      
      // ถ้ายังลองได้ ให้เพิ่มเข้าคิวและลองใหม่
      if (maxRetries > 0) {
        return this._retryAfterDelay(fn, maxRetries);
      }
      
      throw new Error(`Rate limit exceeded for ${this.name} API`);
    }
  }
    /**
   * ลองดำเนินการฟังก์ชันใหม่หลังจากระยะเวลาที่กำหนด
   * @param {Function} fn - ฟังก์ชันที่ต้องการดำเนินการ (Promise)
   * @param {number} remainingRetries - จำนวนครั้งที่เหลือสำหรับการลองใหม่
   * @returns {Promise<any>} - ผลลัพธ์ของฟังก์ชัน
   * @private
   */
  async _retryAfterDelay(fn, remainingRetries) {
    const maxRetries = rateLimitConfig.general.maxRetries;
    const backoffMultiplier = rateLimitConfig.general.backoffMultiplier;
    
    // เพิ่มระยะเวลารอแบบ exponential backoff
    const delay = this.retryAfterMs * (Math.pow(backoffMultiplier, (maxRetries - remainingRetries)));
    logger.info(`Retrying ${this.name} API call after ${delay}ms (${remainingRetries} retries left)`);
    
    // รอตามเวลาที่กำหนดก่อนลองใหม่
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // ลองใหม่ด้วยจำนวนครั้งที่ลดลง
    return this.executeWithRateLimiting(fn, remainingRetries - 1);
  }
  
  /**
   * รีเซ็ตสถานะของตัวจำกัดอัตราการเรียกใช้
   */
  reset() {
    this.requestTimestamps = [];
  }
}

// สร้าง rate limiter สำหรับบริการต่างๆ โดยใช้ค่าจากไฟล์กำหนดค่า
// CoinGecko: ฟรี tier อนุญาต 10-30 คำขอต่อนาที (ขึ้นอยู่กับ endpoint)
const coingeckoRateLimiter = new RateLimiter(
  'coingecko', 
  rateLimitConfig.coingecko.maxRequests, 
  rateLimitConfig.coingecko.timeWindowMs, 
  rateLimitConfig.coingecko.retryAfterMs
);

// Binance: อนุญาต 1200 คำขอต่อนาที (สำหรับการใช้งาน IP ปกติ, ไม่ใช้ API key)
const binanceRateLimiter = new RateLimiter(
  'binance', 
  rateLimitConfig.binance.maxRequests, 
  rateLimitConfig.binance.timeWindowMs,
  rateLimitConfig.binance.retryAfterMs
);

// CoinMarketCap: อนุญาต 30 คำขอต่อนาที (basic plan)
const coinmarketcapRateLimiter = new RateLimiter(
  'coinmarketcap', 
  rateLimitConfig.coinmarketcap.maxRequests, 
  rateLimitConfig.coinmarketcap.timeWindowMs,
  rateLimitConfig.coinmarketcap.retryAfterMs
);

module.exports = {
  coingeckoRateLimiter,
  binanceRateLimiter,
  coinmarketcapRateLimiter
};
