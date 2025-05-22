/**
 * คอนโทรลเลอร์จัดการราคาคริปโต
 * ไฟล์นี้จัดการการดึงและแสดงข้อมูลราคาเหรียญคริปโต
 */

const logger = require('../utils/logger').createModuleLogger('PriceController');
const { isValidCryptoSymbol } = require('../utils/validators');
const PriceService = require('../services/priceService');
const EnhancedPriceService = require('../services/enhancedPriceService');
const UserModel = require('../models/user');

/**
 * จัดการคำสั่ง /price <symbol> - แสดงราคาปัจจุบันของเหรียญ
 * @param {object} ctx - Telegraf context
 */
async function handlePriceCommand(ctx) {
  try {
    // รับพารามิเตอร์จากข้อความ
    const params = ctx.message.text.split(' ').filter(Boolean);
    
    if (params.length < 2) {
      return ctx.reply('กรุณาระบุสัญลักษณ์เหรียญ เช่น /price BTC');
    }
    
    const symbol = params[1].toUpperCase();
    
    // ตรวจสอบความถูกต้องของสัญลักษณ์
    if (!isValidCryptoSymbol(symbol)) {
      return ctx.reply(`สัญลักษณ์เหรียญไม่ถูกต้อง: ${symbol}`);
    }
    
    // ดึงข้อมูลผู้ใช้เพื่อเลือกสกุลเงินที่ต้องการแสดง
    const telegramId = ctx.from.id;
    const user = await UserModel.findUserByTelegramId(telegramId);
    const currency = user?.default_currency || 'THB';
    
    // เริ่มแสดงการโหลดข้อมูล
    const loadingMessage = await ctx.reply(`กำลังค้นหาราคา ${symbol}...`);
      
    try {
      // ดึงข้อมูลราคา
      let priceData = await PriceService.getPrice(symbol, currency);
      
      if (!priceData) {
        await ctx.telegram.editMessageText(
          ctx.chat.id, 
          loadingMessage.message_id, 
          null, 
          `ไม่พบข้อมูลราคาสำหรับ ${symbol}`
        );
        return;
      }
      
      // เสริมข้อมูล market cap ถ้าจำเป็น
      priceData = await EnhancedPriceService.enhancePriceData(priceData, symbol, currency);
      
      // สร้างข้อความแสดงราคาและข้อมูลเพิ่มเติม
      const message = formatPriceMessage(priceData, symbol, currency);
      
      // อัพเดตข้อความจากกำลังโหลดเป็นข้อมูลราคา
      await ctx.telegram.editMessageText(
        ctx.chat.id, 
        loadingMessage.message_id, 
        null, 
        message,
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );
      
      logger.info(`Price data fetched for ${symbol} by user ${telegramId}`);
    } catch (error) {
      logger.error(`Error fetching price data for ${symbol}:`, error);
      
      ctx.reply('เกิดข้อผิดพลาดในการดึงข้อมูลราคา โปรดลองอีกครั้งในภายหลัง');
    }
  } catch (error) {
    logger.error('Error in handlePriceCommand:', error);
    ctx.reply('เกิดข้อผิดพลาดในการดึงข้อมูลราคา โปรดลองอีกครั้งในภายหลัง');
  }
}

/**
 * จัดรูปแบบข้อความแสดงราคา
 * @param {object} priceData - ข้อมูลราคาและรายละเอียดเหรียญ
 * @param {string} symbol - สัญลักษณ์เหรียญ
 * @param {string} currency - สกุลเงินที่ใช้แสดงราคา
 * @returns {string} - ข้อความที่จัดรูปแบบแล้ว
 */
function formatPriceMessage(priceData, symbol, currency) {
  // ใช้ destructuring พร้อมกำหนดค่าเริ่มต้นเพื่อลดการเขียนโค้ดซ้ำซ้อน
  const {
    price = 0,
    priceChange24h = 0,
    priceChangePercentage24h = 0,
    marketCap = 0,
    volume24h = 0,
    high24h = 0,
    low24h = 0,
    lastUpdated = new Date(),
    name = symbol,
    imageUrl = null
  } = priceData || {};
  
  // สร้างตัวบ่งชี้แนวโน้มราคา
  const trendIndicator = priceChangePercentage24h >= 0 ? '🟢' : '🔴';
  const changePrefix = priceChangePercentage24h >= 0 ? '+' : '';
  
  // จัดรูปแบบข้อมูลต่างๆ - ดึงจากฟังก์ชัน helper
  const formattedValues = {
    price: formatCurrency(price, currency),
    marketCap: formatCurrency(marketCap, currency, true),
    volume: formatCurrency(volume24h, currency, true),
    high: formatCurrency(high24h, currency),
    low: formatCurrency(low24h, currency),
    change: `${changePrefix}${priceChangePercentage24h.toFixed(2)}%`,
    priceChange: formatCurrency(priceChange24h, currency),
    dateTime: formatDateTime(lastUpdated)
  };
  
  // สร้างข้อความ - แยกเป็น template literals เพื่อให้อ่านง่าย
  return `
${trendIndicator} *${name} (${symbol})* ${trendIndicator}

💰 *ราคา:* ${formattedValues.price}
📈 *เปลี่ยนแปลง (24ชม):* ${formattedValues.change} (${formattedValues.priceChange})
〽️ *สูงสุด/ต่ำสุด (24ชม):* ${formattedValues.high} / ${formattedValues.low}
💹 *มูลค่าตลาด:* ${formattedValues.marketCap}
📊 *ปริมาณซื้อขาย (24ชม):* ${formattedValues.volume}
🕒 *อัพเดตเมื่อ:* ${formattedValues.dateTime}

*ตั้งการแจ้งเตือนราคา:*
/alert ${symbol} above [ราคา] - แจ้งเตือนเมื่อราคาสูงกว่า
/alert ${symbol} below [ราคา] - แจ้งเตือนเมื่อราคาต่ำกว่า
`;
}

