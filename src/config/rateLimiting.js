/**
 * กำหนดค่าการจำกัดอัตราการเรียก API (Rate Limiting)
 * สามารถปรับแต่งได้ตามความต้องการหรือข้อจำกัดของ API
 */

module.exports = {
  // CoinGecko API
  coingecko: {
    maxRequests: 10,         // จำนวนคำขอสูงสุดใน timeWindow
    timeWindowMs: 60 * 1000, // 1 นาที
    retryAfterMs: 2000,      // ระยะเวลาก่อนลองใหม่ 2 วินาที (จะใช้ exponential backoff)
  },
  
  // Binance API
  binance: {
    maxRequests: 900,        // Binance อนุญาตให้ทำ 1200 คำขอต่อนาที (เราใช้แค่ 900 เพื่อความปลอดภัย)
    timeWindowMs: 60 * 1000, // 1 นาที
    retryAfterMs: 1000,      // ระยะเวลาก่อนลองใหม่ 1 วินาที
  },
  
  // CoinMarketCap API
  coinmarketcap: {
    maxRequests: 25,         // ค่าที่ปลอดภัยสำหรับ Basic plan (30 คำขอต่อนาที)
    timeWindowMs: 60 * 1000, // 1 นาที
    retryAfterMs: 2000,      // ระยะเวลาก่อนลองใหม่ 2 วินาที
  },
  
  // ค่าทั่วไป
  general: {
    maxRetries: 3,           // จำนวนครั้งสูงสุดที่จะลองใหม่
    backoffMultiplier: 2,    // ตัวคูณสำหรับ exponential backoff
    logRateLimitEvents: true // บันทึกเหตุการณ์เมื่อถึงขีดจำกัด
  }
};