/**
 * จัดรูปแบบค่าเงิน
 * @param {number} value - มูลค่าที่ต้องการจัดรูปแบบ
 * @param {string} currency - สกุลเงิน
 * @param {boolean} [compact=false] - จัดรูปแบบแบบย่อหรือไม่
 * @returns {string} - ค่าเงินที่จัดรูปแบบแล้ว
 */
function formatCurrency(value, currency, compact = false) {
  // ตรวจสอบค่า null หรือ undefined
  if (value === null || value === undefined) {
    logger.warn(`Attempted to format undefined or null value as currency: ${currency}`);
    return `${getCurrencySymbol(currency)}0.00`;
  }
  
  const currencySymbol = getCurrencySymbol(currency);
  const isThaiCurrency = currency === 'THB';
  
  // Handle compact formatting first
  if (compact) {
    let formattedValue;
    let suffix = '';
    
    if (value >= 1e9) {
      formattedValue = (value / 1e9).toFixed(2);
      suffix = 'B';
    } else if (value >= 1e6) {
      formattedValue = (value / 1e6).toFixed(2);
      suffix = 'M';
    } else if (value >= 1e3) {
      formattedValue = (value / 1e3).toFixed(2);
      suffix = 'K';
    } else {
      // If not large enough for compact format, use standard format
      return formatCurrency(value, currency, false);
    }
    
    // Apply correct symbol position based on currency
    return isThaiCurrency 
      ? `${formattedValue}${suffix} ${currencySymbol}`
      : `${currencySymbol}${formattedValue}${suffix}`;
  }
  
  // Standard formatting (non-compact)
  const locale = isThaiCurrency ? 'th-TH' : undefined;
  const decimalPlaces = value < 1 ? 8 : 2;
  
  const formattedNumber = value.toLocaleString(locale, {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces
  });
  
  // Apply correct symbol position based on currency
  return isThaiCurrency
    ? `${formattedNumber} ${currencySymbol}`
    : `${currencySymbol}${formattedNumber}`;
}

/**
 * รับสัญลักษณ์สกุลเงิน - ใช้เทคนิค memoization เพื่อเพิ่มประสิทธิภาพ
 * @param {string} currency - รหัสสกุลเงิน
 * @returns {string} - สัญลักษณ์สกุลเงิน
 */
const getCurrencySymbol = (function() {
  // Create a cache object inside the closure
  const symbolCache = {};
  
  // Define the currency symbols mapping
  const symbols = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    THB: '฿',
    BTC: '₿'
  };
  
  // Return the actual function with memoization
  return function(currency) {
    // Return from cache if the symbol was already requested before
    if (currency in symbolCache) {
      return symbolCache[currency];
    }
    
    // Calculate and cache the result
    const symbol = symbols[currency] || `${currency} `;
    symbolCache[currency] = symbol;
    
    return symbol;
  };
})();

/**
 * จัดรูปแบบวันที่และเวลา
 * @param {string|Date} dateTime - วันที่และเวลา
 * @param {string} [locale=undefined] - รหัสภาษา (เช่น th-TH สำหรับไทย)
 * @returns {string} - วันที่และเวลาที่จัดรูปแบบแล้ว
 */
function formatDateTime(dateTime, locale) {
  if (!dateTime) {
    return '(ไม่มีข้อมูล)';
  }
  
  try {
    const date = new Date(dateTime);
    
    // ตรวจสอบว่าวันที่ถูกต้องหรือไม่
    if (isNaN(date.getTime())) {
      return '(วันที่ไม่ถูกต้อง)';
    }
    
    // ใช้ตัวเลือกการจัดรูปแบบที่เหมาะสม
    return date.toLocaleString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (error) {
    logger.error('Error formatting date:', error);
    return '(ไม่สามารถแสดงวันที่ได้)';
  }
}

module.exports = {
  handlePriceCommand,
  // Export for testing
  __testExports: {
    formatCurrency,
    getCurrencySymbol,
    formatPriceMessage,
    formatDateTime
  }
};
